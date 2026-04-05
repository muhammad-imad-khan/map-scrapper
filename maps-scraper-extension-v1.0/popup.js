'use strict';

// ── DOM ─────────────────────────────────────────────────
const creditCount       = document.getElementById('creditCount');
const btnTopup          = document.getElementById('btnTopup');
const queryInput        = document.getElementById('queryInput');
const maxInput          = document.getElementById('maxInput');
const costPill          = document.getElementById('costPill');
const btnStart          = document.getElementById('btnStart');
const btnIcon           = document.getElementById('btnIcon');
const btnLabel          = document.getElementById('btnLabel');
const progSec           = document.getElementById('progSec');
const statusLn          = document.getElementById('statusLn');
const sTxt              = document.getElementById('sTxt');
const sDot              = document.getElementById('sDot');
const pFill             = document.getElementById('pFill');
const pLeft             = document.getElementById('pLeft');
const pRight            = document.getElementById('pRight');
const resSec            = document.getElementById('resSec');
const resCnt            = document.getElementById('resCnt');
const resTbody          = document.getElementById('resTbody');
const btnExport         = document.getElementById('btnExport');
const packGrid          = document.getElementById('packGrid');
const redeemInput       = document.getElementById('redeemInput');
const btnRedeem         = document.getElementById('btnRedeem');
const redeemMsg         = document.getElementById('redeemMsg');
const noCreditsOverlay  = document.getElementById('noCreditsOverlay');
const ovPacks           = document.getElementById('ovPacks');
const btnOvClose        = document.getElementById('btnOvClose');
const ftrCredits        = document.getElementById('ftrCredits');

// Email overlay elements
const emailOverlay      = document.getElementById('emailOverlay');
const emailName         = document.getElementById('emailName');
const emailInput        = document.getElementById('emailInput');
const emailMsg          = document.getElementById('emailMsg');
const btnSaveEmail      = document.getElementById('btnSaveEmail');
const btnSkipEmail      = document.getElementById('btnSkipEmail');

let allResults = [];
let isRunning  = false;
let currentCredits = 0;
let packs = [];

// ── Init ──────────────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_STATE' }, res => {
  if (chrome.runtime.lastError || !res) return;
  currentCredits = res.credits || 0;
  packs = res.packs || [];
  // Fetch expiry from local storage for display
  chrome.storage.local.get(['expiresAt'], d => {
    updateCreditUI(currentCredits, d.expiresAt || null);
  });
  renderPacks(packs);
  renderOvPacks(packs);
  if (res.running) setRunning(true);
  if (res.status && res.status !== 'idle') showProgress(res.status, res.progress, res.total);
  if (Array.isArray(res.results) && res.results.length) { allResults = [...res.results]; renderTable(); }
});

// Load latest packs from backend (catches price changes without extension update)
chrome.runtime.sendMessage({ type: 'GET_PACKS' }, res => {
  if (res?.packs?.length) { packs = res.packs; renderPacks(packs); renderOvPacks(packs); }
});

// ── Email collection on first install ─────────────────
chrome.storage.local.get(['emailCollected'], d => {
  if (!d.emailCollected) {
    emailOverlay.classList.add('show');
  }
});

btnSaveEmail.addEventListener('click', () => {
  const email = emailInput.value.trim();
  const name = emailName.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailMsg.textContent = 'Please enter a valid email address.';
    emailMsg.className = 'redeem-msg err';
    shake(emailInput);
    return;
  }
  btnSaveEmail.disabled = true;
  btnSaveEmail.textContent = 'Saving…';
  emailMsg.textContent = '';
  chrome.runtime.sendMessage({ type: 'GET_INSTALL_ID' }, res => {
    const installId = res?.installId;
    if (!installId) {
      emailMsg.textContent = 'Error getting install ID.';
      emailMsg.className = 'redeem-msg err';
      btnSaveEmail.disabled = false;
      btnSaveEmail.textContent = 'Continue';
      return;
    }
    fetch('https://map-scraper-paddle-backend.vercel.app/api/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Install-Id': installId },
      body: JSON.stringify({ action: 'saveEmail', email, name }),
    })
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        chrome.storage.local.set({ emailCollected: true, userEmail: email, userName: name });
        emailOverlay.classList.remove('show');
      } else {
        emailMsg.textContent = data.error || 'Failed to save.';
        emailMsg.className = 'redeem-msg err';
      }
    })
    .catch(() => {
      emailMsg.textContent = 'Network error. Try again.';
      emailMsg.className = 'redeem-msg err';
    })
    .finally(() => {
      btnSaveEmail.disabled = false;
      btnSaveEmail.textContent = 'Continue';
    });
  });
});

