// 參考價：今天漲跌要跟哪個價格比。
// 一般日子 = 前一天收盤；除權息日 = 證交所公布的除權息參考價（已扣掉股利）。
// 若除權息參考價查不到，退回用前一天收盤，並標記 exRightUnknown 讓畫面提示可能失真。

export function refOf(rows, i) {
  const r = rows[i];
  if (r.ref != null) return { ref: r.ref, exRight: !!r.exRight, unknown: false };
  if (r.change != null) return { ref: +(r.close - r.change).toFixed(4), exRight: false, unknown: false };
  const prev = rows[i - 1];
  return { ref: prev ? prev.close : r.open, exRight: !!r.exRight, unknown: !!r.exRight };
}

// 每天相對參考價的漲跌（給連漲連跌、量價判斷用）
export function dailyChanges(rows) {
  return rows.map((r, i) => (i === 0 && r.change == null && r.ref == null ? 0 : r.close - refOf(rows, i).ref));
}
