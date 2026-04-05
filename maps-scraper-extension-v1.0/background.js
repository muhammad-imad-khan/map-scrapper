// ═══════════════════════════════════════════════════════════
//  Maps Lead Scraper v2 — Background Service Worker
//  Monetization: SERVER-SIDE CREDIT SYSTEM (Paddle + Redis)
//  • New installs: 3 free starter credits (server-granted)
//  • Each scraped result costs 1 credit (server-deducted)
//  • 500 cr / $10 — emails + social media (Pro)
//  • 2500 cr / $25 — emails + social media (Enterprise)
//  • Each install has a unique installId (UUID) for RLS
// ═══════════════════════════════════════════════════════════

// ── CONFIG ───────────────────────────────────────────────────
const BACKEND_URL = 'https://map-scraper-paddle-backend.vercel.app';

// ── Open welcome page on first install ───────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

const CREDIT_PACKS = [
    { id: 'pri_01kkwtx0kh2skzrzjbxgmgqngd', slug: 'pro',        label: 'Pro Pack',        credits: 500,  price: '$5', popular: true },
    { id: 'pri_enterprise_placeholder',      slug: 'enterprise',  label: 'Enterprise Pack',  credits: 2500, price: '$25', popular: false },
];
const COST_PER_RESULT = 1;

// ─────────────────────────────────────────────────────────

let state = {
  running: false, results: [], progress: 0, total: 0,
  status: 'idle', tabId: null, credits: 0
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function broadcast(type, payload = {}) {
  chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});
}

function waitForTab(tabId, timeout = 35000) {
  return new Promise(resolve => {
    let loading = false;
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(fn); resolve(false); }, timeout);
    function fn(id, info) {
      if (id !== tabId) return;
      if (info.status === 'loading') loading = true;
      if (info.status === 'complete' && loading) {
        clearTimeout(timer); chrome.tabs.onUpdated.removeListener(fn); resolve(true);
      }
    }
    chrome.tabs.onUpdated.addListener(fn);
  });
}

async function exec(tabId, fn, args = []) {
  try {
    const res = await chrome.scripting.executeScript({ target: { tabId }, func: fn, args });
    return res?.[0]?.result ?? null;
  } catch (e) {
    console.error('[exec] Script injection failed:', e.message, 'tabId:', tabId);
    return null;
  }
}

// ── Install ID (unique per browser install, used as RLS key) ──

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function getInstallId() {
  return new Promise(resolve => {
    chrome.storage.local.get(['installId'], data => {
      if (data.installId) {
        resolve(data.installId);
      } else {
        const id = generateUUID();
        chrome.storage.local.set({ installId: id });
        resolve(id);
      }
    });
  });
}

// ── Server-side credit operations ──────────────────────────

async function getCredits() {
  try {
    const installId = await getInstallId();
    const res = await fetch(`${BACKEND_URL}/api/credits?installId=${installId}`, {
      headers: { 'X-Install-Id': installId },
    });
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    // Cache locally for offline display
    await chrome.storage.local.set({
      credits: data.credits,
      expiresAt: data.expiresAt || null,
      expired: data.expired || false,
    });
    return data.credits;
  } catch {
    // Fallback to cached value if offline
    return new Promise(resolve => {
      chrome.storage.local.get(['credits'], d => resolve(d.credits || 0));
    });
  }
}

async function setCredits(n) {
  // Only update local cache — server is the source of truth
  const val = Math.max(0, n);
  await chrome.storage.local.set({ credits: val });
  broadcast('CREDITS_UPDATE', { credits: val });
  return val;
}

