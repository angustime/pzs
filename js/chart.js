// 線圖：縮圖（不可操作）與放大後的完整 K 線圖（可拖曳、縮放）。
// 使用 TradingView Lightweight Charts（Apache-2.0，見 vendor/lightweight-charts-LICENSE.txt）。

import { createChart, CrosshairMode } from '../vendor/lightweight-charts.mjs';
import { CONFIG, RULES } from './config.js';
import { sma, kd as calcKd, rsi as calcRsi, macd as calcMacd } from './indicators.js';

const MA_COLORS = { 5: '#e0a106', 20: '#7b5cd6', 60: '#2f80c9' };

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function baseOptions() {
  return {
    autoSize: true,
    layout: {
      background: { color: cssVar('--surface') },
      textColor: cssVar('--text-2'),
      fontFamily: getComputedStyle(document.body).fontFamily,
      attributionLogo: true,
    },
    grid: {
      vertLines: { color: cssVar('--grid') },
      horzLines: { color: cssVar('--grid') },
    },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false },
    localization: {
      locale: 'zh-TW', dateFormat: 'yyyy/MM/dd',
      // 2350.00 → 2350；有小數才顯示
      priceFormatter: (p) => (Number.isInteger(Math.round(p * 100) / 100) ? String(Math.round(p)) : p.toFixed(2)),
    },
  };
}

function candleData(rows) {
  return rows.map((r) => ({ time: r.date, open: r.open, high: r.high, low: r.low, close: r.close }));
}

function maData(rows, n) {
  const ma = sma(rows.map((r) => r.close), n);
  return rows.map((r, i) => (ma[i] == null ? { time: r.date } : { time: r.date, value: +ma[i].toFixed(2) }));
}

function addCandles(chart) {
  return chart.addCandlestickSeries({
    upColor: CONFIG.upColor, downColor: CONFIG.downColor,
    wickUpColor: CONFIG.upColor, wickDownColor: CONFIG.downColor,
    borderVisible: false,
  });
}

// 縮圖：只看最近 previewDays 天，含 20 日均線，不能拖曳縮放（避免手機捲動頁面時誤觸）
export function renderPreview(container, rows) {
  container.innerHTML = '';
  const chart = createChart(container, {
    ...baseOptions(),
    handleScroll: false,
    handleScale: false,
    crosshair: { mode: CrosshairMode.Hidden, vertLine: { visible: false }, horzLine: { visible: false } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
    timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
  });
  // 縮圖不顯示右側最新價標籤：它的顏色依當天 K 棒（收盤比開盤），容易跟上方漲跌（比昨收）搞混
  const candles = addCandles(chart);
  candles.applyOptions({ lastValueVisible: false, priceLineVisible: false });
  candles.setData(candleData(rows));
  chart.addLineSeries({
    color: MA_COLORS[20], lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    crosshairMarkerVisible: false,
  }).setData(maData(rows, 20));
  const from = Math.max(0, rows.length - CONFIG.previewDays);
  chart.timeScale().setVisibleLogicalRange({ from: from - 0.5, to: rows.length - 0.5 });
  return chart;
}

// 狀態頁走勢圖：最近 days 個交易日收盤價的面積圖。
// 區間內上漲用紅色、下跌用綠色；虛線是區間起點的收盤價，方便看「比 N 天前高還是低」。
export function renderTrend(container, rows, days) {
  container.innerHTML = '';
  const slice = rows.slice(-(days + 1)); // 多拿一天當起點
  const base = slice[0].close;
  const lastClose = slice[slice.length - 1].close;
  const color = lastClose >= base ? CONFIG.upColor : CONFIG.downColor;
  const chart = createChart(container, {
    ...baseOptions(),
    handleScroll: false,
    handleScale: false,
    crosshair: { mode: CrosshairMode.Magnet, horzLine: { visible: false, labelVisible: false } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
    timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
  });
  const area = chart.addAreaSeries({
    lineColor: color, lineWidth: 2,
    topColor: color + '55', bottomColor: color + '08',
    priceLineVisible: false, lastValueVisible: true,
  });
  area.setData(slice.slice(1).map((r) => ({ time: r.date, value: r.close })));
  area.createPriceLine({
    price: base, color: cssVar('--text-2'), lineWidth: 1, lineStyle: 2,
    axisLabelVisible: false, title: `${days} 日前 ${base}`,
  });
  chart.timeScale().fitContent();
  return chart;
}

// 放大圖：K 線＋均線＋成交量，可拖曳縮放，上方圖例跟著十字線顯示當天數字
export function renderFull(container, legendEl, rows) {
  container.innerHTML = '';
  const chart = createChart(container, {
    ...baseOptions(),
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.28 } },
  });
  const candles = addCandles(chart);
  candles.setData(candleData(rows));

  const maSeries = {};
  for (const n of CONFIG.maDays) {
    maSeries[n] = chart.addLineSeries({
      color: MA_COLORS[n] || '#888', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    maSeries[n].setData(maData(rows, n));
  }

  const vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
  vol.setData(rows.map((r, i) => ({
    time: r.date,
    value: Math.round(r.volume / 1000), // 張
    color: (i > 0 && r.close < rows[i - 1].close ? CONFIG.downColor : CONFIG.upColor) + '88',
  })));

  const byDate = new Map(rows.map((r, i) => [r.date, i]));
  const maVals = Object.fromEntries(CONFIG.maDays.map((n) => [n, sma(rows.map((r) => r.close), n)]));

  function showLegend(i) {
    const r = rows[i];
    if (!r) return;
    const prev = rows[i - 1];
    const chg = prev ? r.close - prev.close : 0;
    const cls = chg > 0 ? 'up' : chg < 0 ? 'down' : '';
    const ma = CONFIG.maDays
      .map((n) => `<span style="color:${MA_COLORS[n]}">MA${n} ${maVals[n][i] == null ? '—' : maVals[n][i].toFixed(1)}</span>`)
      .join(' ');
    legendEl.innerHTML =
      `<div>${r.date.replaceAll('-', '/')}　開 ${r.open}　高 ${r.high}　低 ${r.low}　收 <b class="${cls}">${r.close}</b>　量 ${Math.round(r.volume / 1000).toLocaleString()} 張</div>` +
      `<div>${ma}</div>`;
  }
  showLegend(rows.length - 1);
  // 用字串日期設資料時，事件回來的 time 可能是 {year, month, day} 物件
  const toIso = (t) => (typeof t === 'string' ? t
    : t && t.year ? `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}` : null);
  chart.subscribeCrosshairMove((p) => {
    const iso = toIso(p.time);
    if (iso && byDate.has(iso)) showLegend(byDate.get(iso));
    else showLegend(rows.length - 1);
  });

  const from = Math.max(0, rows.length - 90);
  chart.timeScale().setVisibleLogicalRange({ from: from - 0.5, to: rows.length + 2 });
  return chart;
}

// ---- 指標小圖（狀態頁卡片用）：最近 60 天、不能拖曳縮放 ----

const IND_DAYS = 60;
// 張數顯示：1 萬以上用「萬」
const lotsFormat = { type: 'custom', minMove: 1, formatter: (v) => (Math.abs(v) >= 10000 ? `${+(v / 10000).toFixed(1)}萬` : String(Math.round(v))) };
const fixedRange = (min, max) => () => ({ priceRange: { minValue: min, maxValue: max } });

function miniChart(container) {
  container.innerHTML = '';
  const base = baseOptions();
  return createChart(container, {
    ...base,
    // 小圖不放 TradingView 標誌（避免每張小圖都有），改在頁尾放文字連結
    layout: { ...base.layout, attributionLogo: false },
    handleScroll: false,
    handleScale: false,
    crosshair: { mode: CrosshairMode.Hidden, vertLine: { visible: false }, horzLine: { visible: false } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.05 } },
    timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, visible: false },
  });
}

