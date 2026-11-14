// 技術指標（固定公式）。每個函式都回傳與輸入等長的陣列，資料不足的位置為 null。

// 簡單移動平均
export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

// 指數移動平均：第一個值用前 n 筆的簡單平均起算
export function ema(values, n) {
  const out = new Array(values.length).fill(null);
  if (values.length < n) return out;
  const k = 2 / (n + 1);
  let prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// KD（台灣常用算法）：RSV = (收盤 − n 日最低) ÷ (n 日最高 − n 日最低) × 100
// K = 前一日 K × 2/3 + RSV × 1/3；D = 前一日 D × 2/3 + K × 1/3；起始 K、D = 50
export function kd(rows, n = 9) {
  const K = new Array(rows.length).fill(null);
  const D = new Array(rows.length).fill(null);
  let k = 50, d = 50;
  for (let i = n - 1; i < rows.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - n + 1; j <= i; j++) { hi = Math.max(hi, rows[j].high); lo = Math.min(lo, rows[j].low); }
    const rsv = hi === lo ? 50 : ((rows[i].close - lo) / (hi - lo)) * 100;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
    K[i] = k;
    D[i] = d;
  }
  return { K, D };
}

// 漲跌都是 0（價格完全沒動）時 RSI 視為 50
const rsiOf = (gain, loss) => (gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));

// RSI（Wilder 平滑法）
export function rsi(closes, n = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) gain += ch; else loss -= ch;
  }
  gain /= n; loss /= n;
  out[n] = rsiOf(gain, loss);
  for (let i = n + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(ch, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-ch, 0)) / n;
    out[i] = rsiOf(gain, loss);
  }
  return out;
}

// MACD：DIF = EMA快 − EMA慢；訊號線 = DIF 的 EMA；柱狀體 = DIF − 訊號線
export function macd(closes, fast = 12, slow = 26, signal = 9) {
  const ef = ema(closes, fast), es = ema(closes, slow);
  const dif = closes.map((_, i) => (ef[i] == null || es[i] == null ? null : ef[i] - es[i]));
  const firstIdx = dif.findIndex((v) => v != null);
  const sig = new Array(closes.length).fill(null);
  if (firstIdx >= 0) {
    const part = ema(dif.slice(firstIdx), signal);
    part.forEach((v, j) => { sig[firstIdx + j] = v; });
  }
  const hist = dif.map((v, i) => (v == null || sig[i] == null ? null : v - sig[i]));
  return { dif, signal: sig, hist };
}

// 布林通道：中軌 = n 日均線；上下軌 = 中軌 ± k 倍標準差（母體標準差）
export function bollinger(closes, n = 20, k = 2) {
  const mid = sma(closes, n);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  for (let i = n - 1; i < closes.length; i++) {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / n);
    upper[i] = mid[i] + k * sd;
    lower[i] = mid[i] - k * sd;
  }
  return { mid, upper, lower };
}
