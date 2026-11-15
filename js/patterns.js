// 目前型態：用常見的技術分析名詞描述股價「現在走到哪個階段」。
// 只描述現況，不預測（不用打底、做頭、W 底、M 頭等暗示反轉的詞）。
// 門檻在 config.js 的 RULES.pattern；每個型態在 glossary.js 都有說明與「本 App 怎麼判斷」。

import { RULES } from './config.js';
import { sma } from './indicators.js';

const P = RULES.pattern;
const fmtP = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 }); // 千分位，最多 2 位小數
const pct = (a, b) => ((a - b) / b) * 100;

/**
 * @returns {null | {
 *   name: string,         // 型態名稱（也是名詞解釋的 key）
 *   text: string,         // 白話說明（含實際數字）
 *   tone: 'up'|'down'|'neutral',
 *   tags: {name: string, text: string}[],  // 附加標籤：跌深、漲多
 * }}
 */
export function detectPattern(rows) {
  const n = rows.length;
  if (n < Math.max(RULES.maLong + P.slopeDays, P.positionDays)) return null;
  const i = n - 1;
  const today = rows[i];
  const closes = rows.map((r) => r.close);
  const ma5 = sma(closes, P.maFast);
  const ma20 = sma(closes, RULES.maShort);
  const ma60 = sma(closes, RULES.maLong);
  const up = (ma) => ma[i] > ma[i - P.slopeDays];
  const down = (ma) => ma[i] < ma[i - P.slopeDays];

  // 前 20 日（不含今天）的整理區間
  const prior = rows.slice(n - 1 - P.rangeDays, n - 1);
  const priorHigh = Math.max(...prior.map((r) => r.high));
  const priorLow = Math.min(...prior.map((r) => r.low));
  // 前 20 日算「整理」：高低差小、而且月線走平（避免把一路上漲的每一天都叫突破）
  const ma20Flat = Math.abs(pct(ma20[i - 1], ma20[i - 1 - P.rangeDays])) < P.flatSlopePct;
  const consolidating = pct(priorHigh, priorLow) < P.rangeNarrowPct && ma20Flat;
  // 近 20 日（含今天）
  const recent = rows.slice(n - P.rangeDays);
  const recentHigh = Math.max(...recent.map((r) => r.high));
  const recentLow = Math.min(...recent.map((r) => r.low));
  const rangePct = pct(recentHigh, recentLow);
  // 近 60 日位置
  const win = rows.slice(n - P.positionDays);
  const high60 = Math.max(...win.map((r) => r.high));
  const low60 = Math.min(...win.map((r) => r.low));
  const pos = high60 === low60 ? 50 : ((today.close - low60) / (high60 - low60)) * 100;

  // 附加標籤
  const tags = [];
  const drop = pct(today.close, high60);
  const rise = pct(today.close, low60);
  // 波動很大時可能同時「離高點很遠」又「離低點很遠」，只標示符合目前位置的那一個
  if (-drop >= P.deepDropPct && pos < 50) tags.push({ name: '跌深', text: `比近三個月高點 ${fmtP(high60)} 已經跌了 ${Math.abs(drop).toFixed(0)}%。` });
  if (rise >= P.bigRisePct && pos > 50) tags.push({ name: '漲多', text: `比近三個月低點 ${fmtP(low60)} 已經漲了 ${rise.toFixed(0)}%。` });

  const trendUpBase = ma20[i] > ma60[i] && up(ma20);
  const trendDownBase = ma20[i] < ma60[i] && down(ma20);
  const make = (name, text, tone) => ({ name, text, tone, tags });

  // 第 j 天是否為多頭（dir=1）／空頭（dir=-1）排列
  const aligned = (j, dir) => {
    const k = j - P.slopeDays;
    if (k < 0 || [ma5[j], ma20[j], ma60[j], ma5[k], ma20[k], ma60[k]].some((v) => v == null)) return false;
    const s = (a, b) => Math.sign(a - b) === dir;
    return s(closes[j], ma5[j]) && s(ma5[j], ma20[j]) && s(ma20[j], ma60[j]) && s(ma5[j], ma5[k]) && s(ma20[j], ma20[k]) && s(ma60[j], ma60[k]);
  };
  // 排列已連續維持幾天（含今天）
  const heldDays = (dir) => { let d = 0; for (let j = i; j >= 0 && aligned(j, dir); j--) d++; return d; };
  // 近 20 日高點／低點出現在幾個交易日前（同價取最近一次）
  const daysSince = (pick, value) => { for (let j = i; j >= n - P.rangeDays; j--) if (rows[j][pick] === value) return i - j; return 0; };

  // 依序判斷，第一個符合的就是目前型態
  if (consolidating && today.close > priorHigh) {
    return make('突破整理區間', `收盤 ${fmtP(today.close)} 高於前 ${P.rangeDays} 個交易日的最高價 ${fmtP(priorHigh)}，突破最近一個月來回整理的範圍。`, 'up');
  }
  if (consolidating && today.close < priorLow) {
    return make('跌破整理區間', `收盤 ${fmtP(today.close)} 低於前 ${P.rangeDays} 個交易日的最低價 ${fmtP(priorLow)}，跌破最近一個月來回整理的範圍。`, 'down');
  }
  if (aligned(i, 1)) {
    return make('多頭排列', `收盤在 5 日線之上，5 日線 > 月線 > 季線，三條均線都往上，是典型的上漲排列，已維持 ${heldDays(1)} 天。`, 'up');
  }
  if (aligned(i, -1)) {
    return make('空頭排列', `收盤在 5 日線之下，5 日線 < 月線 < 季線，三條均線都往下，是典型的下跌排列，已維持 ${heldDays(-1)} 天。`, 'down');
  }
  if (trendUpBase && pct(today.close, recentHigh) <= -P.pullbackPct) {
    return make('上升趨勢中回檔', `月線在季線之上而且往上走，但股價比近 ${P.rangeDays} 日高點 ${fmtP(recentHigh)} 回落了 ${Math.abs(pct(today.close, recentHigh)).toFixed(1)}%，是上漲過程中的修正，${daysSince('high', recentHigh) ? `已從高點回落 ${daysSince('high', recentHigh)} 天` : '今天從高點回落'}。`, 'neutral');
  }
  if (trendDownBase && pct(today.close, recentLow) >= P.reboundPct) {
    return make('下降趨勢中反彈', `月線在季線之下而且往下走，但股價比近 ${P.rangeDays} 日低點 ${fmtP(recentLow)} 彈起了 ${pct(today.close, recentLow).toFixed(1)}%，是下跌過程中的反彈，${daysSince('low', recentLow) ? `已從低點反彈 ${daysSince('low', recentLow)} 天` : '今天從低點反彈'}。`, 'neutral');
  }
  if (rangePct < P.rangeNarrowPct) {
    const where = `近 ${P.rangeDays} 日在 ${fmtP(recentLow)}～${fmtP(recentHigh)} 之間（高低差 ${rangePct.toFixed(1)}%）`;
    if (pos >= P.highZonePos) return make('高檔盤整', `${where}來回，位置在近三個月區間的上段（約 ${pos.toFixed(0)}%）。漲上來之後在高處整理，方向還沒出來。`, 'neutral');
    if (pos <= P.lowZonePos) return make('低檔盤整', `${where}來回，位置在近三個月區間的下段（約 ${pos.toFixed(0)}%）。跌下來之後在低處整理，方向還沒出來。`, 'neutral');
    return make('區間盤整', `${where}來回，位置在近三個月區間的中段（約 ${pos.toFixed(0)}%），方向還不明確。`, 'neutral');
  }
  if (trendUpBase) return make('上升趨勢', '月線在季線之上而且往上走，整體方向偏上，但均線還沒有排列整齊。', 'up');
  if (trendDownBase) return make('下降趨勢', '月線在季線之下而且往下走，整體方向偏下，但均線還沒有排列整齊。', 'down');
  return make('震盪走勢', `近 ${P.rangeDays} 日在 ${fmtP(recentLow)}～${fmtP(recentHigh)} 之間上下波動（高低差 ${rangePct.toFixed(1)}%），波動比較大，但方向不明確。`, 'neutral');
}