async function deductCredit() {
  try {
    const installId = await getInstallId();
    const res = await fetch(`${BACKEND_URL}/api/credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Install-Id': installId },
      body: JSON.stringify({ amount: COST_PER_RESULT }),
    });
    if (res.status === 402) return false; // Insufficient credits
    if (!res.ok) return false;
    const data = await res.json();
    await chrome.storage.local.set({ credits: data.credits });
    return true;
  } catch {
    return false;
  }
}

// ── License / credit pack redemption (kept for manual codes) ──

async function verifyLicense(key) {
  if (!key || key.length < 8) return false;
  try {
    const res = await fetch(`${BACKEND_URL}/api/verify-license`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ licenseKey: key }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.valid === true ? data : false;
  } catch {
    return false;
  }
}

async function redeemCode(code) {
  if (!code || code.length < 8) return { ok: false, msg: 'Invalid license key format.' };
  try {
    const result = await verifyLicense(code);
    if (!result || result === false) {
      return { ok: false, msg: 'License key not recognised or already used.' };
    }

    const amount = result.credits || 100;

    // Prevent double-use locally
    const usedCodes = await getUsedCodes();
    if (usedCodes.includes(code)) {
      return { ok: false, msg: 'This license key has already been activated on this browser.' };
    }
    usedCodes.push(code);
    await chrome.storage.local.set({ usedCodes });

    // Sync from server to get updated balance
    const newBal = await getCredits();
    return { ok: true, amount, newBalance: newBal, msg: `+${amount} credits added! (${result.label || 'Pack'})` };

  } catch (e) {
    console.error('[redeemCode]', e);
    return { ok: false, msg: 'Verification failed. Check your internet connection.' };
  }
}

async function getUsedCodes() {
  return new Promise(r => chrome.storage.local.get(['usedCodes'], d => r(d.usedCodes || [])));
}

// ── Message router ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {

      case 'START': {
        if (state.running) { sendResponse({ ok: false }); return; }
        const credits = await getCredits();
        if (credits < COST_PER_RESULT) {
          broadcast('NO_CREDITS', { credits, packs: CREDIT_PACKS });
          sendResponse({ ok: false, reason: 'no_credits' });
          return;
        }
        runScraper(msg.query, msg.max || 15, credits);
        sendResponse({ ok: true, credits });
        break;
      }

      case 'STOP': {
        state.running = false;
        if (state.tabId) { chrome.tabs.remove(state.tabId).catch(() => {}); state.tabId = null; }
        sendResponse({ ok: true });
        break;
      }

      case 'GET_STATE': {
        const credits = await getCredits();
        sendResponse({ ...state, credits, packs: CREDIT_PACKS, costPerResult: COST_PER_RESULT });
        break;
      }

      case 'GET_PACKS': {
        sendResponse({ packs: CREDIT_PACKS });
        break;
      }

      case 'OPEN_PACK': {
        const pack = CREDIT_PACKS.find(p => p.id === msg.packId);
        if (!pack) { sendResponse({ ok: false }); break; }
        const installId = await getInstallId().catch(() => '');
        // Open payment page directly with installId so credits get linked
        chrome.tabs.create({ url: `https://map-scrapper-five.vercel.app/payment/?pack=${pack.slug}&installId=${installId}` });
        sendResponse({ ok: true });
        break;
      }

      case 'REDEEM_CODE': {
        const result = await redeemCode(msg.code);
        sendResponse(result);
        break;
      }

      case 'OPEN_VIEWER': {
        // Re-download latest CSV and open viewer (from Export button)
        const vd = await new Promise(r => chrome.storage.local.get(['viewerData'], d => r(d.viewerData)));
        if (vd && vd.csv) {
          const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + vd.csv);
          await chrome.downloads.download({ url: dataUrl, filename: vd.filename || 'maps_leads.csv', saveAs: false });
          await chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html'), active: true });
        }
        sendResponse({ ok: true });
        break;
      }

      case 'SYNC_CREDITS': {
        // Poll server for latest credit balance (e.g., after purchase)
        const freshCredits = await getCredits();
        sendResponse({ ok: true, credits: freshCredits });
        break;
      }

      case 'GET_INSTALL_ID': {
        const iid = await getInstallId();
        sendResponse({ installId: iid });
        break;
      }

      case 'GET_HISTORY': {
        try {
          const installId = await getInstallId();
          const res = await fetch(`${BACKEND_URL}/api/credits?installId=${installId}&history=1`, {
            headers: { 'X-Install-Id': installId },
          });
          if (!res.ok) throw new Error('Server error');
          const data = await res.json();
          sendResponse({ ok: true, history: data.history || [], credits: data.credits });
        } catch {
          sendResponse({ ok: false, history: [] });
        }
        break;
      }
    }
  })();
  return true;
});

// ── Main scraper ───────────────────────────────────────────