const line = (chart, color, extra = {}) => chart.addLineSeries({
  color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, ...extra,
});
const pts = (rows, values) => rows.map((r, i) => (values[i] == null ? { time: r.date } : { time: r.date, value: +values[i].toFixed(2) }));
const hline = (series, price) => series.createPriceLine({ price, color: cssVar('--text-2'), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });

export function renderIndicator(container, rows, type) {
  const chart = miniChart(container);
  const closes = rows.map((r) => r.close);
  if (type === 'volume') {
    const vol = chart.addHistogramSeries({ priceFormat: lotsFormat, priceLineVisible: false, lastValueVisible: false });
    vol.setData(rows.map((r, i) => ({
      time: r.date, value: Math.round(r.volume / 1000),
      color: i > 0 && r.close < rows[i - 1].close ? CONFIG.downColor : CONFIG.upColor,
    })));
    // 20 日均量（不含當天，和規則判定一致）
    const lots = rows.map((r) => r.volume / 1000);
    const avg = lots.map((_, i) => (i < RULES.volAvgDays ? null : lots.slice(i - RULES.volAvgDays, i).reduce((a, b) => a + b, 0) / RULES.volAvgDays));
    line(chart, MA_COLORS[5], { lastValueVisible: false, priceFormat: lotsFormat }).setData(pts(rows, avg));
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0 } });
    // 整張圖的價格格式會蓋過序列設定，成交量圖要另外指定
    chart.applyOptions({ localization: { priceFormatter: lotsFormat.formatter } });
  } else if (type === 'kd') {
    const { K, D } = calcKd(rows, RULES.kdPeriod);
    const k = line(chart, MA_COLORS[5], { autoscaleInfoProvider: fixedRange(0, 100) });
    k.setData(pts(rows, K));
    line(chart, MA_COLORS[60], { autoscaleInfoProvider: fixedRange(0, 100) }).setData(pts(rows, D));
    hline(k, RULES.kdHigh); hline(k, RULES.kdLow);
  } else if (type === 'rsi') {
    const s = line(chart, MA_COLORS[20], { autoscaleInfoProvider: fixedRange(0, 100) });
    s.setData(pts(rows, calcRsi(closes, RULES.rsiPeriod)));
    hline(s, RULES.rsiHigh); hline(s, RULES.rsiLow);
  } else if (type === 'macd') {
    const m = calcMacd(closes, RULES.macd.fast, RULES.macd.slow, RULES.macd.signal);
    const h = chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    h.setData(rows.map((r, i) => (m.hist[i] == null ? { time: r.date } : {
      time: r.date, value: +m.hist[i].toFixed(2), color: (m.hist[i] >= 0 ? CONFIG.upColor : CONFIG.downColor) + 'aa',
    })));
    line(chart, MA_COLORS[5], { lastValueVisible: false }).setData(pts(rows, m.dif));
    line(chart, MA_COLORS[60], { lastValueVisible: false }).setData(pts(rows, m.signal));
  }
  const from = Math.max(0, rows.length - IND_DAYS);
  chart.timeScale().setVisibleLogicalRange({ from: from - 0.5, to: rows.length - 0.5 });
  return chart;
}
