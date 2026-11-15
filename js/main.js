// 畫面主程式：查詢、顯示股價摘要與線圖、分頁切換。

import { getStockData } from './data.js';
import { renderPreview, renderFull, renderTrend, renderIndicator } from './chart.js';
import { CONFIG } from './config.js';
import { shortDateLabel } from './dates.js';
import { loadLastCode, saveLastCode } from './store.js';
import { ensureChips, readChips } from './chips.js';
import { evaluate } from './rules.js';
import { renderMore } from './links.js';
import { refOf } from './price.js';
import { initStockList, setupSearch, nameOf } from './search.js';
import { setupWatchUI } from './watch-ui.js';
import { INDUSTRY } from './industry.js';
import { GLOSSARY } from './glossary.js';
import { renderVerdict, buildCards, updateCards, renderChipsTable, renderMarginTable, setupGlossary } from './ui-state.js';

const $ = (id) => document.getElementById(id);
const el = {
  form: $('searchForm'), input: $('codeInput'), inputError: $('inputError'),
  welcome: $('welcome'), status: $('status'), stock: $('stock'),
  exRightTag: $('exRightTag'), industry: $('industry'), watchBar: $('watchBar'), watchBtn: $('watchBtn'),
  name: $('stockName'), code: $('stockCode'), close: $('close'), change: $('change'),
  asOf: $('asOf'), stale: $('staleWarn'),
  previewBox: $('previewBox'), previewChart: $('previewChart'), trendChart: $('trendChart'), trendDays: $('trendDays'),
  dOpen: $('dOpen'), dHigh: $('dHigh'), dLow: $('dLow'), dRef: $('dRef'), dVol: $('dVol'), dAmp: $('dAmp'),
  morePanel: $('morePanel'),
  verdict: $('verdict'), stateCards: $('stateCards'), chipsPanel: $('chipsPanel'), marginPanel: $('marginPanel'),
  full: $('fullView'), fullTitle: $('fullTitle'), fullLegend: $('fullLegend'), fullChart: $('fullChart'), closeFull: $('closeFull'),
};

let current = null;       // 目前顯示的 { code, name, rows }
let fullChart = null;
let panelCharts = {};     // 分頁裡的圖：切到該分頁時才畫（隱藏中的元素量不到寬度）
let indType = 'volume';   // 技術指標卡片目前的分頁
let lastResult = null;
let cardsFor = null;      // 卡片骨架與指標小圖是為哪一筆資料建的
let chipsStatus = { ready: false, message: null, error: null };
let queryToken = 0;       // 避免連按兩次查詢時舊結果蓋掉新結果

function showStatus(text, isError = false) {
  el.status.hidden = false;
  el.status.textContent = text;
  el.status.classList.toggle('error', isError);
}
function hideStatus() { el.status.hidden = true; }

const fmt = (n) => (Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

async function query(code) {
  const token = ++queryToken;
  el.welcome.hidden = true;
  el.stock.hidden = true;
  showStatus('準備查詢…');

  const res = await getStockData(code, (msg) => { if (token === queryToken) showStatus(msg); });
  if (token !== queryToken) return;

  if (res.status === 'notfound') {
    showStatus(`查不到代號 ${code} 的資料。目前只支援上市股票（上櫃股票還不支援），請確認代號是否正確。`, true);
    return;
  }
  if (res.status === 'error') {
    showStatus(`無法取得資料：${res.error}`, true);
    return;
  }
  if (res.rows.length < 2) {
    showStatus('這檔股票的交易資料太少，暫時無法顯示。', true);
    return;
  }

  hideStatus();
  saveLastCode(code);
  current = { code, name: res.name || nameOf(code), rows: res.rows };
  render(res);
  loadChips(token);
}

// 籌碼資料在背景下載，下載完重新判定一次（股價先顯示，不讓使用者乾等）
function chipDates() {
  return current.rows.slice(-CONFIG.chipsDays).map((r) => r.date);
}
async function loadChips(token) {
  chipsStatus = { ready: false, message: '法人與融資資料準備中…', error: null };
  renderAnalysis();
  const { error } = await ensureChips(chipDates(), (done, total) => {
    if (token !== queryToken || total === 0 || done >= total) return;
    const sec = Math.ceil(((total - done) * CONFIG.requestGapMs) / 1000);
    chipsStatus.message = `法人與融資資料下載中（${done}/${total}），約需 ${sec} 秒。下載過的日期換看別檔股票不用再等。`;
    renderAnalysis(false);
  });
  if (token !== queryToken) return;
  chipsStatus = { ready: true, message: null, error };
  renderAnalysis();
}

// 技術指標卡片的小圖：換分頁時重畫
function renderIndChart() {
  const node = el.stateCards.querySelector('.ind-chart');
  if (!node || !current) return;
  if (panelCharts.ind) panelCharts.ind.remove();
  panelCharts.ind = renderIndicator(node, current.rows, indType);
}

// 重新判定並畫出狀態頁、法人、融資券
function renderAnalysis(full = true) {
  if (!current) return;
  const chips = readChips(current.code, chipDates());
  const result = evaluate(current.rows, chips, chipsStatus);
  if (full) renderVerdict(el.verdict, result);
  else if (!el.verdict.innerHTML) renderVerdict(el.verdict, result);
  if (cardsFor !== current) {
    buildCards(el.stateCards);
    cardsFor = current;
    renderIndChart();
  }
  lastResult = result;
  updateCards(el.stateCards, result, indType);
  renderChipsTable(el.chipsPanel, chips, chipsStatus);
  renderMarginTable(el.marginPanel, chips, chipsStatus);
}

function render(res) {
  const { rows } = res;
  const last = rows[rows.length - 1];
  const { ref, exRight, unknown } = refOf(rows, rows.length - 1);
  const chg = last.close - ref;
  const pct = (chg / ref) * 100;
  const cls = chg > 0 ? 'up' : chg < 0 ? 'down' : '';
  const arrow = chg > 0 ? '▲' : chg < 0 ? '▼' : '';

  el.name.textContent = res.name || current.code;
  el.code.textContent = current.code;
  // 產業別（證交所官方分類，靜態資料）；ETF 等有名詞解釋的就做成可點的按鈕
  const ind = INDUSTRY[current.code] || '';
  el.industry.innerHTML = '';
  if (ind && GLOSSARY[ind]) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'term industry-term'; b.dataset.term = ind;
    b.innerHTML = `${ind}<span aria-hidden="true">?</span>`;
    el.industry.append(b);
  } else {
    el.industry.textContent = ind;
  }
  el.close.textContent = fmt(last.close);
  el.close.className = 'close ' + cls;
  el.change.textContent = `${arrow}${fmt(Math.abs(chg))}（${pct >= 0 ? '' : '−'}${Math.abs(pct).toFixed(2)}%）`;
  el.change.className = 'change ' + cls;
  el.exRightTag.hidden = !exRight;
  el.exRightTag.textContent = unknown ? '除權息（參考價未取得）' : '除權息';
  el.asOf.textContent = `資料截至 ${shortDateLabel(last.date)} 收盤（盤後資料）`;

  if (res.stale) {
    el.stale.hidden = false;
    el.stale.textContent = `資料更新失敗，以下是 ${shortDateLabel(last.date)} 的舊資料，可能不是最新。原因：${res.error}`;
  } else {
    el.stale.hidden = true;
  }

  el.stock.hidden = false;
  renderDayGrid(last, ref);
  renderMore(el.morePanel, current.code, res.name || current.code);
  watchUI.refresh();
  for (const c of Object.values(panelCharts)) c.remove();
  panelCharts = {};
  cardsFor = null;
  selectTab('state');
}

