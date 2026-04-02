'use strict';

// ── State ───────────────────────────────────────────────
let allRows     = [];
let filteredRows= [];
let sortCol     = null;
let sortDir     = 'asc';
let filterMode  = 'all';
let searchQuery = '';
let currentCSV  = '';
let currentFilename = 'maps_leads.csv';

// ── DOM refs ────────────────────────────────────────────
const loadingState = document.getElementById('loadingState');
const emptyState   = document.getElementById('emptyState');
const tableWrap    = document.getElementById('tableWrap');
const tbody        = document.getElementById('tbody');
const queryBar     = document.getElementById('queryBar');
const queryText    = document.getElementById('queryText');
const queryTime    = document.getElementById('queryTime');
const toolbar      = document.getElementById('toolbar');
const statTotal    = document.getElementById('statTotal');
const statEmails   = document.getElementById('statEmails');
const statSites    = document.getElementById('statSites');
const filterCount  = document.getElementById('filterCount');
const footerInfo   = document.getElementById('footerInfo');
const searchInput  = document.getElementById('searchInput');

// ── Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadData);

async function loadData() {
  // Read from chrome.storage (set by background.js when scraping completes)
  try {
    const data = await new Promise(resolve =>
      chrome.storage.local.get(['viewerData'], d => resolve(d.viewerData))
    );

    if (!data || !data.results || data.results.length === 0) {
      loadingState.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    allRows         = data.results;
    currentCSV      = data.csv || buildCSV(allRows);
    currentFilename = data.filename || `maps_leads_${Date.now()}.csv`;

    // Populate query bar
    queryText.textContent = data.query || 'Unknown query';
    queryTime.textContent = data.savedAt
      ? `Scraped ${timeAgo(data.savedAt)}`
      : '';
    queryBar.style.display = 'flex';
    toolbar.style.display  = 'flex';

    applyFilters();
    updateStats();

    loadingState.style.display  = 'none';
    tableWrap.style.display     = 'block';
    footerInfo.textContent = `${allRows.length} results · ${currentFilename}`;

  } catch (e) {
    loadingState.style.display = 'none';
    emptyState.style.display = 'block';
    console.error('[Viewer] Load error:', e);
  }
}

// ── Build CSV from rows (fallback) ─────────────────────
function buildCSV(rows) {
  const COLS  = ['Name','Website','Email','Social Media','Rating','Opening Hours','Phone','Address','Category'];
  const FIELD = { Name:'name',Website:'website',Email:'email','Social Media':'socials',Rating:'rating',
    'Opening Hours':'hours',Phone:'phone',Address:'address',Category:'category' };
  const esc = v => `"${String(v||'N/A').replace(/"/g,'""')}"`;
  return [COLS.join(','), ...rows.map(r => COLS.map(c=>esc(r[FIELD[c]])).join(','))].join('\r\n');
}

// ── Render table ────────────────────────────────────────
function renderTable() {
  tbody.innerHTML = '';
  if (filteredRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--m);font-size:13px">No results match your filter.</td></tr>`;
    return;
  }

  filteredRows.forEach((r, i) => {
    const hasEmail   = r.email   && r.email   !== 'N/A';
    const hasWebsite = r.website && r.website !== 'N/A';
    const hasPhone   = r.phone   && r.phone   !== 'N/A';
    const hasHours   = r.hours   && r.hours   !== 'N/A';
    const hasAddr    = r.address && r.address !== 'N/A';
    const hasSocials = r.socials && r.socials !== 'N/A';
    const ratingNum  = parseFloat(r.rating);
    const stars      = !isNaN(ratingNum) ? '★'.repeat(Math.round(ratingNum)).padEnd(5,'☆') : '';

    // Truncate long strings for display
    const trunc = (s, n) => s && s.length > n ? s.slice(0, n) + '…' : (s || '—');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="cell-name" title="${esc(r.name)}">${esc(trunc(r.name, 34))}</td>
      <td class="cell-rating">
        ${!isNaN(ratingNum)
          ? `<span class="star">${ratingNum.toFixed(1)}</span><span style="color:var(--amber);font-size:10px;margin-left:4px">${stars}</span>`
          : '<span style="color:var(--m)">—</span>'}
      </td>
      <td class="cell-email">
        ${hasEmail
          ? `<a href="mailto:${esc(r.email)}" title="${esc(r.email)}">${esc(trunc(r.email, 28))}</a>`
          : '<span class="no">—</span>'}
      </td>
      <td class="cell-social" title="${esc(r.socials)}">
        ${hasSocials ? esc(trunc(r.socials, 30)) : '<span class="no">—</span>'}
      </td>
      <td class="cell-web">
        ${hasWebsite
          ? `<a href="${esc(r.website)}" target="_blank" rel="noopener" title="${esc(r.website)}">
               <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
               ${esc(trunc(r.website.replace(/^https?:\/\//,''), 24))}
             </a>`
          : '<span class="no">—</span>'}
      </td>
      <td class="cell-hours" title="${esc(r.hours)}">${hasHours ? esc(trunc(r.hours, 30)) : '<span style="color:var(--m)">—</span>'}</td>
      <td class="cell-phone">${hasPhone ? esc(r.phone) : '<span style="color:var(--m)">—</span>'}</td>
      <td class="cell-addr" title="${esc(r.address)}">${hasAddr ? esc(trunc(r.address, 28)) : '<span style="color:var(--m)">—</span>'}</td>
      <td><span class="cell-cat">${esc(trunc(r.category, 20))}</span></td>
    `;
    tbody.appendChild(tr);
  });

  filterCount.textContent = filteredRows.length < allRows.length
    ? `${filteredRows.length} of ${allRows.length} shown`
    : '';
}

// ── Filter + search ─────────────────────────────────────
function applyFilters() {
  let rows = [...allRows];

  if (filterMode === 'email')   rows = rows.filter(r => r.email   && r.email   !== 'N/A');
  if (filterMode === 'website') rows = rows.filter(r => r.website && r.website !== 'N/A');

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    rows = rows.filter(r =>
      [r.name, r.email, r.address, r.category, r.phone, r.socials]
        .some(v => v && v.toLowerCase().includes(q))
    );
  }

  if (sortCol) {
    rows.sort((a, b) => {
      const av = (a[sortCol] || '').toString().toLowerCase();
      const bv = (b[sortCol] || '').toString().toLowerCase();
      // Numeric sort for rating
      if (sortCol === 'rating') {
        const an = parseFloat(av) || 0;
        const bn = parseFloat(bv) || 0;
        return sortDir === 'asc' ? an - bn : bn - an;
      }
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }

  filteredRows = rows;
  renderTable();
}

function setFilter(mode) {
  filterMode = mode;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  const active = document.querySelector(`.filter-btn[data-filter="${mode}"]`);
  if (active) active.classList.add('active');
  applyFilters();
}

// Wire filter buttons via event delegation — no inline handlers
document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => setFilter(btn.dataset.filter));
});

searchInput.addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  applyFilters();
});

// ── Sort ────────────────────────────────────────────────
const COL_MAP = {
  name:'name', rating:'rating', email:'email', website:'website',
  hours:'hours', phone:'phone', address:'address', category:'category'
};

document.querySelectorAll('thead th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    const col = COL_MAP[th.dataset.col];
    if (!col) return;
    if (sortCol === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = col; sortDir = 'asc';
    }
    document.querySelectorAll('thead th').forEach(t => t.classList.remove('sort-asc','sort-desc'));
    th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    applyFilters();
  });
});

// ── Stats ───────────────────────────────────────────────
function updateStats() {
  const total  = allRows.length;
  const emails = allRows.filter(r => r.email   && r.email   !== 'N/A').length;
  const sites  = allRows.filter(r => r.website && r.website !== 'N/A').length;
  statTotal.textContent  = total;
  statEmails.textContent = emails;
  statSites.textContent  = sites;
}

// ── Download CSV ────────────────────────────────────────
document.getElementById('btnDownload').addEventListener('click', () => {
  triggerDownload(currentCSV, currentFilename);
  showToast('CSV saved to Downloads folder', 'success');
});

function triggerDownload(csvStr, filename) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['\uFEFF' + csvStr], { type: 'text/csv;charset=utf-8;' })),
    download: filename
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Google Sheets ───────────────────────────────────────
document.getElementById('btnSheets').addEventListener('click', () => {
  triggerDownload(currentCSV, currentFilename);
  document.getElementById('sheetsModal').classList.add('show');
});

document.getElementById('btnSheetsGo').addEventListener('click', () => {
  window.open('https://sheets.new', '_blank');
  document.getElementById('sheetsModal').classList.remove('show');
});

// ── Excel Online ────────────────────────────────────────
document.getElementById('btnExcel').addEventListener('click', () => {
  triggerDownload(currentCSV, currentFilename);
  document.getElementById('excelModal').classList.add('show');
});

document.getElementById('btnExcelGo').addEventListener('click', () => {
  window.open('https://www.office.com/launch/excel', '_blank');
  document.getElementById('excelModal').classList.remove('show');
});

// ── Close modals ────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}
// Cancel buttons (no inline handlers)
document.getElementById('btnSheetsCancelModal').addEventListener('click', () => closeModal('sheetsModal'));
document.getElementById('btnExcelCancelModal').addEventListener('click',  () => closeModal('excelModal'));
// Click outside modal to close
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', e => {
    if (e.target === bg) bg.classList.remove('show');
  });
});

// ── Copy all emails ─────────────────────────────────────
document.getElementById('btnCopyEmails').addEventListener('click', () => {
  const emails = allRows
    .map(r => r.email)
    .filter(e => e && e !== 'N/A');

  if (!emails.length) {
    showToast('No emails found in this dataset', 'error');
    return;
  }

  navigator.clipboard.writeText(emails.join('\n')).then(() => {
    const btn = document.getElementById('btnCopyEmails');
    btn.classList.add('copied');
    const orig = btn.innerHTML;
    btn.innerHTML = btn.innerHTML.replace('Copy Emails', `Copied ${emails.length}!`);
    setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = orig; }, 2000);
    showToast(`${emails.length} emails copied to clipboard`, 'success');
  });
});

// ── Listen for new data from background ─────────────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.viewerData) {
    loadData(); // reload when background updates the data
  }
});

// ── Toast ────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const existing = document.getElementById('viewer-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'viewer-toast';
  t.className = 'toast' + (type === 'error' ? ' error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.style.opacity = '0', 2800);
  setTimeout(() => t.remove(), 3200);
}

// ── Time ago ─────────────────────────────────────────────
function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)} hr ago`;
  return new Date(ts).toLocaleDateString();
}

// ── HTML escape ──────────────────────────────────────────
function esc(s) {
  return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
