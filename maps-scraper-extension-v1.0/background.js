// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
//  Maps Lead Scraper v2 ÔÇö Background Service Worker
//  Monetization: SERVER-SIDE CREDIT SYSTEM (Paddle + Redis)
//  ÔÇó New installs: 3 free starter credits (server-granted)
//  ÔÇó Each scraped result costs 1 credit (server-deducted)
//  ÔÇó 500 cr / $10 ÔÇö emails + social media (Pro)
//  ÔÇó 2500 cr / $25 ÔÇö emails + social media (Enterprise)
//  ÔÇó Each install has a unique installId (UUID) for RLS
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

// ÔöÇÔöÇ CONFIG ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
const BACKEND_URL = 'https://map-scraper-paddle-backend.vercel.app';

// ÔöÇÔöÇ Open welcome page on first install ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

const CREDIT_PACKS = [
    { id: 'pri_01kkwtx0kh2skzrzjbxgmgqngd', slug: 'pro',        label: 'Pro Pack',        credits: 500,  price: '$5', popular: true },
    { id: 'pri_enterprise_placeholder',      slug: 'enterprise',  label: 'Enterprise Pack',  credits: 2500, price: '$25', popular: false },
];
const ONE_TIME_PACK = { id: 'pri_01knfqkcbhqbnwhq5k1ace3sd9', slug: 'lifetime', label: 'Lifetime License', price: '$25', popular: true };
const COST_PER_RESULT = 1;
const PRICING_MODE_CREDIT = 'credit_based';
const PRICING_MODE_ONE_TIME = 'one_time';

// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

let state = {
  running: false, results: [], progress: 0, total: 0,
  status: 'idle', tabId: null, credits: 0
};
let pricingMode = PRICING_MODE_CREDIT;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function broadcast(type, payload = {}) {
  chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});
}

