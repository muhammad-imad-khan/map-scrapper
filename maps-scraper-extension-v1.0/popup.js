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

let allResults = [];
let isRunning  = false;
let currentCredits = 0;
let packs = [];

// ── Init ──────────────────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_STATE' }, res => {
  if (chrome.runtime.lastError || !res) return;
  currentCredits = res.credits || 0;
  packs = res.packs || [];
  updateCreditUI(currentCredits);
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
  ['scrape','shop'].forEach(t => {
    document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('active', t === tab);
    document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('show', t === tab);
  });
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
  const icons  = ['pi-s','pi-p','pi-a'];
  const emojis = ['⚡','🚀','🏆'];
  packGrid.innerHTML = '';
  packs.forEach((p, i) => {
    const perCredit = (parseFloat(p.price.replace('$','')) / p.credits * 100).toFixed(1);
    const card = document.createElement('div');
    card.className = 'pack-card' + (p.popular ? ' popular' : '');
    card.innerHTML = `
      <div class="pack-icon ${icons[i] || 'pi-s'}">${emojis[i] || '💳'}</div>
      <div class="pack-info">
        <div class="pack-name">${p.label}</div>
        <div class="pack-desc">${p.popular ? 'Most popular · ' : ''}${perCredit}¢ per lead</div>
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

function updateCreditUI(n) {
  creditCount.textContent = n.toLocaleString();
  ftrCredits.textContent  = `${n} credits`;
  creditCount.className   = 'credit-count' + (n === 0 ? ' empty' : n < 10 ? ' warn' : '');
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
    const tr = document.createElement('tr');
    tr.innerHTML = [
      `<td class="cn nm" title="${x(r.name)}">${x(r.name)}</td>`,
      `<td class="cr rt">${rr ? '★ '+x(r.rating) : '—'}</td>`,
      `<td class="ce ${e?'he':'ne'}" title="${x(r.email)}">${e ? x(trunc(r.email,22)) : '—'}</td>`,
      `<td class="cw ${w?'hw':'nw'}">${w ? '✓' : '—'}</td>`,
      `<td class="ch ${h?'hh':'nh'}">${h ? '✓' : '—'}</td>`
    ].join('');
    resTbody.appendChild(tr);
  });
  const tw = document.querySelector('.twrap');
  if (tw) tw.scrollTop = tw.scrollHeight;
}

function exportCSV(rows) {
  const COLS  = ['Name','Website','Email','Rating','Opening Hours','Phone','Address','Category'];
  const FIELD = { Name:'name',Website:'website',Email:'email',Rating:'rating','Opening Hours':'hours',Phone:'phone',Address:'address',Category:'category' };
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
