import { SOURCES, buildCatalog, externalLinks, fetchSource, filterAndSort } from './catalog.js';

const $ = id => document.getElementById(id);
const filterIds = ['search', 'market', 'type', 'quote', 'gecko', 'minimumVolume', 'minimumOpenInterest', 'sort', 'direction'];
const state = { rows: [], filtered: [], sourceStates: {}, fetchedAt: 0, page: 1, loading: false };
const pageSize = 50;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function formatNumber(value, digits = 0) {
  return value == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
}

function formatPrice(value) {
  if (value == null) return '—';
  return formatNumber(value, value < 0.01 ? 8 : value < 1 ? 6 : 4);
}

function formatDate(value) {
  return value == null ? '—' : new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function filters() {
  return Object.fromEntries(filterIds.map(id => [id, $(id).value]));
}

function renderSources() {
  $('source-list').innerHTML = SOURCES.map(source => {
    const stateForSource = state.sourceStates[source.id] ?? { status: 'waiting', message: 'Waiting' };
    return `<span class="source-chip ${stateForSource.status}" title="${escapeHtml(source.url)}">${escapeHtml(source.label)} · ${escapeHtml(stateForSource.message)}</span>`;
  }).join('');
  const successful = Object.values(state.sourceStates).filter(item => item.status === 'ok').length;
  $('source-count').textContent = `${successful} / ${SOURCES.length}`;
}

function renderStatus() {
  const infoOk = ['usdmInfo', 'coinmInfo'].filter(id => state.sourceStates[id]?.status === 'ok').length;
  const allOk = SOURCES.every(source => state.sourceStates[source.id]?.status === 'ok');
  const status = $('overall-status');
  if (state.loading) {
    status.className = 'overall-status waiting'; status.textContent = 'Requesting sources';
  } else if (infoOk === 0) {
    status.className = 'overall-status error'; status.textContent = 'Binance unavailable';
  } else if (infoOk < 2) {
    status.className = 'overall-status partial'; status.textContent = 'Partial contract universe';
  } else if (!allOk) {
    status.className = 'overall-status partial'; status.textContent = 'Complete contracts · partial metrics';
  } else {
    status.className = 'overall-status'; status.textContent = 'Complete contract snapshot';
  }
  $('contract-count').textContent = state.rows.length ? formatNumber(state.rows.length) : '—';
  $('asset-count').textContent = state.rows.length ? formatNumber(new Set(state.rows.map(row => row.baseAsset)).size) : '—';
  $('updated').textContent = state.fetchedAt ? `Updated ${new Date(state.fetchedAt).toLocaleString()}` : 'Awaiting first request';
  const failed = SOURCES.filter(source => state.sourceStates[source.id]?.status === 'failed');
  const notice = $('notice');
  if (failed.length) {
    notice.className = 'notice warn';
    notice.textContent = `Unavailable: ${failed.map(source => `${source.label} (${state.sourceStates[source.id].message})`).join(', ')}. Missing metrics are shown as —; the contract list is complete only when both Binance contract sources succeed.`;
  } else {
    notice.className = 'notice';
    notice.textContent = 'The browser requests Binance directly. Results depend on your network and provider availability. CoinGecko metrics may lag Binance.';
  }
}

function populateSelect(id, values, allLabel) {
  const select = $(id);
  const previous = select.value;
  select.innerHTML = `<option value="all">${allLabel}</option>${[...values].sort().map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
}

function renderRows() {
  const count = state.filtered.length;
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  state.page = Math.min(state.page, pageCount);
  const start = (state.page - 1) * pageSize;
  const visible = state.filtered.slice(start, start + pageSize);
  $('matching-count').textContent = state.rows.length ? formatNumber(count) : '—';
  $('export').disabled = !count;
  $('rows').innerHTML = visible.length ? visible.map(row => {
    const changeClass = row.priceChangePercent == null ? '' : row.priceChangePercent >= 0 ? 'positive' : 'negative';
    const changeText = row.priceChangePercent == null ? '—' : `${row.priceChangePercent > 0 ? '+' : ''}${formatNumber(row.priceChangePercent, 2)}%`;
    const links = externalLinks(row).map(link => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(row.baseAsset)} on ${escapeHtml(link.label)}">${escapeHtml(link.label)} ↗</a>`).join('');
    return `<tr>
      <td><div class="contract">${escapeHtml(row.symbol)}</div></td>
      <td class="token">${escapeHtml(row.baseAsset)}</td>
      <td><span class="badge ${row.market === 'USD-M' ? 'usdm' : 'coinm'}">${row.market === 'USD-M' ? 'USDⓈ-M' : 'COIN-M'}</span></td>
      <td class="type">${escapeHtml(row.contractType)}</td>
      <td>${formatDate(row.onboardDate)}</td>
      <td class="numeric">${formatPrice(row.lastPrice)}</td>
      <td class="numeric ${changeClass}">${changeText}</td>
      <td class="numeric">${formatNumber(row.quoteVolume, 0)}${row.quoteVolume == null ? '' : ` <span class="volume-unit">${escapeHtml(row.quoteAsset)}</span>`}</td>
      <td class="numeric">${formatNumber(row.openInterestUsd, 0)}</td>
      <td class="numeric">${row.fundingRate == null ? '—' : `${formatNumber(row.fundingRate, 6)}%`}</td>
      <td><div class="links">${links}</div></td>
    </tr>`;
  }).join('') : `<tr><td colspan="11" class="empty-state">${state.loading ? 'Fetching market data…' : state.rows.length ? 'No contracts match these filters.' : 'No Binance contracts available from this browser. Check the source status below.'}</td></tr>`;
  $('range').textContent = count ? `Showing ${formatNumber(start + 1)}–${formatNumber(Math.min(start + pageSize, count))} of ${formatNumber(count)} matching contracts` : 'No matching contracts';
  $('page-count').textContent = count ? `${formatNumber(pageSize)} per page` : '—';
  $('page-number').textContent = count ? `${state.page} / ${pageCount}` : '—';
  $('previous').disabled = state.page <= 1;
  $('next').disabled = state.page >= pageCount;
}