function waitForTab(tabId, timeout = 35000) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(fn); resolve(false); }, timeout);
    function fn(id, info) {
      if (id !== tabId) return;
      if (info.status === 'complete') {
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

async function execWithRetry(tabId, fn, args = [], maxAttempts = 4, delayMs = 1000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await exec(tabId, fn, args);
    if (result !== null) return result;
    if (attempt < maxAttempts - 1) {
      await sleep(delayMs);
    }
  }
  return null;
}

// ÔöÇÔöÇ Install ID (unique per browser install, used as RLS key) ÔöÇÔöÇ

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

// ÔöÇÔöÇ Server-side credit operations ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

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
  // Only update local cache ÔÇö server is the source of truth
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

async function getPricingMode() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/payment-config?type=pricing`);
    if (res.ok) {
      const data = await res.json();
      const mode = data && data.mode;
      if (mode === PRICING_MODE_ONE_TIME || mode === PRICING_MODE_CREDIT) {
        pricingMode = mode;
        await chrome.storage.local.set({ pricingMode: mode });
        return mode;
      }
    }
  } catch {}

  return new Promise((resolve) => {
    chrome.storage.local.get(['pricingMode'], (d) => {
      const mode = d.pricingMode;
      if (mode === PRICING_MODE_ONE_TIME || mode === PRICING_MODE_CREDIT) {
        pricingMode = mode;
      }
      resolve(pricingMode);
    });
  });
}

// ÔöÇÔöÇ License / credit pack redemption (kept for manual codes) ÔöÇÔöÇ

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

// ÔöÇÔöÇ Message router ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

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
        const mode = await getPricingMode();
        const packs = mode === PRICING_MODE_ONE_TIME ? [ONE_TIME_PACK] : CREDIT_PACKS;
        sendResponse({ ...state, credits, packs, costPerResult: COST_PER_RESULT, pricingMode: mode });
        break;
      }

      case 'GET_PACKS': {
        const mode = await getPricingMode();
        const packs = mode === PRICING_MODE_ONE_TIME ? [ONE_TIME_PACK] : CREDIT_PACKS;
        sendResponse({ packs });
        break;
      }

      case 'GET_PRICING_MODE': {
        const mode = await getPricingMode();
        sendResponse({ pricingMode: mode });
        break;
      }

      case 'OPEN_PACK': {
        const mode = await getPricingMode();
        let pack;
        if (mode === PRICING_MODE_ONE_TIME) {
          pack = ONE_TIME_PACK;
        } else {
          pack = CREDIT_PACKS.find(p => p.id === msg.packId);
        }
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

      case 'OPEN_POPUP': {
        // Open the main popup window
        const width = 540;
        const height = 700;
        chrome.action.openPopup().catch(() => {});
        sendResponse({ ok: true });
        break;
      }
    }
  })();
  return true;
});

// Prime pricing mode cache in the background.
getPricingMode().catch(() => {});

// ÔöÇÔöÇ Main scraper ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

async function runScraper(query, requestedMax, startCredits) {
  // Cap max by available credits
  const maxAffordable = Math.floor(startCredits / COST_PER_RESULT);
  const maxResults    = Math.min(requestedMax, maxAffordable);

  state = {
    running: true, results: [], progress: 0, total: 0,
    status: 'Opening Google MapsÔÇª', tabId: null,
    credits: startCredits
  };
  broadcast('STATE', state);

  try {
    // Open Maps tab and use returned tab id directly
    const createdTab = await chrome.tabs.create({
      url: `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
      active: true
    });
    const tabId = createdTab?.id;
    if (!tabId) throw new Error('Failed to open Google Maps tab.');
    state.tabId = tabId;

    await waitForTab(tabId);
    await sleep(3000);

    // Dismiss consent / cookie / sign-in dialogs (try multiple times)
    for (let c = 0; c < 5; c++) {
      const dismissed = await exec(tabId, () => {
        // Google consent dialog (multiple selector strategies)
        const accept = document.querySelector('button[aria-label*="Accept all"]')
          || document.querySelector('button[aria-label*="Accept All"]')
          || document.querySelector('form[action*="consent"] button')
          || document.querySelector('button[jsname="b3VHJd"]')
          || document.querySelector('button[jsname="higCR"]')
          || [...document.querySelectorAll('button')].find(b => /accept\s*all/i.test(b.textContent));
        if (accept) { accept.click(); return 'consent'; }
        // Cookie banner
        const cookie = document.querySelector('[aria-label*="cookie"] button, .cookie-consent button');
        if (cookie) { cookie.click(); return 'cookie'; }
        // Google sign-in / "Get the most out of Google Maps" overlay
        // IMPORTANT: Only target buttons INSIDE dialogs/overlays, not generic Close buttons
        const dialog = document.querySelector('[role="dialog"]')
          || document.querySelector('.XCxAo')
          || document.querySelector('[class*="modal"]')
          || document.querySelector('[class*="overlay"]');
        if (dialog) {
          const dismissBtn = dialog.querySelector('button[aria-label*="lose"]')
            || dialog.querySelector('button[aria-label*="ismiss"]')
            || dialog.querySelector('button:last-child')
            || [...dialog.querySelectorAll('button')].find(b => /not now|no thanks|skip|stay signed out|maybe later|close|dismiss/i.test(b.textContent));
          if (dismissBtn) { dismissBtn.click(); return 'dialog-dismiss'; }
        }
        // "Sign in" bottom bar (not a full overlay ÔÇö just hide it)
        const signInBar = document.querySelector('.kwuIFd, .PwqnGe');
        if (signInBar) { signInBar.style.display = 'none'; return 'signin-bar-hidden'; }
        // Generic dismiss buttons (be very specific to avoid closing results)
        const genericDismiss = [...document.querySelectorAll('button')].find(b =>
          /not now|no thanks|stay signed out|maybe later/i.test(b.textContent)
          && !b.closest('div[role="feed"]')
          && !b.closest('div[role="main"]')
        );
        if (genericDismiss) { genericDismiss.click(); return 'generic-dismiss'; }
        return null;
      });
      console.log('[Scraper] Dismiss attempt', c, ':', dismissed);
      if (dismissed) { await sleep(1500); } else { break; }
    }
    await sleep(2000);

    // Wait for results to actually appear in the DOM (up to 15s)
    state.status = 'Waiting for Maps results to loadÔÇª';
    broadcast('STATE', state);

    // Test that script injection works, then try one hard refresh recovery before failing.
    let canExec = await execWithRetry(tabId, () => 'ping');
    console.log('[Scraper] exec test:', canExec);
    if (canExec !== 'ping') {
      console.warn('[Scraper] Initial script injection failed. Reloading tab and retrying...');
      await chrome.tabs.reload(tabId, { bypassCache: true }).catch(() => {});
      await waitForTab(tabId, 20000);
      await sleep(1200);
      canExec = await execWithRetry(tabId, () => 'ping', [], 5, 1200);
      console.log('[Scraper] exec test after reload:', canExec);
    }

    if (canExec !== 'ping') {
      // Script injection failed ÔÇö try getting tab info
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      console.error('[Scraper] Cannot inject scripts. Tab URL:', tab?.url, 'Status:', tab?.status);
      throw new Error('Failed to initialize Google Maps tab for scraping. Reload the extension and try again.');
    }

    // Log the actual page URL for debugging
    const pageUrl = await exec(tabId, () => location.href);
    console.log('[Scraper] Maps page URL:', pageUrl);

    // Wait for results to load (up to 40 seconds)
    state.status = 'Waiting for results to loadÔÇª';
    broadcast('STATE', state);
    
    let hasResults = false;
    for (let w = 0; w < 20; w++) {
      hasResults = await exec(tabId, () => {
        // Primary: URL-based selector (most stable across DOM changes)
        if (document.querySelectorAll('a[href*="/maps/place/"]').length > 0) return true;
        // Fallback: class-based (may change with Google updates)
        if (document.querySelectorAll('a.hfpxzc').length > 0) return true;
        // Fallback: feed container with links
        const feed = document.querySelector('div[role="feed"]');
        if (feed && feed.querySelectorAll('a[href]').length > 0) return true;
        // Fallback: any link that looks like a place link in the results panel
        const mainContent = document.querySelector('div[role="main"]');
        if (mainContent && mainContent.querySelectorAll('a[href*="google.com/maps"]').length > 2) return true;
        return false;
      });
      console.log('[Scraper] hasResults check', w, ':', hasResults);
      if (hasResults) break;
      await sleep(2000);
    }

    // Collect listing URLs (or prep for card-click fallback)
    state.status = 'Collecting listings from resultsÔÇª';
    broadcast('STATE', state);
    const urls = await collectUrls(tabId, maxResults);
    state.total = urls.length || maxResults;
    if (!urls.length) {
      // Fallback mode: scrape by clicking result cards directly in the left panel.
      state.status = 'URL selectors failed. Switching to card-click modeÔÇª';
      broadcast('STATE', state);
      await sleep(900);

      await scrapeByClickingResults(tabId, maxResults);

      if (!state.results.length) {
        // Get comprehensive diagnostic info and surface it in the error
        const diag = await exec(tabId, () => {
          const roleEls = {};
          document.querySelectorAll('[role]').forEach(el => {
            const r = el.getAttribute('role');
            roleEls[r] = (roleEls[r] || 0) + 1;
          });
          const sampleLinks = [...document.querySelectorAll('a[href]')].slice(0, 20).map(a => a.href);
          const mapsLinks = sampleLinks.filter(h => h.includes('maps'));
          const dialogs = document.querySelectorAll('[role="dialog"]').length;
          const overlays = document.querySelectorAll('[class*="overlay"], [class*="modal"]').length;
          return {
            url: location.href,
            title: document.title,
            bodyLen: document.body?.innerHTML?.length || 0,
            allLinks: document.querySelectorAll('a').length,
            placeLinks: document.querySelectorAll('a[href*="/maps/place/"]').length,
            hfpxzc: document.querySelectorAll('a.hfpxzc').length,
            feeds: document.querySelectorAll('div[role="feed"]').length,
            roles: roleEls,
            mapsLinks,
            dialogs,
            overlays,
            visibleText: document.body?.innerText?.substring(0, 500) || '',
          };
        });
        console.error('[Scraper] No listings. Diagnostics:', JSON.stringify(diag, null, 2));
        const hint = diag?.dialogs > 0 ? ' A dialog/overlay may be blocking results.'
          : diag?.allLinks < 5 ? ' Page may not have loaded properly.'
          : diag?.placeLinks === 0 ? ' Google Maps DOM may have changed.'
          : '';
        throw new Error(`No listings found (${diag?.allLinks || 0} links, ${diag?.placeLinks || 0} place links, ${diag?.feeds || 0} feeds on page).${hint} Check service worker console for details.`);
      }

      // Card-click mode completed; finalize run.
      chrome.tabs.remove(state.tabId).catch(() => {});
      const finalCredits = await getCredits();
      state.running = false; state.tabId = null; state.credits = finalCredits;
      state.status = `Done ÔÇö ${state.results.length} listings. ${finalCredits} credits remaining.`;
      if (state.results.length > 0) await autoExportAndView(state.results, query);
      broadcast('DONE', { ...state });
      return;
    }

    broadcast('STATE', { ...state, status: `Found ${urls.length} listings. StartingÔÇª` });
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
      state.status = `[${currentCredits} cr] Extracting ${i + 1} / ${urls.length}ÔÇª`;
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
            state.status = `Finding email for "${data.name}"ÔÇª`;
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
    state.status = `Done ÔÇö ${state.results.length} listings. ${finalCredits} credits remaining.`;

    // ÔöÇÔöÇ Auto-export CSV + open viewer tab ÔöÇÔöÇ
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

