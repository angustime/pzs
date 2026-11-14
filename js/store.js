// 本機儲存：每檔股票的日資料存在瀏覽器 localStorage。
// 讀寫都包 try/catch：無痕模式或儲存空間被清除時，App 照常運作，只是要重抓。

const PREFIX = 'twstock:v1:';

// 資料格式：
// {
//   code, name,
//   months: { '2026-11': { fetchedAt: 1731571200000, found: true } },
//   rows: [{ date, open, high, low, close, volume }]   // 依日期排序、不重複
// }

export function loadStock(code) {
  try {
    const raw = localStorage.getItem(PREFIX + 'stock:' + code);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveStock(data) {
  try {
    localStorage.setItem(PREFIX + 'stock:' + data.code, JSON.stringify(data));
    return true;
  } catch {
    return false; // 空間不足或被禁止，不影響本次顯示
  }
}

export function loadLastCode() {
  try { return localStorage.getItem(PREFIX + 'lastCode'); } catch { return null; }
}

export function saveLastCode(code) {
  try { localStorage.setItem(PREFIX + 'lastCode', code); } catch { /* 忽略 */ }
}
