// 籌碼資料：三大法人買賣超（T86）與融資融券（MI_MARGN）。
// 證交所一次回一天「全部股票」，所以整天的資料精簡後存本機，換看別檔股票不用重抓。

import { CONFIG } from './config.js';
import { BASE, NO_DATA, throttledFetchJson, FetchError } from './twse.js';

const PREFIX = 'twstock:v1:chips:';
const num = (s) => {
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const toLots = (shares) => Math.round(shares / 1000); // 股 → 張

function load(kind, date) {
  try { return JSON.parse(localStorage.getItem(PREFIX + kind + ':' + date)); } catch { return null; }
}
function save(kind, date, value) {
  try { localStorage.setItem(PREFIX + kind + ':' + date, JSON.stringify(value)); } catch { /* 空間不足就不存 */ }
}

// 只保留需要的日期，避免本機資料越存越多
function prune(keepDates) {
  try {
    const keep = new Set();
    for (const d of keepDates) { keep.add(PREFIX + 'T86:' + d); keep.add(PREFIX + 'MARGIN:' + d); }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && !keep.has(k)) localStorage.removeItem(k);
    }
  } catch { /* 忽略 */ }
}

const ymd = (iso) => iso.replaceAll('-', '');

// 三大法人：回傳 { 代號: [外資, 投信, 自營商, 合計] }（單位：張）
async function fetchT86(date) {
  const json = await throttledFetchJson(`${BASE}/fund/T86?date=${ymd(date)}&selectType=ALLBUT0999&response=json`);
  if (json.stat !== 'OK') {
    if (String(json.stat).includes(NO_DATA)) return null;
    throw new FetchError(`證交所回覆：${json.stat}`);
  }
  const f = json.fields || [];
  const idx = (name) => f.findIndex((x) => x.includes(name));
  const iForeign = idx('外陸資買賣超股數');
  const iForeignDealer = idx('外資自營商買賣超股數');
  const iTrust = idx('投信買賣超股數');
  const iDealer = f.findIndex((x) => x === '自營商買賣超股數');
  const iTotal = idx('三大法人買賣超股數');
  if ([iForeign, iTrust, iDealer, iTotal].some((i) => i < 0)) throw new FetchError('三大法人資料格式改變，請通知維護者。');
  const out = {};
  for (const r of json.data || []) {
    const code = String(r[0]).trim();
    const foreign = num(r[iForeign]) + (iForeignDealer >= 0 ? num(r[iForeignDealer]) : 0);
    out[code] = [toLots(foreign), toLots(num(r[iTrust])), toLots(num(r[iDealer])), toLots(num(r[iTotal]))];
  }
  return out;
}

// 融資融券：回傳 { 代號: [融資餘額, 融券餘額] }（單位：張）
async function fetchMargin(date) {
  const json = await throttledFetchJson(`${BASE}/marginTrading/MI_MARGN?date=${ymd(date)}&selectType=ALL&response=json`);
  if (json.stat !== 'OK') {
    if (String(json.stat).includes(NO_DATA)) return null;
    throw new FetchError(`證交所回覆：${json.stat}`);
  }
  const table = (json.tables || []).find((t) => String(t.title || '').includes('融資融券彙總'));
  if (!table || !table.data) return null;
  const f = table.fields || [];
  // 欄位：代號, 名稱, [融資] 買進, 賣出, 現金償還, 前日餘額, 今日餘額, 限額, [融券] 買進, 賣出, 現券償還, 前日餘額, 今日餘額, 限額, 資券互抵, 註記
  // 融資、融券欄位名稱重複，只能靠位置；先確認位置 6、12 都叫「今日餘額」
  if (f[6] !== '今日餘額' || f[12] !== '今日餘額') throw new FetchError('融資融券資料格式改變，請通知維護者。');
  const out = {};
  for (const r of table.data) out[String(r[0]).trim()] = [num(r[6]), num(r[12])];
  return out;
}

const FETCHERS = { T86: fetchT86, MARGIN: fetchMargin };

/**
 * 確保指定交易日的法人與融資資料都在本機。
 * @param {string[]} dates 交易日（新到舊或舊到新都可）
 * @param {(done:number,total:number)=>void} onProgress
 * @returns {Promise<{error: string|null}>}
 */
export async function ensureChips(dates, onProgress = () => {}) {
  const now = Date.now();
  const retryMs = CONFIG.chipsRetryMinutes * 60 * 1000;
  const todo = [];
  // 新的日期先抓，萬一中途失敗，最近幾天至少有資料
  for (const d of [...dates].sort().reverse()) {
    for (const kind of ['T86', 'MARGIN']) {
      const c = load(kind, d);
      if (c && c.found) continue;
      if (c && !c.found && now - c.fetchedAt < retryMs) continue; // 剛確認還沒公布，先不重試
      todo.push([kind, d]);
    }
  }
  let error = null;
  for (let i = 0; i < todo.length; i++) {
    onProgress(i, todo.length);
    const [kind, d] = todo[i];
    try {
      const data = await FETCHERS[kind](d);
      save(kind, d, { fetchedAt: Date.now(), found: !!data, data: data || null });
    } catch (e) {
      error = e instanceof FetchError ? e.message : '下載法人／融資資料時發生未預期的錯誤。';
      break;
    }
  }
  onProgress(todo.length, todo.length);
  prune(dates);
  return { error };
}

/**
 * 讀出某檔股票在這些日期的籌碼資料（只讀本機）。
 * 回傳舊到新：[{ date, inst: {foreign, trust, dealer, total} | null, margin: {margin, short} | null }]
 */
export function readChips(code, dates) {
  return [...dates].sort().map((date) => {
    const t = load('T86', date);
    const m = load('MARGIN', date);
    const ti = t && t.found ? t.data[code] : undefined;
    const mi = m && m.found ? m.data[code] : undefined;
    return {
      date,
      // 該日有公布但這檔不在名單內 = 當天法人沒有買賣，記 0
      inst: t && t.found ? (ti ? { foreign: ti[0], trust: ti[1], dealer: ti[2], total: ti[3] } : { foreign: 0, trust: 0, dealer: 0, total: 0 }) : null,
      margin: mi ? { margin: mi[0], short: mi[1] } : null,
    };
  });
}
