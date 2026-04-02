// ═══════════════════════════════════════════════════════════
//  Maps Lead Scraper v2 — Background Service Worker
//  Monetization: SERVER-SIDE CREDIT SYSTEM (Paddle + Redis)
//  • New installs: 25 free starter credits (server-granted)
//  • Each scraped result costs 1 credit (server-deducted)
//  • Packs: $5 for 500 credits (one-time, expires in 7 days)
//  • Each install has a unique installId (UUID) for RLS
// ═══════════════════════════════════════════════════════════

// ── CONFIG ───────────────────────────────────────────────────
const BACKEND_URL = 'https://map-scraper-paddle-backend.vercel.app';

const CREDIT_PACKS = [
    { id: 'pri_01kkwtx0kh2skzrzjbxgmgqngd', label: '500 Credits', credits: 500, price: '$5', popular: true },
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
  } catch { return null; }
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
        // Create a Paddle hosted checkout session via backend
        const pack = CREDIT_PACKS.find(p => p.id === msg.packId);
        if (!pack) { sendResponse({ ok: false }); break; }
        try {
          const installId = await getInstallId();
          const res  = await fetch(`${BACKEND_URL}/api/checkout`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ priceId: pack.id, installId }),
          });
          const data = await res.json();
          if (data.checkoutUrl) {
            chrome.tabs.create({ url: data.checkoutUrl });
          } else {
            chrome.tabs.create({ url: `https://map-scrapper-five.vercel.app/payment/?pack=${pack.id}&installId=${installId}` });
          }
        } catch {
          const installId = await getInstallId().catch(() => '');
          chrome.tabs.create({ url: `https://map-scrapper-five.vercel.app/payment/?pack=${pack.id}&installId=${installId}` });
        }
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
      active: false
    });
    const tabId = await navReady;
    state.tabId = tabId;

    await waitForTab(tabId);
    await sleep(3500);

    // Dismiss consent dialog
    await exec(tabId, () => {
      const btn = document.querySelector('button[aria-label*="Accept all"], form[action*="consent"] button');
      if (btn) btn.click();
    });
    await sleep(600);

    // Collect listing URLs
    state.status = 'Collecting listings from results…';
    broadcast('STATE', state);
    const urls = await collectUrls(tabId, maxResults);
    state.total = urls.length;
    if (!urls.length) throw new Error('No listings found. Try a different query.');

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

        // Fetch email from business website
        if (data.website && data.website !== 'N/A') {
          state.status = `Finding email for "${data.name}"…`;
          broadcast('STATE', state);
          data.email = await fetchEmail(data.website);
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
  while (seen.size < max && att < 40) {
    const found = await exec(tabId, () =>
      [...document.querySelectorAll('a[href*="/maps/place/"]')]
        .map(a => a.href).filter(h => h.includes('/maps/place/'))
    );
    if (found) found.forEach(u => { if (seen.size < max) seen.add(u); });
    if (seen.size >= max) break;
    const scrolled = await exec(tabId, () => {
      const f = document.querySelector('div[role="feed"]');
      if (f) { f.scrollBy(0, 800); return true; } return false;
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
  return { name, rating, website, email: 'N/A', phone, address, hours, category };
}

// ── Email fetcher ──────────────────────────────────────────

async function fetchEmail(url) {
  const BL = ['example','domain','sentry','wixpress','schema','noreply','@2x','.png','.jpg','.svg'];
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 9000);
    const res  = await fetch(url, { signal: ctrl.signal });
    const html = await res.text();
    const m    = html.match(re) || [];
    const e    = m.find(e => !BL.some(b => e.toLowerCase().includes(b)));
    if (e) return e;
    try {
      const cr  = await fetch(new URL(url).origin + '/contact', { signal: ctrl.signal });
      const ch  = await cr.text();
      const cm  = ch.match(re) || [];
      const ce  = cm.find(e => !BL.some(b => e.toLowerCase().includes(b)));
      if (ce) return ce;
    } catch {}
    return 'N/A';
  } catch { return 'N/A'; }
}

// ── Auto Export & Open Viewer ──────────────────────────────

function resultsToCSV(rows) {
  const COLS  = ['Name','Website','Email','Rating','Opening Hours','Phone','Address','Category'];
  const FIELD = { Name:'name',Website:'website',Email:'email',Rating:'rating',
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
