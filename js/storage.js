// 儲存空間：統計 App 在這支手機用了多少空間、刪除個股資料、清除全部下載資料、自動清理很久沒看的股票。
// 資料都在瀏覽器的 localStorage（以 twstock: 開頭）；另外瀏覽器會快取 App 本身的檔案（離線用）。
// 「清除全部下載資料」會保留自選名單與設定，只刪股價、法人、融資、除權息、股票清單這些可以重新下載的資料。

import { CONFIG } from './config.js';
import { INDEX_CODE, INDEX_NAME } from './units.js';

const ROOT = 'twstock:';
const STOCK_RE = /^twstock:v1:stock2?:(.+)$/;           // 個股（含舊格式 stock:）
const DOWNLOADED_RE = /^twstock:v1:(stock2?:|chips:|exright:|stocklist)/; // 可重新下載的資料
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function keys() {
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(ROOT)) out.push(k); } } catch { /* 忽略 */ }
  return out;
}
const sizeOf = (k) => { try { return (k.length + (localStorage.getItem(k) || '').length) * 2; } catch { return 0; } }; // UTF-16，每字 2 bytes
const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

export function fmtBytes(b) {
  if (b >= 1000 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`; // 超過 1000 KB 就用 MB
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

// 最後一次查看的時間；舊資料沒有記錄時，用最後一次下載的時間
function lastViewedOf(data) {
  if (!data) return 0;
  if (data.lastViewed) return data.lastViewed;
  return Math.max(0, ...Object.values(data.months || {}).map((m) => m.fetchedAt || 0));
}

export function storageReport() {
  const stocks = [];
  let chips = 0, other = 0, kept = 0;
  for (const k of keys()) {
    const b = sizeOf(k);
    const m = k.match(STOCK_RE);
    if (m) {
      const d = readJson(k);
      stocks.push({ code: m[1], name: m[1] === INDEX_CODE ? INDEX_NAME : (d && d.name) || m[1], bytes: b, lastViewed: lastViewedOf(d) });
    } else if (/^twstock:v1:chips:/.test(k)) chips += b;
    else if (DOWNLOADED_RE.test(k)) other += b;
    else kept += b; // 自選名單、設定
  }
  stocks.sort((a, b) => b.lastViewed - a.lastViewed);
  const total = stocks.reduce((a, s) => a + s.bytes, 0) + chips + other + kept;
  return { stocks, chips, other, kept, total };
}

// 查看股票時記錄時間（自動清理用）
export function touchStock(code) {
  const k = `${ROOT}v1:stock2:${code}`;
  const d = readJson(k);
  if (!d) return;
  d.lastViewed = Date.now();
  try { localStorage.setItem(k, JSON.stringify(d)); } catch { /* 空間不足就算了 */ }
}

export function deleteStockData(code) {
  try { localStorage.removeItem(`${ROOT}v1:stock2:${code}`); localStorage.removeItem(`${ROOT}v1:stock:${code}`); } catch { /* 忽略 */ }
}

export function clearDownloaded() {
  for (const k of keys()) if (DOWNLOADED_RE.test(k)) { try { localStorage.removeItem(k); } catch { /* 忽略 */ } }
}

// 超過 storageKeepDays 天沒查看的股票自動刪除（下次查詢會重新下載）；回傳刪了幾檔
export function autoCleanup(now = Date.now()) {
  const limit = now - CONFIG.storageKeepDays * 86400000;
  let n = 0;
  for (const s of storageReport().stocks) if (s.lastViewed && s.lastViewed < limit) { deleteStockData(s.code); n++; }
  return n;
}

// 說明視窗裡的「儲存空間」區塊
export async function renderStorage(container, currentCode, open = false) {
  const r = storageReport();
  let est = '';
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      if (e.usage) est = `<p class="muted">含 App 離線檔案，瀏覽器統計約 ${fmtBytes(e.usage)}。</p>`;
    }
  } catch { /* 有些瀏覽器不支援 */ }
  const days = (t) => (t ? Math.floor((Date.now() - t) / 86400000) : null);
  container.innerHTML = `
    <details class="card info-block"${open ? ' open' : ''}>
      <summary>💾 儲存空間 <small class="muted">${fmtBytes(r.total)}</small></summary>
      <p>盤後診股室目前在這支手機用了約 <b>${fmtBytes(r.total)}</b>（資料存在瀏覽器裡，不會上傳）。</p>
      ${est}
      <ul class="storage-sum">
        <li><span>股價資料（${r.stocks.length} 檔）</span><b>${fmtBytes(r.stocks.reduce((a, s) => a + s.bytes, 0))}</b></li>
        <li><span>法人、融資資料（所有股票共用）</span><b>${fmtBytes(r.chips)}</b></li>
        <li><span>股票清單、除權息等</span><b>${fmtBytes(r.other)}</b></li>
        <li><span>自選名單、設定</span><b>${fmtBytes(r.kept)}</b></li>
      </ul>
      ${r.stocks.length ? `<ul class="storage-list">${r.stocks.map((s) => `
        <li><span><b>${esc(s.name)}</b> <small>${esc(s.code === INDEX_CODE ? '大盤' : s.code)}・${fmtBytes(s.bytes)}${days(s.lastViewed) != null ? `・${days(s.lastViewed) === 0 ? '今天看過' : `${days(s.lastViewed)} 天前看過`}` : ''}</small></span>
          ${s.code === currentCode ? '<small class="muted">查看中</small>' : `<button type="button" data-del-stock="${esc(s.code)}">刪除</button>`}</li>`).join('')}</ul>` : ''}
      <p class="muted">超過 ${CONFIG.storageKeepDays} 天沒打開的股票會自動刪除；刪除後再查詢會重新下載。從自選移除不會刪資料。</p>
      <button type="button" class="danger-btn" data-clear-all>清除全部下載資料（保留自選名單）</button>
    </details>`;
}
