// 向證交所抓資料。所有請求都經過 throttledFetch，保證間隔，避免被封 IP。

import { CONFIG } from './config.js';
import { rocToIso } from './dates.js';

export const BASE = 'https://www.twse.com.tw/rwd/zh';
export const NO_DATA = '很抱歉，沒有符合條件的資料';

let lastRequestAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 給使用者看的錯誤
export class FetchError extends Error {}

// 所有請求排隊一個一個來（股價和法人資料可能同時要抓），保證間隔
let queue = Promise.resolve();
function enqueue(job) {
  const p = queue.then(job);
  queue = p.catch(() => {});
  return p;
}
export const throttledFetchJson = (url) => enqueue(() => fetchNow(url, true));
export const throttledFetchText = (url) => enqueue(() => fetchNow(url, false));

async function fetchNow(url, asJson) {
  const wait = lastRequestAt + CONFIG.requestGapMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.requestTimeoutMs);
  let res;
  try {
    // 注意：不能帶自訂標頭，否則瀏覽器會送 OPTIONS 預檢，證交所會回 405
    res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } catch (e) {
    throw new FetchError(e.name === 'AbortError'
      ? '連線證交所逾時，請稍後再試。'
      : '連不上證交所，請檢查網路後再試。');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new FetchError(`證交所回應錯誤（HTTP ${res.status}），請稍後再試。`);
  const text = await res.text();
  if (!asJson) return text;
  try {
    return JSON.parse(text);
  } catch {
    // 被封鎖或維護時常回 HTML 頁面
    throw new FetchError('證交所暫時沒有回應正確資料（可能請求太頻繁或系統維護），請過幾分鐘再試。');
  }
}

const num = (s) => {
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

// 抓某檔股票某個月的日資料。month 格式 "2026-11"。
// 回傳 { found: true, name, rows } 或 { found: false }（該月無資料或查無此股）
export async function fetchStockMonth(code, month) {
  const date = month.replace('-', '') + '01';
  const url = `${BASE}/afterTrading/STOCK_DAY?date=${date}&stockNo=${encodeURIComponent(code)}&response=json`;
  const json = await throttledFetchJson(url);

  if (json.stat !== 'OK') {
    if (String(json.stat).includes(NO_DATA)) return { found: false };
    throw new FetchError(`證交所回覆：${json.stat}`);
  }

  // 標題範例："115年11月 2330 台積電           各日成交資訊"
  const m = String(json.title || '').match(/\d+\s+(\S+)\s+各日/);
  const name = m ? m[1] : '';

  const rows = [];
  for (const r of json.data || []) {
    // 欄位：日期, 成交股數, 成交金額, 開盤, 最高, 最低, 收盤, 漲跌價差, 成交筆數, 註記
    const row = {
      date: rocToIso(r[0]),
      open: num(r[3]), high: num(r[4]), low: num(r[5]), close: num(r[6]),
      volume: num(r[1]), // 股
    };
    // 當天沒有成交（暫停交易等）價格會是 "--"，略過
    if ([row.open, row.high, row.low, row.close].some((v) => v == null)) continue;
    // 漲跌價差：一般是 "+15.00"、"-10.00"、" 0.00"；除權息等「不比價」的日子是 "X0.00"
    const ch = String(r[7] || '').trim();
    if (ch.startsWith('X')) row.exRight = true;
    else { const v = num(ch.replace('+', '')); if (v != null) row.change = v; }
    rows.push(row);
  }
  return { found: true, name, rows };
}

// 除權除息計算結果表：回傳 { 代號: 除權息參考價 }（日期區間內，同一檔取最後一筆）
export async function fetchExRight(startIso, endIso) {
  const ymd = (s) => s.replaceAll('-', '');
  const json = await throttledFetchJson(`${BASE}/exRight/TWT49U?startDate=${ymd(startIso)}&endDate=${ymd(endIso)}&response=json`);
  if (json.stat !== 'OK') {
    if (String(json.stat).includes(NO_DATA)) return {};
    throw new FetchError(`證交所回覆：${json.stat}`);
  }
  // 欄位：資料日期（115年10月22日）, 股票代號, 股票名稱, 除權息前收盤價, 除權息參考價, ...
  const f = json.fields || [];
  const iCode = f.indexOf('股票代號'), iRef = f.indexOf('除權息參考價'), iDate = f.indexOf('資料日期');
  if (iCode < 0 || iRef < 0 || iDate < 0) throw new FetchError('除權息資料格式改變，請通知維護者。');
  const out = {};
  for (const r of json.data || []) {
    const m = String(r[iDate]).match(/(\d+)年(\d+)月(\d+)日/);
    if (!m) continue;
    const date = `${+m[1] + 1911}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    const ref = num(r[iRef]);
    if (ref != null) out[`${String(r[iCode]).trim()}@${date}`] = ref;
  }
  return out;
}

// 全部上市股票與 ETF 的代號、名稱（每日收盤行情，CSV 格式）
export async function fetchStockList() {
  const text = await throttledFetchText(`${BASE}/afterTrading/STOCK_DAY_ALL?response=csv`);
  return parseStockListCsv(text);
}

// CSV 第一列是標題：日期,證券代號,證券名稱,...；欄位都用雙引號包起來
export function parseStockListCsv(text) {
  const list = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].trim());
    if (cells.length < 3 || !/^\d{4}[0-9A-Z]{0,2}$/.test(cells[1])) continue;
    list.push([cells[1], cells[2]]);
  }
  return list;
}
