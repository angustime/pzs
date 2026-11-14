// 搜尋：輸入代號或中文名稱，邊打邊跳出下拉選單。
// 股票清單：先用 App 內建的清單（stock-list.js），每 7 天在背景向證交所更新一次，存在本機。

import { STOCK_LIST, STOCK_LIST_DATE } from './stock-list.js';
import { fetchStockList } from './twse.js';

const KEY = 'twstock:v1:stocklist';
const REFRESH_DAYS = 7;
const MAX_ITEMS = 8;
export const CODE_RE = /^[0-9]{4}[0-9A-Z]{0,2}$/;

let list = STOCK_LIST;

function loadCached() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    if (c && Array.isArray(c.list) && c.list.length > 500) return c;
  } catch { /* 忽略 */ }
  return null;
}

// 啟動時呼叫：用本機較新的清單；太舊就在背景更新（不擋畫面）
export function initStockList() {
  const c = loadCached();
  if (c) list = c.list;
  const age = Date.now() - (c ? c.fetchedAt : Date.parse(STOCK_LIST_DATE));
  if (age > REFRESH_DAYS * 86400000) {
    fetchStockList()
      .then((fresh) => {
        if (fresh.length > 500) {
          list = fresh;
          try { localStorage.setItem(KEY, JSON.stringify({ fetchedAt: Date.now(), list: fresh })); } catch { /* 忽略 */ }
        }
      })
      .catch(() => { /* 更新失敗就繼續用舊清單 */ });
  }
}

export const nameOf = (code) => (list.find((s) => s[0] === code) || [])[1] || '';

// 半形化、去空白、轉大寫；「台」「臺」視為相同
const norm = (s) => s.normalize('NFKC').replace(/\s+/g, '').toUpperCase().replace(/臺/g, '台');

// 排序：代號完全相同 > 代號開頭相同 > 名稱開頭相同 > 名稱包含
export function searchStocks(text) {
  const q = norm(text);
  if (!q) return [];
  const scored = [];
  for (const [code, name] of list) {
    const n = norm(name);
    let s = -1;
    if (code === q) s = 0;
    else if (code.startsWith(q)) s = 1;
    else if (n === q) s = 0;
    else if (n.startsWith(q)) s = 2;
    else if (n.includes(q)) s = 3;
    if (s >= 0) scored.push([s, code, name]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  return scored.slice(0, MAX_ITEMS).map(([, code, name]) => ({ code, name }));
}

/**
 * 把輸入框變成可搜尋的下拉選單。
 * @param {{input: HTMLInputElement, list: HTMLUListElement, form: HTMLFormElement, error: HTMLElement}} el
 * @param {(code: string) => void} onPick 選定股票時呼叫
 */
export function setupSearch(el, onPick) {
  let items = [];
  let active = -1;

  const close = () => {
    el.list.hidden = true;
    el.input.setAttribute('aria-expanded', 'false');
    active = -1;
  };
  const showError = (msg) => { el.error.hidden = false; el.error.textContent = msg; };

  function render() {
    if (!items.length) { close(); return; }
    el.list.innerHTML = items.map((s, i) => `<li role="option" data-code="${s.code}" aria-selected="${i === active}" class="${i === active ? 'active' : ''}">
      <b>${s.code}</b><span>${s.name.replace(/[&<>]/g, '')}</span></li>`).join('');
    el.list.hidden = false;
    el.input.setAttribute('aria-expanded', 'true');
  }

  function pick(code) {
    close();
    el.error.hidden = true;
    el.input.value = code;
    el.input.blur();
    onPick(code);
  }

  el.input.addEventListener('input', () => {
    el.error.hidden = true;
    items = searchStocks(el.input.value);
    active = -1;
    render();
  });

  el.input.addEventListener('keydown', (e) => {
    if (el.list.hidden || !items.length) return;
    if (e.key === 'ArrowDown') { active = (active + 1) % items.length; render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = (active - 1 + items.length) % items.length; render(); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });

  // 用 pointerdown，才不會因為輸入框先失去焦點而關掉選單
  el.list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('li[data-code]');
    if (li) { e.preventDefault(); pick(li.dataset.code); }
  });

  el.input.addEventListener('blur', () => setTimeout(close, 150));
  el.input.addEventListener('focus', () => { if (el.input.value) { items = searchStocks(el.input.value); render(); } });

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = el.input.value.trim();
    if (!raw) { showError('請輸入股票代號或名稱，例如 2330 或 台積電。'); return; }
    if (active >= 0 && items[active]) { pick(items[active].code); return; }
    const up = raw.normalize('NFKC').toUpperCase();
    if (CODE_RE.test(up)) { pick(up); return; } // 代號直接查（清單裡沒有也試，可能是新上市）
    const found = searchStocks(raw);
    const exact = found.find((s) => norm(s.name) === norm(raw));
    if (exact || found.length === 1) { pick((exact || found[0]).code); return; }
    if (found.length > 1) { items = found; active = -1; render(); showError('找到好幾檔，請從清單中選一檔。'); return; }
    showError(`找不到「${raw}」。目前只支援上市股票與 ETF，上櫃股票還不支援。`);
  });
}