btnSkipEmail.addEventListener('click', () => {
  chrome.storage.local.set({ emailCollected: true });
  emailOverlay.classList.remove('show');
});

// ── Background messages ───────────────────────────────
chrome.runtime.onMessage.addListener(msg => {
  switch (msg.type) {
    case 'STATE':
      showProgress(msg.status, msg.progress, msg.total);
      break;
    case 'CREDITS_UPDATE':
      currentCredits = msg.credits;
      updateCreditUI(msg.credits);
      break;
    case 'RESULT':
      allResults.push(msg.result);
      renderTable();
      showProgress(null, msg.count, null);
      if (msg.credits !== undefined) { currentCredits = msg.credits; updateCreditUI(msg.credits); }
      break;
    case 'DONE':
      setRunning(false);
      showProgress(msg.status, msg.results?.length, msg.total);
      pFill.style.width = '100%';
      sDot.style.animation = 'none';
      if (msg.results) { allResults = msg.results; renderTable(); }
      if (msg.credits !== undefined) { currentCredits = msg.credits; updateCreditUI(msg.credits); }
      showToast('CSV saved to Downloads. Opening viewer…', 'success');
      break;
    case 'ERROR':
      setRunning(false);
      statusLn.classList.add('err');
      sTxt.textContent = '✖ ' + (msg.msg || 'Unknown error');
      break;
    case 'NO_CREDITS':
      setRunning(false);
      showNoCredits();
      if (msg.packs) { packs = msg.packs; renderOvPacks(packs); }
      break;
  }
});

// ── Tab switching (no inline handlers) ───────────────
function switchTab(tab) {
  ['scrape','shop','history'].forEach(t => {
    document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('active', t === tab);
    document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('show', t === tab);
  });
  if (tab === 'history') loadHistory();
}
document.querySelectorAll('.tab[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── Start / Stop ──────────────────────────────────────
btnStart.addEventListener('click', () => {
  if (isRunning) {
    chrome.runtime.sendMessage({ type: 'STOP' });
    setRunning(false);
    sTxt.textContent = 'Stopped.';
    sDot.style.animation = 'none';
    return;
  }
  if (currentCredits < 1) { showNoCredits(); return; }
  const query = queryInput.value.trim();
  if (!query) { shake(queryInput); return; }
  const max = Math.max(1, Math.min(100, parseInt(maxInput.value) || 15));
  allResults = []; renderTable();
  statusLn.classList.remove('err');
  chrome.runtime.sendMessage({ type: 'START', query, max }, res => {
    if (res?.reason === 'no_credits') { showNoCredits(); return; }
    setRunning(true);
    showProgress('Starting scraper…', 0, max);
  });
});

// ── Cost pill update ──────────────────────────────────
maxInput.addEventListener('input', () => {
  const n = Math.max(1, parseInt(maxInput.value) || 1);
  costPill.textContent = `${n} credit${n !== 1 ? 's' : ''}`;
});

// ── Buy Credits btn ───────────────────────────────────
btnTopup.addEventListener('click', () => switchTab('shop'));

// ── Export CSV ────────────────────────────────────────
btnExport.addEventListener('click', () => {
  if (!allResults.length) return;
  // Re-download CSV and open viewer tab
  chrome.runtime.sendMessage({ type: 'OPEN_VIEWER' });
});

// ── Pack cards ────────────────────────────────────────
function renderPacks(packs) {
  packGrid.innerHTML = '';
  packs.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'pack-card' + (p.popular ? ' popular' : '');
    card.innerHTML = `
      <div class="pack-icon pi-p">${p.popular ? '⚡' : '🚀'}</div>
      <div class="pack-info">
        <div class="pack-name">${p.label}</div>
        <div class="pack-desc">Emails + Social Media · Valid 7 days</div>
      </div>
      <div class="pack-right">
        <div class="pack-price">${p.price}</div>
        <div class="pack-per">${p.credits} credits</div>
      </div>
      <button class="btn-buy" data-pack-id="${p.id}">Buy Now →</button>
    `;
    card.querySelector('.btn-buy').addEventListener('click', e => { e.stopPropagation(); buyPack(p.id); });
    card.addEventListener('click', () => buyPack(p.id));
    packGrid.appendChild(card);
  });
}