async function runScraper(query, requestedMax, startCredits) {
  // Cap max by available credits
  const maxAffordable = Math.floor(startCredits / COST_PER_RESULT);
  const maxResults    = Math.min(requestedMax, maxAffordable);

  state = {
    running: true, results: [], progress: 0, total: 0,
    status: 'Opening Google Maps…', tabId: null,
    credits: startCredits
  };
  broadcast('STATE', state);

  try {
    // Open Maps tab
    const navReady = new Promise(resolve => {
      chrome.tabs.onCreated.addListener(function fn(tab) {
        chrome.tabs.onCreated.removeListener(fn);
        resolve(tab.id);
      });
    });
    await chrome.tabs.create({
      url: `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
      active: true
    });
    const tabId = await navReady;
    state.tabId = tabId;

    await waitForTab(tabId);
    await sleep(3000);

    // Dismiss consent / cookie dialogs (try multiple times)
    for (let c = 0; c < 3; c++) {
      const dismissed = await exec(tabId, () => {
        // Google consent dialog
        const accept = document.querySelector('button[aria-label*="Accept all"]')
          || document.querySelector('form[action*="consent"] button')
          || document.querySelector('button[jsname="b3VHJd"]');
        if (accept) { accept.click(); return 'consent'; }
        // Cookie banner
        const cookie = document.querySelector('[aria-label*="cookie"] button, .cookie-consent button');
        if (cookie) { cookie.click(); return 'cookie'; }
        return null;
      });
      if (dismissed) { await sleep(1500); } else { break; }
    }
    await sleep(1500);

    // Wait for results to actually appear in the DOM (up to 15s)
    state.status = 'Waiting for Maps results to load…';
    broadcast('STATE', state);

    // Test that script injection works at all
    const canExec = await exec(tabId, () => 'ping');
    console.log('[Scraper] exec test:', canExec);
    if (canExec !== 'ping') {
      // Script injection failed — try getting tab info
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      console.error('[Scraper] Cannot inject scripts. Tab URL:', tab?.url, 'Status:', tab?.status);
      throw new Error('Cannot access Google Maps page. Check extension permissions.');
    }

    // Log the actual page URL for debugging
    const pageUrl = await exec(tabId, () => location.href);
    console.log('[Scraper] Maps page URL:', pageUrl);

    let hasResults = false;
    for (let w = 0; w < 10; w++) {
      hasResults = await exec(tabId, () => {
        return document.querySelectorAll('a[href*="/maps/place/"], a.hfpxzc').length > 0;
      });
      console.log('[Scraper] hasResults check', w, ':', hasResults);
      if (hasResults) break;
      await sleep(1500);
    }

    // Collect listing URLs
    state.status = 'Collecting listings from results…';
    broadcast('STATE', state);
    const urls = await collectUrls(tabId, maxResults);
    state.total = urls.length;
    if (!urls.length) {
      // Get diagnostic info
      const diag = await exec(tabId, () => ({
        url: location.href,
        title: document.title,
        bodyLen: document.body?.innerHTML?.length || 0,
        allLinks: document.querySelectorAll('a').length,
        placeLinks: document.querySelectorAll('a[href*="/maps/place/"]').length,
        hfpxzc: document.querySelectorAll('a.hfpxzc').length,
        feeds: document.querySelectorAll('div[role="feed"]').length,
      }));
      console.error('[Scraper] No listings. Diagnostics:', JSON.stringify(diag));
      throw new Error('No listings found. Try a different query.');
    }

    broadcast('STATE', { ...state, status: `Found ${urls.length} listings. Starting…` });
    await sleep(400);

    // Scrape each listing
    for (let i = 0; i < urls.length; i++) {
      if (!state.running) break;

      // Check credits before each scrape
      const currentCredits = await getCredits();
      if (currentCredits < COST_PER_RESULT) {
        broadcast('NO_CREDITS', { credits: currentCredits, packs: CREDIT_PACKS, mid: true, scraped: state.results.length });
        break;
      }

      state.progress = i + 1;
      state.status = `[${currentCredits} cr] Extracting ${i + 1} / ${urls.length}…`;
      broadcast('STATE', state);

      try {
        await chrome.tabs.update(tabId, { url: urls[i] });
        await waitForTab(tabId);
        await sleep(2800);

        const data = await exec(tabId, extractDetails);
        if (!data) continue;

        // Deduct credit for successful extraction
        const deducted = await deductCredit();
        if (!deducted) {
          broadcast('NO_CREDITS', { credits: 0, packs: CREDIT_PACKS, mid: true });
          break;
        }

        // Fetch email + socials from business website
        if (data.website && data.website !== 'N/A') {
            state.status = `Finding email for "${data.name}"…`;
            broadcast('STATE', state);
            const webData = await fetchWebsiteData(data.website, true);
            data.email = webData.email;
            data.socials = webData.socials;
        }

        const newCredits = await getCredits();
        state.results.push(data);
        broadcast('RESULT', { result: data, count: state.results.length, credits: newCredits });

      } catch (e) { console.warn('Listing error:', e); }
    }

    chrome.tabs.remove(state.tabId).catch(() => {});
    const finalCredits = await getCredits();
    state.running = false; state.tabId = null; state.credits = finalCredits;
    state.status = `Done — ${state.results.length} listings. ${finalCredits} credits remaining.`;

    // ── Auto-export CSV + open viewer tab ──
    if (state.results.length > 0) {
      await autoExportAndView(state.results, query);
    }

    broadcast('DONE', { ...state });

  } catch (e) {
    if (state.tabId) chrome.tabs.remove(state.tabId).catch(() => {});
    state.running = false; state.tabId = null;
    state.status = 'Error: ' + e.message;
    broadcast('ERROR', { msg: e.message });
  }
}

// ── URL Collector ──────────────────────────────────────────

async function collectUrls(tabId, max) {
  const seen = new Set();
  let att = 0;
  const maxAttempts = Math.min(max * 3, 60); // scale with requested results
  while (seen.size < max && att < maxAttempts) {
    const found = await exec(tabId, () => {
      // Try multiple selectors — Google Maps changes DOM frequently
      const links = [
        ...document.querySelectorAll('a[href*="/maps/place/"]'),
        ...document.querySelectorAll('a.hfpxzc'),
        ...document.querySelectorAll('div[role="feed"] a[href*="google.com/maps"]'),
      ];
      return [...new Set(links.map(a => a.href))].filter(h => h.includes('/maps/place/') || h.includes('!3d'));
    });
    if (found) found.forEach(u => { if (seen.size < max) seen.add(u); });
    if (seen.size >= max) break;
    const scrolled = await exec(tabId, () => {
      // Try multiple scroll containers
      const feed = document.querySelector('div[role="feed"]')
        || document.querySelector('div[role="main"] div.m6QErb[aria-label]')
        || document.querySelector('div.m6QErb.DxyBCb');
      if (feed) { feed.scrollBy(0, 800); return true; }
      // Fallback: scroll the results panel
      const panel = document.querySelector('div[role="main"]');
      if (panel) { panel.scrollBy(0, 800); return true; }
      return false;
    });
    await sleep(scrolled ? 1800 : 2500);
    att++;
  }
  return [...seen].slice(0, max);
}

// ── Detail extractor (injected into Maps page) ─────────────

function extractDetails() {
  const $ = s => document.querySelector(s);
  const name    = $('h1')?.textContent?.trim() || 'N/A';
  const rating  = $('div.F7nice span[aria-hidden="true"]')?.textContent?.trim() || 'N/A';
  const website = $('a[data-item-id="authority"]')?.href || 'N/A';
  const rawPh   = $('button[data-item-id^="phone:tel:"]')?.getAttribute('data-item-id') || '';
  const phone   = rawPh.replace('phone:tel:', '').trim() || 'N/A';
  const address = $('button[data-item-id="address"]')?.textContent?.trim() || 'N/A';
  const category= $('button.DkEaL')?.textContent?.trim() || 'N/A';
  let hours = 'N/A';
  const rows = [...document.querySelectorAll('table.eK4R0e tr')];
  if (rows.length) {
    hours = rows.map(r => [...r.querySelectorAll('td')].map(c => c.textContent.trim()).join(': ')).filter(Boolean).join(' | ');
  } else {
    const el = $('[data-item-id="oh"]');
    if (el) hours = el.textContent.trim().replace(/\s+/g, ' ');
  }
  return { name, rating, website, email: 'N/A', phone, address, hours, category, socials: 'N/A' };
}

// ── Website data fetcher (email + social media) ────────────

async function fetchWebsiteData(url, includeSocials) {
  const BL = ['example','domain','sentry','wixpress','schema','noreply','@2x','.png','.jpg','.svg'];
  const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const SOCIAL_PATTERNS = [
    { name: 'facebook',  re: /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>)]+/gi },
    { name: 'instagram', re: /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>)]+/gi },
    { name: 'twitter',   re: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[^\s"'<>)]+/gi },
    { name: 'linkedin',  re: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^\s"'<>)]+/gi },
    { name: 'youtube',   re: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/)[^\s"'<>)]+/gi },
    { name: 'tiktok',    re: /https?:\/\/(?:www\.)?tiktok\.com\/@[^\s"'<>)]+/gi },
  ];

  function extractFromHtml(html) {
    let email = 'N/A';
    const emails = html.match(emailRe) || [];
    const validEmail = emails.find(e => !BL.some(b => e.toLowerCase().includes(b)));
    if (validEmail) email = validEmail;

    let socials = 'N/A';
    if (includeSocials) {
      const found = [];
      for (const sp of SOCIAL_PATTERNS) {
        const matches = html.match(sp.re);
        if (matches && matches.length) {
          // Take the first unique match, clean trailing slashes/fragments
          const cleaned = matches[0].replace(/[/]+$/, '').split('?')[0].split('#')[0];
          found.push(cleaned);
        }
      }
      if (found.length) socials = found.join(' | ');
    }
    return { email, socials };
  }

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 9000);

    const res  = await fetch(url, { signal: ctrl.signal });
    const html = await res.text();
    const result = extractFromHtml(html);

    // If email not found on main page, try /contact
    if (result.email === 'N/A') {
      try {
        const cr = await fetch(new URL(url).origin + '/contact', { signal: ctrl.signal });
        const ch = await cr.text();
        const contactResult = extractFromHtml(ch);
        if (contactResult.email !== 'N/A') result.email = contactResult.email;
        // Merge socials from contact page too
        if (includeSocials && contactResult.socials !== 'N/A') {
          if (result.socials === 'N/A') result.socials = contactResult.socials;
          else {
            const existing = new Set(result.socials.split(' | '));
            contactResult.socials.split(' | ').forEach(s => existing.add(s));
            result.socials = [...existing].join(' | ');
          }
        }
      } catch {}
    }
    return result;
  } catch {
    return { email: 'N/A', socials: 'N/A' };
  }
}

// ── Auto Export & Open Viewer ──────────────────────────────

function resultsToCSV(rows) {
  const COLS  = ['Name','Website','Email','Social Media','Rating','Opening Hours','Phone','Address','Category'];
  const FIELD = { Name:'name',Website:'website',Email:'email','Social Media':'socials',Rating:'rating',
                  'Opening Hours':'hours',Phone:'phone',Address:'address',Category:'category' };
  const escape = v => `"${String(v||'N/A').replace(/"/g,'""')}"`;
  return [
    COLS.join(','),
    ...rows.map(r => COLS.map(c => escape(r[FIELD[c]])).join(','))
  ].join('\r\n');
}

async function autoExportAndView(results, query) {
  try {
    const csv       = resultsToCSV(results);
    const timestamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    const safeQuery = query.replace(/[^\w\s-]/g,'').trim().replace(/\s+/g,'_').slice(0,40);
    const filename  = `maps_leads_${safeQuery}_${timestamp}.csv`;

    // 1. Save CSV string + metadata to storage so viewer.html can read it
    await chrome.storage.local.set({
      viewerData: {
        csv,
        filename,
        query,
        count:   results.length,
        savedAt: Date.now(),
        results  // also store raw for viewer table
      }
    });

    // 2. Auto-download to Downloads folder
    const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + csv);
    await chrome.downloads.download({
      url:      dataUrl,
      filename: filename,
      saveAs:   false    // silent — goes straight to Downloads
    });

    // 3. Open viewer tab
    await chrome.tabs.create({
      url:    chrome.runtime.getURL('viewer.html'),
      active: true
    });

  } catch (e) {
    console.warn('[AutoExport] Error:', e);
    // Don't block — DONE still fires even if export fails
  }
}
