// 日期與「盤後」規則。所有時間一律以台北時間判斷，不管使用者手機設在哪個時區。
// 這個檔案是純函式，Node 也能直接執行測試（scripts/test-dates.mjs）。

const TZ = 'Asia/Taipei';

// 取得某個時間點在台北的年月日時分
export function taipeiParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// 台北時間 y-m-d hh:00 對應的實際時間點（台灣沒有日光節約，固定 UTC+8）
export function taipeiMoment(y, m, d, h = 0) {
  return new Date(Date.UTC(y, m - 1, d, h - 8, 0, 0));
}

// 在 y-m-d 上加減天數，回傳 {y,m,d}
export function addDays(y, m, d, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// 目前允許顯示的最後日期（YYYY-MM-DD）：
// 台北時間收盤（closeMinutes，預設 13:30 = 810 分）以後才可能包含今天，之前只到昨天。
// 這是「最多到哪天」的上限，實際最後交易日由證交所資料決定（休市日自然沒有資料）。
export function cutoffDate(now, closeMinutes) {
  const t = taipeiParts(now);
  if (t.h * 60 + t.min >= closeMinutes) return isoDate(t.y, t.m, t.d);
  const y = addDays(t.y, t.m, t.d, -1);
  return isoDate(y.y, y.m, y.d);
}

// 最近一個「應該有資料」的交易日：從 cutoffDate 往前跳過週六、週日。
// 國定假日無法事先知道，遇到時頂多多問證交所一次。
export function expectedTradingDate(now, closeMinutes) {
  let [y, m, d] = cutoffDate(now, closeMinutes).split('-').map(Number);
  for (;;) {
    const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (w !== 0 && w !== 6) return isoDate(y, m, d);
    ({ y, m, d } = addDays(y, m, d, -1));
  }
}

// 某月資料「一定完整」的時間點：下個月 1 號 00:00（台北）。在這之後抓到的該月資料永遠不用重抓。
export function monthCompleteMoment(y, m) {
  const n = addDays(y, m + 1, 1, 0); // Date.UTC 會自動處理 12 月跨年
  return taipeiMoment(n.y, n.m, n.d, 0);
}

// 從目前月份往回數 n 個月，回傳 ['2026-05', ..., '2026-11']（舊到新）
export function recentMonths(now, n) {
  const t = taipeiParts(now);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    let y = t.y, m = t.m - i;
    while (m <= 0) { m += 12; y -= 1; }
    out.push(`${y}-${pad(m)}`);
  }
  return out;
}

// 民國日期 "115/11/13" → "2026-11-13"
export function rocToIso(s) {
  const [y, m, d] = String(s).trim().split('/');
  return isoDate(Number(y) + 1911, Number(m), Number(d));
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
// "2026-11-13" → "11/13（五）"
export function shortDateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d}（${WEEK[w]}）`;
}
