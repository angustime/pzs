// 目前查看的是個股還是大盤：成交量單位不同（個股＝張，大盤＝成交金額億元）。
// main.js 每次查詢時呼叫 setMarketMode；畫圖、規則、表格都用這裡的函式取單位。

export const INDEX_CODE = 'TAIEX';
export const INDEX_NAME = '加權指數';
export const isIndex = (code) => code === INDEX_CODE;

let mode = 'stock';
export function setMarketMode(code) { mode = isIndex(code) ? 'index' : 'stock'; }
export const isIndexMode = () => mode === 'index';

// 個股：volume 存「股」→ 顯示「張」；大盤：volume 存「成交金額（元）」→ 顯示「億元」
export const volOf = (r) => (mode === 'index' ? r.volume / 1e8 : r.volume / 1000);
export const volUnit = () => (mode === 'index' ? '億元' : '張');
export const volName = () => (mode === 'index' ? '成交金額' : '成交量');
export const fmtVol = (v) => (mode === 'index' ? Math.round(v).toLocaleString() : Math.round(v).toLocaleString());