function renderOvPacks(packs) {
  ovPacks.innerHTML = '';
  packs.forEach(p => {
    const div = document.createElement('div');
    div.className = 'ov-pack' + (p.popular ? ' pop' : '');
    div.innerHTML = `<div class="opc">${p.credits}</div><div class="opl">credits</div><div class="opp">${p.price}</div>`;
    div.onclick = () => buyPack(p.id);
    ovPacks.appendChild(div);
  });
}

function buyPack(id) {
  chrome.runtime.sendMessage({ type: 'OPEN_PACK', packId: id });
};

// ── No-credits overlay ────────────────────────────────
function showNoCredits() { noCreditsOverlay.classList.add('show'); }
btnOvClose.addEventListener('click', () => noCreditsOverlay.classList.remove('show'));

// ── Redeem code ───────────────────────────────────────
btnRedeem.addEventListener('click', () => {
  const code = redeemInput.value.trim();
  if (!code) { redeemMsg.textContent = 'Enter your license code.'; redeemMsg.className = 'redeem-msg err'; return; }
  redeemMsg.textContent = 'Verifying…'; redeemMsg.className = 'redeem-msg';
  btnRedeem.disabled = true;
  chrome.runtime.sendMessage({ type: 'REDEEM_CODE', code }, res => {
    btnRedeem.disabled = false;
    if (res?.ok) {
      redeemMsg.textContent = `✓ ${res.msg} Balance: ${res.newBalance} credits`;
      redeemMsg.className = 'redeem-msg ok';
      redeemInput.value = '';
      currentCredits = res.newBalance;
      updateCreditUI(res.newBalance);
    } else {
      redeemMsg.textContent = '✖ ' + (res?.msg || 'Invalid code.');
      redeemMsg.className = 'redeem-msg err';
    }
  });
});

// ── Helpers ───────────────────────────────────────────

function updateCreditUI(n, expiresAt) {
  creditCount.textContent = n.toLocaleString();
  if (expiresAt && n > 0) {
    const days = Math.max(0, Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24)));
    ftrCredits.textContent = `${n} credits · ${days}d left`;
  } else {
    ftrCredits.textContent = `${n} credits`;
  }
  creditCount.className = 'credit-count' + (n === 0 ? ' empty' : n < 10 ? ' warn' : '');
}

function setRunning(r) {
  isRunning = r;
  btnIcon.textContent  = r ? '⏹' : '▶';
  btnLabel.textContent = r ? 'Stop Scraping' : 'Start Scraping';
  btnStart.classList.toggle('running', r);
  if (r) progSec.classList.add('show');
}

function showProgress(status, cur, total) {
  progSec.classList.add('show');
  if (status != null) sTxt.textContent = status;
  if (cur != null) {
    const t   = total || 1;
    const pct = Math.min(100, Math.round((cur / t) * 100));
    pFill.style.width = pct + '%';
    pRight.textContent = `${cur} / ${t}`;
    pLeft.textContent  = pct === 100 ? 'Complete' : pct + '%';
  }
}

function renderTable() {
  resSec.classList.add('show');
  resCnt.textContent = allResults.length;
  btnExport.disabled = !allResults.length;
  resTbody.innerHTML = '';
  allResults.forEach(r => {
    const e = r.email   && r.email   !== 'N/A';
    const w = r.website && r.website !== 'N/A';
    const h = r.hours   && r.hours   !== 'N/A';
    const rr = r.rating && r.rating  !== 'N/A';
    const sc = r.socials && r.socials !== 'N/A';
    const tr = document.createElement('tr');
    tr.innerHTML = [
      `<td class="cn nm" title="${x(r.name)}">${x(r.name)}</td>`,
      `<td class="cr rt">${rr ? '★ '+x(r.rating) : '—'}</td>`,
      `<td class="ce ${e?'he':'ne'}" title="${x(r.email)}">${e ? x(trunc(r.email,22)) : '—'}</td>`,
      `<td class="cs ${sc?'hs':'ns'}" title="${x(r.socials)}">${sc ? '✓' : '—'}</td>`,
      `<td class="cw ${w?'hw':'nw'}">${w ? '✓' : '—'}</td>`,
      `<td class="ch ${h?'hh':'nh'}">${h ? '✓' : '—'}</td>`
    ].join('');
    resTbody.appendChild(tr);
  });
  const tw = document.querySelector('.twrap');
  if (tw) tw.scrollTop = tw.scrollHeight;
}