async function scrapeByClickingResults(tabId, maxResults) {
  let attempts = 0;
  const maxAttempts = Math.max(maxResults * 8, 30);
  let successCount = 0;

  while (state.running && successCount < maxResults && attempts < maxAttempts) {
    const currentCredits = await getCredits();
    if (currentCredits < COST_PER_RESULT) {
      broadcast('NO_CREDITS', { credits: currentCredits, packs: CREDIT_PACKS, mid: true, scraped: state.results.length });
      break;
    }

    state.progress = successCount + 1;
    state.status = `[${currentCredits} cr] Scraping result ${successCount + 1} / ${maxResults}ÔÇª`;
    broadcast('STATE', state);

    const clicked = await exec(tabId, () => {
      const root = document.querySelector('div[role="feed"]')
        || document.querySelector('[role="main"]')
        || document.body;

      // Find all potential result cards
      const candidates = [];
      root.querySelectorAll('div[role="article"]').forEach(el => candidates.push(el));
      root.querySelectorAll('a[href*="/maps/place/"]').forEach(el => candidates.push(el));
      root.querySelectorAll('[jsaction*="click"][aria-label]').forEach(el => candidates.push(el));

      // Find first unclicked, visible card
      const card = candidates.find(el => {
        if (!el || !(el instanceof HTMLElement)) return false;
        if (el.dataset.mlsClicked === '1') return false;
        if (el.closest('[role="dialog"]')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top < window.innerHeight;
      });

      if (!card) return { ok: false, reason: 'no-visible-card' };

      card.dataset.mlsClicked = '1';
      card.scrollIntoView({ block: 'nearest' });

      // Click the card or first clickable element inside
      const clickTarget = card.closest('a[href*="/maps/place/"]')
        || card.querySelector('a[href*="/maps/place/"]')
        || card;

      if (typeof clickTarget.click === 'function') {
        clickTarget.click();
      } else {
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }

      return { ok: true };
    });

    if (!clicked?.ok) {
      attempts++;
      // Scroll to find more cards
      await exec(tabId, () => {
        const sc = document.querySelector('div[role="feed"]')
          || document.querySelector('[role="main"]')
          || document.scrollingElement;
        if (sc) sc.scrollBy(0, 600);
      });
      await sleep(1200);
      continue;
    }

    // Wait for place details to load
    await sleep(3500);

    // Try to extract details
    const data = await exec(tabId, extractDetails);
    if (!data || !data.name || data.name === 'N/A') {
      attempts++;
      // Go back to results if extraction failed
      await exec(tabId, () => {
        const back = document.querySelector('button[aria-label*="Back"]')
          || document.querySelector('button[jsaction*="back"]')
          || document.querySelector('[aria-label*="back"], [aria-label*="Close"]');
        if (back && typeof back.click === 'function') back.click();
      });
      await sleep(1500);
      continue;
    }

    // Check for duplicate
    const duplicate = state.results.some(r => r.name.toLowerCase() === data.name.toLowerCase());
    if (duplicate) {
      attempts++;
      await exec(tabId, () => {
        const back = document.querySelector('button[aria-label*="Back"]')
          || document.querySelector('button[jsaction*="back"]');
        if (back && typeof back.click === 'function') back.click();
      });
      await sleep(1500);
      continue;
    }

    // Deduct credit
    const deducted = await deductCredit();
    if (!deducted) {
      broadcast('NO_CREDITS', { credits: 0, packs: CREDIT_PACKS, mid: true, scraped: state.results.length });
      break;
    }

    // Fetch email/socials if website exists
    if (data.website && data.website !== 'N/A') {
      state.status = `Finding email for "${data.name}"ÔÇª`;
      broadcast('STATE', state);
      try {
        const webData = await fetchWebsiteData(data.website, true);
        data.email = webData.email;
        data.socials = webData.socials;
      } catch (e) {
        console.warn('[Scraper] Web data fetch failed for', data.name, e);
      }
    }

    // Add to results
    const newCredits = await getCredits();
    state.results.push(data);
    broadcast('RESULT', { result: data, count: state.results.length, credits: newCredits });
    successCount++;

    // Go back to results for next iteration
    await exec(tabId, () => {
      const back = document.querySelector('button[aria-label*="Back"]')
        || document.querySelector('button[jsaction*="back"]')
        || document.querySelector('[role="button"][aria-label*="Close"]');
      if (back && typeof back.click === 'function') {
        back.click();
      }
    });

    await sleep(1800);
    attempts++;
  }

  console.log('[Scraper] Card-click mode completed:', successCount, 'results after', attempts, 'attempts');
}

// ÔöÇÔöÇ URL Collector ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

async function collectUrls(tabId, max) {
  const seen = new Set();
  let att = 0;
  const maxAttempts = Math.min(max * 3, 60); // scale with requested results
  while (seen.size < max && att < maxAttempts) {
    const found = await exec(tabId, () => {
      // Strategy 1: URL-based (most reliable across DOM changes)
      const urlLinks = document.querySelectorAll('a[href*="/maps/place/"]');
      // Strategy 2: class-based (may change)
      const classLinks = document.querySelectorAll('a.hfpxzc');
      // Strategy 3: feed container links
      const feedLinks = document.querySelectorAll('div[role="feed"] a[href*="google.com/maps"]');
      // Strategy 4: any place-like link in the main content area
      const mainLinks = document.querySelectorAll('div[role="main"] a[href*="/maps/place/"]');
      // Strategy 5: links with data attributes commonly used by Maps
      const dataLinks = document.querySelectorAll('a[data-cid], a[data-pid]');

      const all = new Set();
      [urlLinks, classLinks, feedLinks, mainLinks, dataLinks].forEach(nodeList => {
        nodeList.forEach(a => {
          if (a.href && (a.href.includes('/maps/place/') || a.href.includes('!3d'))) {
            all.add(a.href);
          }
        });
      });
      return [...all];
    });
    if (found) found.forEach(u => { if (seen.size < max) seen.add(u); });
    if (seen.size >= max) break;
    const scrolled = await exec(tabId, () => {
      // Try multiple scroll containers (ordered by specificity)
      const scrollable = document.querySelector('div[role="feed"]')
        || document.querySelector('div[role="main"] div[aria-label]')
        || document.querySelector('div.m6QErb[aria-label]')
        || document.querySelector('div.m6QErb.DxyBCb')
        || document.querySelector('div.m6QErb');
      if (scrollable) { scrollable.scrollBy(0, 800); return 'feed'; }
      // Fallback: find any scrollable container in the results panel
      const panels = document.querySelectorAll('div[role="main"] div');
      for (const panel of panels) {
        if (panel.scrollHeight > panel.clientHeight + 100) {
          panel.scrollBy(0, 800); return 'panel';
        }
      }
      // Last resort: scroll the main role element
      const main = document.querySelector('div[role="main"]');
      if (main) { main.scrollBy(0, 800); return 'main'; }
      return false;
    });
    console.log('[Scraper] Scroll attempt', att, ':', scrolled, 'URLs found:', seen.size);
    await sleep(scrolled ? 1800 : 2500);
    att++;
  }

  // Fallback mode: click result cards and capture the place URL after each click.
  if (!seen.size) {
    const fallbackUrls = await exec(tabId, async (limit) => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const out = new Set();

      function getCards() {
        const root = document.querySelector('div[role="feed"]')
          || document.querySelector('div[role="main"]')
          || document.body;
        const selectors = [
          'a[href*="/maps/place/"]',
          'div[role="article"]',
          'div.Nv2PK',
          'div[jsaction][aria-label]'
        ];
        const cards = [];
        selectors.forEach(sel => root.querySelectorAll(sel).forEach(el => cards.push(el)));
        return cards;
      }

      for (let pass = 0; pass < 8 && out.size < limit; pass++) {
        const cards = getCards();

        for (const card of cards) {
          if (out.size >= limit) break;
          if (!(card instanceof HTMLElement)) continue;

          card.scrollIntoView({ block: 'center' });
          await wait(300);
          card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          await wait(1800);

          if (location.href.includes('/maps/place/')) out.add(location.href);
          document.querySelectorAll('a[href*="/maps/place/"]').forEach(a => out.add(a.href));
        }

        if (out.size >= limit) break;

        const scrollable = document.querySelector('div[role="feed"]')
          || document.querySelector('div[role="main"]')
          || document.scrollingElement;
        if (scrollable) scrollable.scrollBy(0, 1000);
        await wait(1200);
      }

      return [...out];
    }, max);

    if (Array.isArray(fallbackUrls)) {
      fallbackUrls.forEach(u => { if (seen.size < max) seen.add(u); });
      console.log('[Scraper] Fallback click collector found URLs:', seen.size);
    }
  }

  return [...seen].slice(0, max);
}