function renderSortHeaders() {
  const selected = $('sort').value;
  const direction = $('direction').value;
  for (const heading of document.querySelectorAll('th[data-sort]')) {
    const active = heading.dataset.sort === selected;
    heading.setAttribute('aria-sort', active ? direction === 'asc' ? 'ascending' : 'descending' : 'none');
    heading.querySelector('.sort-icon').textContent = active ? direction === 'asc' ? '↑' : '↓' : '↕';
  }
}

function updateFiltered() {
  state.filtered = filterAndSort(state.rows, filters());
  renderSortHeaders();
  renderRows();
}

async function refresh(force = false) {
  if (state.loading) return;
  if (!force && state.fetchedAt && Date.now() - state.fetchedAt < 120000) return;
  state.loading = true;
  $('refresh').disabled = true;
  state.sourceStates = Object.fromEntries(SOURCES.map(source => [source.id, { status: 'loading', message: 'Loading' }]));
  renderSources(); renderStatus(); renderRows();
  const results = await Promise.all(SOURCES.map(async source => {
    try {
      const value = await fetchSource(source);
      state.sourceStates[source.id] = { status: 'ok', message: 'OK' };
      renderSources();
      return [source.id, value];
    } catch (error) {
      const message = error?.name === 'AbortError' ? 'Timeout' : error?.message?.startsWith('HTTP ') ? error.message : 'Network / CORS error';
      state.sourceStates[source.id] = { status: 'failed', message };
      renderSources();
      return [source.id, null];
    }
  }));
  const values = Object.fromEntries(results);
  state.rows = buildCatalog(values);
  state.fetchedAt = Date.now();
  state.page = 1;
  populateSelect('type', new Set(state.rows.map(row => row.contractType)), 'All types');
  populateSelect('quote', new Set(state.rows.map(row => row.quoteAsset)), 'All quotes');
  state.loading = false;
  $('refresh').disabled = false;
  renderStatus(); updateFiltered();
}

function exportCsv() {
  const fields = ['market', 'symbol', 'baseAsset', 'quoteAsset', 'contractType', 'onboardDate', 'lastPrice', 'priceChangePercent', 'quoteVolume', 'coinGeckoId', 'openInterestUsd', 'fundingRate'];
  const escapeCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [fields.join(','), ...state.filtered.map(row => fields.map(field => escapeCell(row[field])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'binance-futures-catalog.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

for (const id of filterIds) $(id).addEventListener(id === 'search' || id.startsWith('minimum') ? 'input' : 'change', () => { state.page = 1; updateFiltered(); });
$('filters').addEventListener('submit', event => event.preventDefault());
for (const heading of document.querySelectorAll('th[data-sort]')) {
  heading.querySelector('button').addEventListener('click', () => {
    const key = heading.dataset.sort;
    const current = $('sort').value;
    const alphabetic = ['symbol', 'baseAsset', 'market', 'contractType'].includes(key);
    $('direction').value = current === key
      ? $('direction').value === 'asc' ? 'desc' : 'asc'
      : alphabetic ? 'asc' : 'desc';
    $('sort').value = key;
    state.page = 1;
    document.querySelector('.table-wrap').scrollTop = 0;
    updateFiltered();
  });
}
$('refresh').addEventListener('click', () => refresh(true));
$('clear').addEventListener('click', () => {
  $('filters').reset();
  $('more-filters').open = false;
  state.page = 1;
  updateFiltered();
});
$('export').addEventListener('click', exportCsv);
$('previous').addEventListener('click', () => { state.page--; document.querySelector('.table-wrap').scrollTop = 0; renderRows(); });
$('next').addEventListener('click', () => { state.page++; document.querySelector('.table-wrap').scrollTop = 0; renderRows(); });
document.addEventListener('click', event => {
  if (!$('more-filters').contains(event.target)) $('more-filters').open = false;
});
renderSources();
renderSortHeaders();
refresh();