function exportCSV(rows) {
  const COLS  = ['Name','Website','Email','Social Media','Rating','Opening Hours','Phone','Address','Category'];
  const FIELD = { Name:'name',Website:'website',Email:'email','Social Media':'socials',Rating:'rating','Opening Hours':'hours',Phone:'phone',Address:'address',Category:'category' };
  const csv   = [
    COLS.join(','),
    ...rows.map(r => COLS.map(c => `"${String(r[FIELD[c]]||'N/A').replace(/"/g,'""')}"`).join(','))
  ].join('\r\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' })),
    download: `leads_${Date.now()}.csv`
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function shake(el) {
  el.style.borderColor = 'rgba(248,113,113,.6)';
  ['-4px','4px','-3px','0'].forEach((v,i) => setTimeout(() => el.style.transform=`translateX(${v})`, i*80));
  setTimeout(() => el.style.borderColor='', 1200);
  el.focus();
}
function x(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function trunc(s,n) { return s&&s.length>n ? s.slice(0,n)+'…' : s; }

// ── Toast notification ────────────────────────────────
function showToast(msg, type = 'success') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.style.cssText = `
    position:fixed;bottom:52px;left:50%;transform:translateX(-50%);
    background:${type === 'success' ? 'rgba(34,197,94,.15)' : 'rgba(248,113,113,.15)'};
    border:1px solid ${type === 'success' ? 'rgba(34,197,94,.35)' : 'rgba(248,113,113,.35)'};
    color:${type === 'success' ? '#22c55e' : '#f87171'};
    padding:8px 18px;border-radius:20px;font-size:12px;font-family:monospace;
    white-space:nowrap;z-index:999;animation:toastIn .3s ease both;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.style.opacity = '0', 2800);
  setTimeout(() => toast.remove(), 3200);
}

// ── Credit History ────────────────────────────────────
let historyLoaded = false;
function loadHistory() {
  const histList = document.getElementById('histList');
  const histBal = document.getElementById('histBalance');
  histBal.textContent = currentCredits.toLocaleString();

  if (historyLoaded) return;
  histList.innerHTML = '<div class="hist-loading">Loading history…</div>';

  chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, res => {
    if (chrome.runtime.lastError || !res || !res.ok) {
      histList.innerHTML = '<div class="hist-empty">Could not load history.</div>';
      return;
    }
    historyLoaded = true;
    const history = res.history || [];
    if (!history.length) {
      histList.innerHTML = '<div class="hist-empty">No transactions yet.<br>Purchase credits to get started!</div>';
      return;
    }
    // Sort newest first
    history.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    histList.innerHTML = history.map(h => {
      const isCredit = h.amount > 0;
      const iconClass = h.type === 'admin-adjustment' || h.type === 'admin-set-credits' ? 'admin' : isCredit ? 'credit' : 'debit';
      const icon = iconClass === 'admin' ? '🔧' : isCredit ? '💰' : '🔻';
      const amountClass = isCredit ? 'pos' : 'neg';
      const sign = isCredit ? '+' : '';
      const reason = formatReason(h.type, h.reason);
      const date = h.at ? new Date(h.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      return `<div class="hist-item">
        <div class="hi-left">
          <div class="hi-icon ${iconClass}">${icon}</div>
          <div>
            <div class="hi-reason">${x(reason)}</div>
            <div class="hi-date">${x(date)}${h.balance != null ? ' · Bal: ' + h.balance : ''}</div>
          </div>
        </div>
        <div class="hi-amount ${amountClass}">${sign}${h.amount}</div>
      </div>`;
    }).join('');
  });
}

function formatReason(type, reason) {
  if (type === 'credit') return reason || 'Credits added';
  if (type === 'debit' || type === 'deduct') return 'Scraping usage';
  if (type === 'admin-adjustment') return 'Admin adjustment';
  if (type === 'admin-set-credits') return 'Credits set by admin';
  if (type === 'starter') return 'Free starter credits';
  if (reason && reason.startsWith('banktransfer:')) return 'Bank transfer purchase';
  return reason || type || 'Transaction';
}