// ÔöÇÔöÇ Detail extractor (injected into Maps page) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

function extractDetails() {
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  // Name: h1 is very stable
  const name = $('h1')?.textContent?.trim() || 'N/A';

  // Rating: try multiple strategies
  const rating = $('div.F7nice span[aria-hidden="true"]')?.textContent?.trim()
    || $('span.ceNzKf[role="img"]')?.getAttribute('aria-label')?.match(/[\d.]+/)?.[0]
    || $('span[role="img"][aria-label*="star"]')?.getAttribute('aria-label')?.match(/[\d.]+/)?.[0]
    || $('span.fontBodyMedium span[aria-hidden="true"]')?.textContent?.trim()
    || (() => {
      // Generic fallback: find a number near star icons
      const spans = $$('span[aria-hidden="true"]');
      for (const s of spans) {
        const t = s.textContent.trim();
        if (/^\d\.\d$/.test(t)) return t;
      }
      return 'N/A';
    })()
    || 'N/A';

  // Website: data-item-id is more stable than class names
  const website = $('a[data-item-id="authority"]')?.href
    || $('a[data-tooltip="Open website"]')?.href
    || $('a[aria-label*="website" i]')?.href
    || $('a[aria-label*="Website"]')?.href
    || 'N/A';

  // Phone: data attribute based (stable)
  const rawPh = $('button[data-item-id^="phone:tel:"]')?.getAttribute('data-item-id')
    || $('a[data-item-id^="phone:tel:"]')?.getAttribute('data-item-id')
    || '';
  const phone = rawPh.replace('phone:tel:', '').trim()
    || $('button[data-tooltip*="phone" i]')?.textContent?.replace(/[^\d+\-()\s]/g, '').trim()
    || 'N/A';

  // Address: data attribute based (stable)
  const address = $('button[data-item-id="address"]')?.textContent?.trim()
    || $('div[data-item-id="address"]')?.textContent?.trim()
    || $('[data-tooltip="Copy address"]')?.textContent?.trim()
    || 'N/A';

  // Category: try multiple strategies
  const category = $('button.DkEaL')?.textContent?.trim()
    || $('button[jsaction*="category"]')?.textContent?.trim()
    || (() => {
      // Look for the category link/button near the rating
      const btns = $$('button span');
      for (const span of btns) {
        const t = span.textContent.trim();
        // Category is usually a short text like "Restaurant", "Hotel", etc.
        if (t && t.length > 2 && t.length < 40 && !t.includes('http') && !t.includes('Review')
            && span.closest('button')?.getAttribute('jsaction')?.includes('category')) {
          return t;
        }
      }
      return 'N/A';
    })()
    || 'N/A';

  // Hours: try table first, then data attribute, then aria-based
  let hours = 'N/A';
  const rows = [...$$('table.eK4R0e tr, table.WgFkxc tr, table[class] tr')];
  const hourRows = rows.filter(r => r.querySelectorAll('td').length >= 2);
  if (hourRows.length) {
    hours = hourRows.map(r => [...r.querySelectorAll('td')].map(c => c.textContent.trim()).join(': ')).filter(Boolean).join(' | ');
  } else {
    const el = $('[data-item-id="oh"]') || $('div[aria-label*="hour" i]') || $('[aria-label*="Hours"]');
    if (el) hours = el.textContent.trim().replace(/\s+/g, ' ');
  }

  return { name, rating, website, email: 'N/A', phone, address, hours, category, socials: 'N/A' };
}

// ÔöÇÔöÇ Website data fetcher (email + social media) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

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

// ÔöÇÔöÇ Auto Export & Open Viewer ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

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
      saveAs:   false    // silent ÔÇö goes straight to Downloads
    });

    // 3. Open viewer tab
    await chrome.tabs.create({
      url:    chrome.runtime.getURL('viewer.html'),
      active: true
    });

  } catch (e) {
    console.warn('[AutoExport] Error:', e);
    // Don't block ÔÇö DONE still fires even if export fails
  }
}
