// 所有可調整的設定與判定門檻集中在這裡（CLAUDE.md 規矩 7）。
// 門檻都是教科書常見預設值，沒有回測過。改這裡就好，不要在其他程式寫死數字。

export const CONFIG = {
  // ---- 資料抓取 ----
  // 盤後資料：台北時間幾點以後才算「今天收盤資料可用」
  afterCloseHour: 15,
  // 往回抓幾個月（含本月）。60 日均線與 MACD 需要暖機，約 6 個月日資料。
  monthsToFetch: 7,
  // 每次向證交所請求之間至少間隔幾毫秒（避免被封 IP）
  requestGapMs: 2500,
  // 單次請求逾時（毫秒）
  requestTimeoutMs: 15000,
  // 法人、融資融券抓最近幾個交易日
  chipsDays: 10,
  // 某天法人／融資資料還沒公布時，隔幾分鐘後才再試
  chipsRetryMinutes: 30,

  // ---- 線圖 ----
  // 狀態頁走勢圖顯示最近幾個交易日
  trendDays: 20,
  // K 線縮圖顯示最近幾個交易日
  previewDays: 60,
  // 均線天數
  maDays: [5, 20, 60],
  // 台股慣例：漲紅跌綠
  upColor: '#d63b3b',
  downColor: '#1f9d55',
};

// ---- 判定規則門檻（開發日誌「判定規則草案」） ----
export const RULES = {
  // 指標參數
  maShort: 20,            // 月線
  maLong: 60,             // 季線
  maSlopeDays: 5,         // 均線方向：跟幾天前比
  kdPeriod: 9,
  rsiPeriod: 14,
  macd: { fast: 12, slow: 26, signal: 9 },
  boll: { period: 20, k: 2 },
  volAvgDays: 20,         // 均量天數
  highLowDays: 60,        // 近期高低點看幾天

  // 位置
  biasPct: 8,             // 離月線 ±8% 算偏遠
  nearHighLowPct: 3,      // 距 60 日高／低點 3% 以內算接近

  // 成交量（當日量 ÷ 前 20 日均量）
  volBigRatio: 1.5,
  volHugeRatio: 2.5,
  volSmallRatio: 0.6,

  // KD / RSI
  kdHigh: 80,
  kdLow: 20,
  kdStuckDays: 3,         // 連續幾天在偏高／偏低區算鈍化
  rsiHigh: 70,
  rsiLow: 30,

  // 布林通道收窄：寬度落在近 60 日最窄的前 20%
  bollSqueezePercentile: 20,
  bollSqueezeLookback: 60,

  // K 棒（百分比都以前一天收盤為基準）
  longBodyPct: 3.5,       // 實體 ≥ 3.5% 算長紅／長黑
  shadowToBody: 2,        // 影線 ≥ 實體 2 倍
  shadowMinPct: 2,        // 且影線 ≥ 2%

  // 連漲連跌
  streakDays: 5,

  // 法人
  instStreakDays: 3,      // 外資／投信連續幾天同方向
  instWeightDays: 5,      // 法人比重看幾天
  instWeightPct: 10,      // 法人買賣超合計 ≥ 成交量 10%

  // 融資融券
  marginChangeDays: 5,
  marginChangePct: 10,    // 融資餘額 5 日變化 ±10%
  shortRatioPct: 30,      // 券資比 ≥ 30%
  shortRatioMinMargin: 500, // 融資餘額太少時券資比沒意義，至少要有幾張

  // ---- 偏多／偏空計分 ----
  score: {
    trend: 2,             // 上升 +2、下降 −2
    aboveMa: 1,           // 收盤在月線上 +1、下 −1
    macd: 1,              // 柱狀體正 +1、負 −1
    kd: 1,                // K > D +1、K < D −1
    rsi: 1,               // RSI ≥ rsiBull +1、≤ rsiBear −1
    volPrice: 1,          // 量放大且收漲 +1、收跌 −1
    foreign: 1,           // 外資連買 +1、連賣 −1
    trust: 1,             // 投信連買 +1、連賣 −1
  },
  rsiBull: 55,
  rsiBear: 45,
  verdictBull: 3,         // 總分 ≥ 3 偏多
  verdictBear: -3,        // 總分 ≤ −3 偏空
};