// 當天數字：開高低與昨收比較，比昨收高顯示紅、低顯示綠（台股慣例）
function renderDayGrid(last, ref) {
  const colored = (node, v) => {
    node.textContent = fmt(v);
    node.className = 'val ' + (v > ref ? 'up' : v < ref ? 'down' : '');
  };
  colored(el.dOpen, last.open);
  colored(el.dHigh, last.high);
  colored(el.dLow, last.low);
  el.dRef.textContent = fmt(ref);
  el.dRef.className = 'val';
  el.dVol.textContent = Math.round(last.volume / 1000).toLocaleString() + ' 張';
  el.dAmp.textContent = (((last.high - last.low) / ref) * 100).toFixed(2) + '%';
}

function selectTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  if (!current || panelCharts[name]) return;
  if (name === 'state') {
    el.trendDays.textContent = CONFIG.trendDays;
    panelCharts.state = renderTrend(el.trendChart, current.rows, CONFIG.trendDays);
  } else if (name === 'kline') {
    panelCharts.kline = renderPreview(el.previewChart, current.rows);
  }
}

function openFull() {
  if (!current) return;
  el.full.hidden = false;
  el.fullTitle.textContent = `${current.name} ${current.code} K 線圖`;
  fullChart = renderFull(el.fullChart, el.fullLegend, current.rows);
  history.pushState({ full: true }, ''); // 讓手機「返回」鍵可以關閉放大圖
}
function closeFull(fromPopstate = false) {
  if (el.full.hidden) return;
  el.full.hidden = true;
  if (fullChart) { fullChart.remove(); fullChart = null; }
  if (!fromPopstate && history.state && history.state.full) history.back();
}

// ---- 事件 ----
initStockList();
// 自選名單（點自選股 = 一般查詢，會補抓最新資料）
const watchUI = setupWatchUI(
  { bar: el.watchBar, panel: $('watchPanel'), sheet: $('watchSheet'), choices: $('watchChoices'), sheetClose: $('watchSheetClose'), starBtn: el.watchBtn },
  { onPick: (code) => { el.input.value = code; query(code); }, getCurrent: () => current },
);
setupSearch({ input: el.input, list: $('suggest'), form: el.form, error: el.inputError }, query);
document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  selectTab(b.dataset.tab);
});
el.previewBox.addEventListener('click', openFull);
el.stateCards.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-ind]');
  if (!b || b.dataset.ind === indType) return;
  indType = b.dataset.ind;
  renderIndChart();
  if (lastResult) updateCards(el.stateCards, lastResult, indType);
});
el.closeFull.addEventListener('click', () => closeFull());
window.addEventListener('popstate', () => closeFull(true));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFull(); });

setupGlossary($('termSheet'));

// 離線快取（加入主畫面後沒網路也能打開）。本機 file:// 開啟時不支援，略過。
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 失敗不影響使用 */ });
}

// 開啟時自動顯示上次查的股票
const lastCode = loadLastCode();
if (lastCode) {
  el.input.value = lastCode;
  query(lastCode);
}
