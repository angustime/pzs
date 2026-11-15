// 狀態判定與偏強／偏弱計分。全部是事先寫好的規則與固定文字，不用 AI。
// 門檻來自 config.js 的 RULES；規則內容見開發日誌「判定規則草案」。
// 文字原則：只描述現況，用「可能、通常、不一定」，不說看好看壞、不給買賣點。

import { RULES as R } from './config.js';
import { sma, kd, rsi, macd, bollinger } from './indicators.js';
import { refOf, dailyChanges } from './price.js';
import { detectPattern } from './patterns.js';

const fmtP = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));
const fmtLots = (n) => Math.abs(n).toLocaleString();
const pct = (a, b) => ((a - b) / b) * 100;
const last = (arr, k = 1) => arr[arr.length - k];

// 均線連續往同一方向走了幾天（dir = 1 往上、-1 往下），從最後一天往回數
function maRunDays(ma, i, dir) {
  let days = 0;
  for (let j = i; j > 0 && ma[j] != null && ma[j - 1] != null && Math.sign(ma[j] - ma[j - 1]) === dir; j--) days++;
  return days;
}

// 連續同方向天數：從最後一天往回數，回傳 {dir: 1|-1|0, days, sum}
function streak(values) {
  const v = last(values);
  if (!v) return { dir: 0, days: 0, sum: 0 };
  const dir = Math.sign(v);
  let days = 0, sum = 0;
  for (let i = values.length - 1; i >= 0 && Math.sign(values[i]) === dir; i--) { days++; sum += values[i]; }
  return { dir, days, sum };
}

/**
 * @param rows 日資料（舊到新）
 * @param chips readChips() 的結果（舊到新），可為空陣列
 * @param chipsStatus { ready: boolean, latestDate: string|null, message: string|null }
 */
export function evaluate(rows, chips = [], chipsStatus = { ready: false }) {
  const n = rows.length;
  const closes = rows.map((r) => r.close);
  const today = last(rows);
  const prev = rows[n - 2];
  const todayRef = refOf(rows, n - 1); // 參考價（除權息日已扣股利）
  const i = n - 1;

  const ma20 = sma(closes, R.maShort);
  const ma60 = sma(closes, R.maLong);
  const { K, D } = kd(rows, R.kdPeriod);
  const RSI = rsi(closes, R.rsiPeriod);
  const M = macd(closes, R.macd.fast, R.macd.slow, R.macd.signal);
  const B = bollinger(closes, R.boll.period, R.boll.k);

  const cards = { trend: [], volume: [], kd: [], rsi: [], macd: [], inst: [], watch: [] };
  const scoreItems = [];   // { name, score, reason }
  const highlights = [];   // { priority, text } 給一句話總結用
  const add = (card, text, terms = [], tone = 'neutral') => cards[card].push({ text, terms, tone });
  const score = (name, s, reason) => scoreItems.push({ name, score: s, reason });

  // ---------------- 趨勢 ----------------
  let trend = 'unknown';
  if (ma60[i] != null && ma20[i - R.maSlopeDays] != null) {
    const up = today.close > ma20[i] && ma20[i] > ma60[i] && ma20[i] > ma20[i - R.maSlopeDays];
    const down = today.close < ma20[i] && ma20[i] < ma60[i] && ma20[i] < ma20[i - R.maSlopeDays];
    trend = up ? 'up' : down ? 'down' : 'range';
    if (up) {
      add('trend', `股價在月線和季線之上，屬於上升趨勢。月線往上走，已持續 ${maRunDays(ma20, i, 1)} 天。`, ['月線', '季線', '上升趨勢'], 'up');
      score('趨勢', R.score.trend, '上升趨勢');
    } else if (down) {
      add('trend', `股價在月線和季線之下，屬於下降趨勢。月線往下走，已持續 ${maRunDays(ma20, i, -1)} 天。`, ['月線', '季線', '下降趨勢'], 'down');
      score('趨勢', -R.score.trend, '下降趨勢');
    } else {
      add('trend', '股價在均線附近上下來回，方向還不明確，屬於盤整。', ['均線', '盤整']);
      score('趨勢', 0, '盤整');
    }
  } else {
    add('trend', '上市時間較短，資料不足 60 天，暫時無法判斷趨勢。', ['季線']);
  }

  if (ma20[i] != null) {
    const above = today.close >= ma20[i];
    const side = Math.sign(today.close - ma20[i]);
    score('股價與月線', side * R.score.aboveMa, side > 0 ? '站在月線之上' : side < 0 ? '在月線之下' : '剛好在月線上');
    const bias = pct(today.close, ma20[i]);
    if (Math.abs(bias) >= R.biasPct) {
      // 近 60 日有幾天（含今天）離月線同方向這麼遠，讓新手知道「遠」是多遠
      let far = 0, seen = 0;
      for (let j = Math.max(0, i - R.highLowDays + 1); j <= i; j++) {
        if (ma20[j] == null) continue;
        seen++;
        const b = pct(rows[j].close, ma20[j]);
        if (Math.sign(b) === Math.sign(bias) && Math.abs(b) >= Math.abs(bias)) far++;
      }
      const rare = far <= Math.max(3, seen / 6) ? `近 ${seen} 個交易日裡，只有 ${far} 天離月線這麼遠。` : `近 ${seen} 個交易日裡，有 ${far} 天離月線這麼遠。`;
      add('trend', `股價比月線${bias > 0 ? '高出' : '低了'} ${Math.abs(bias).toFixed(1)}%，離平均價較遠，表示最近${bias > 0 ? '漲' : '跌'}得比較快。${rare}`, ['乖離', '月線'], bias > 0 ? 'up' : 'down');
    } else {
      add('trend', `收盤 ${fmtP(today.close)}，月線約 ${fmtP(+ma20[i].toFixed(1))}，股價在月線${above ? '之上' : '之下'} ${Math.abs(bias).toFixed(1)}%。`, ['月線']);
    }
  }

  // ---------------- 成交量 ----------------
  if (n > R.volAvgDays) {
    const avgVol = rows.slice(n - 1 - R.volAvgDays, n - 1).reduce((a, r) => a + r.volume, 0) / R.volAvgDays;
    const ratio = today.volume / avgVol;
    const r1 = ratio.toFixed(1);
    const upDay = today.close > todayRef.ref, downDay = today.close < todayRef.ref;
    if (ratio >= R.volHugeRatio) {
      add('volume', `今天成交量是平常的 ${r1} 倍，屬於爆量，代表關注度很高，波動可能變大，方向不一定。`, ['爆量', '均量'], 'neutral');
      highlights.push({ p: 1, text: `今天成交量是平常的 ${r1} 倍` });
    } else if (ratio >= R.volBigRatio) {
      add('volume', `今天成交量約是平常的 ${r1} 倍，明顯放大，代表關注度變高，方向不一定。`, ['成交量倍數', '均量']);
      highlights.push({ p: 6, text: `成交量放大到平常的 ${r1} 倍` });
    } else if (ratio <= R.volSmallRatio) {
      add('volume', `今天成交量只有平常的 ${r1} 倍，比平常少很多，市場可能在觀望。`, ['量縮', '均量']);
    } else {
      add('volume', `今天成交量約是平常的 ${r1} 倍，跟平常差不多。`, ['成交量倍數', '均量']);
    }
    if (ratio >= R.volBigRatio && upDay) {
      add('volume', '量放大而且收漲（量增價漲），買盤較積極。', ['量價'], 'up');
      score('量價', R.score.volPrice, '量增價漲');
    } else if (ratio >= R.volBigRatio && downDay) {
      add('volume', '量放大而且收跌（量增價跌），賣壓較重。', ['量價'], 'down');
      score('量價', -R.score.volPrice, '量增價跌');
    } else {
      score('量價', 0, '量沒有明顯放大');
    }
  }

  // ---------------- KD / RSI / MACD ----------------
  if (K[i] != null && K[i - 1] != null) {
    const k = K[i], d = D[i];
    const kTxt = `K 值 ${k.toFixed(0)}、D 值 ${d.toFixed(0)}`;
    let stuck = 0;
    const highZone = k >= R.kdHigh, lowZone = k <= R.kdLow;
    if (highZone || lowZone) {
      for (let j = i; j >= 0 && K[j] != null && (highZone ? K[j] >= R.kdHigh : K[j] <= R.kdLow); j--) stuck++;
    }
    if (highZone && stuck >= R.kdStuckDays) {
      add('kd', `${kTxt}，已連續 ${stuck} 天在 ${R.kdHigh} 以上（高檔鈍化），代表最近走勢很強，這時 KD 偏高的參考性會變低。`, ['KD 值', '鈍化'], 'up');
      highlights.push({ p: 4, text: `KD 連續 ${stuck} 天在高檔` });
    } else if (lowZone && stuck >= R.kdStuckDays) {
      add('kd', `${kTxt}，已連續 ${stuck} 天在 ${R.kdLow} 以下（低檔鈍化），代表最近走勢很弱，這時 KD 偏低的參考性會變低。`, ['KD 值', '鈍化'], 'down');
      highlights.push({ p: 4, text: `KD 連續 ${stuck} 天在低檔` });
    } else if (highZone) {
      add('kd', `${kTxt}，在 ${R.kdHigh} 以上的偏高區，短線漲幅較大；強勢股也常在偏高區停留一段時間。`, ['KD 值', '偏高區／偏低區']);
    } else if (lowZone) {
      add('kd', `${kTxt}，在 ${R.kdLow} 以下的偏低區，短線跌幅較大；弱勢股也常在偏低區停留一段時間。`, ['KD 值', '偏高區／偏低區']);
    } else {
      add('kd', `${kTxt}，在中間區域。`, ['KD 值']);
    }
    const crossUp = K[i] > D[i] && K[i - 1] <= D[i - 1];
    const crossDown = K[i] < D[i] && K[i - 1] >= D[i - 1];
    if (crossUp) { add('kd', '今天 K 值向上穿過 D 值，短線動能轉強。', ['交叉'], 'up'); highlights.push({ p: 5, text: 'KD 向上交叉' }); }
    if (crossDown) { add('kd', '今天 K 值向下穿過 D 值，短線動能轉弱。', ['交叉'], 'down'); highlights.push({ p: 5, text: 'KD 向下交叉' }); }
    score('KD', k > d ? R.score.kd : k < d ? -R.score.kd : 0, k > d ? 'K 值高於 D 值' : k < d ? 'K 值低於 D 值' : 'K、D 值相同');
  }

  if (RSI[i] != null) {
    const r = RSI[i];
    if (r >= R.rsiHigh) add('rsi', `RSI ${r.toFixed(0)}，在 ${R.rsiHigh} 以上，短線漲勢較急。`, ['RSI'], 'neutral');
    else if (r <= R.rsiLow) add('rsi', `RSI ${r.toFixed(0)}，在 ${R.rsiLow} 以下，短線跌勢較急。`, ['RSI'], 'neutral');
    else add('rsi', `RSI ${r.toFixed(0)}，在中間區域。`, ['RSI']);
    score('RSI', r >= R.rsiBull ? R.score.rsi : r <= R.rsiBear ? -R.score.rsi : 0,
      r >= R.rsiBull ? `RSI ${r.toFixed(0)} 偏強` : r <= R.rsiBear ? `RSI ${r.toFixed(0)} 偏弱` : `RSI ${r.toFixed(0)} 中性`);
  }

  if (M.hist[i] != null && M.hist[i - 1] != null) {
    const h = M.hist[i], hp = M.hist[i - 1];
    const dif = M.dif[i];
    if (h > 0 && hp <= 0) { add('macd', 'MACD 柱狀體今天由負翻正，中期動能轉強。', ['MACD'], 'up'); highlights.push({ p: 5, text: 'MACD 柱狀體由負翻正' }); }
    else if (h < 0 && hp >= 0) { add('macd', 'MACD 柱狀體今天由正翻負，中期動能轉弱。', ['MACD'], 'down'); highlights.push({ p: 5, text: 'MACD 柱狀體由正翻負' }); }
    else if (h > 0) add('macd', `MACD 柱狀體為正，${Math.abs(h) > Math.abs(hp) ? '而且比昨天長，中期動能在增強' : '但比昨天短，動能有減弱一點'}。`, ['MACD'], 'up');
    else if (h < 0) add('macd', `MACD 柱狀體為負，${Math.abs(h) > Math.abs(hp) ? '而且比昨天長，中期動能在轉弱' : '但比昨天短，弱勢有減緩一點'}。`, ['MACD'], 'down');
    add('macd', `DIF 在 0 軸${dif >= 0 ? '之上' : '之下'}，代表短期平均價${dif >= 0 ? '高於' : '低於'}長期平均價。`, ['MACD']);
    score('MACD', h > 0 ? R.score.macd : h < 0 ? -R.score.macd : 0, h > 0 ? 'MACD 柱狀體為正' : h < 0 ? 'MACD 柱狀體為負' : 'MACD 柱狀體為 0');
  }

  // ---------------- 要留意：位置、K 棒、布林 ----------------
  if (n >= R.highLowDays) {
    const win = rows.slice(n - R.highLowDays);
    const maxClose = Math.max(...win.map((r) => r.close));
    const minClose = Math.min(...win.map((r) => r.close));
    const maxHigh = Math.max(...win.map((r) => r.high));
    const minLow = Math.min(...win.map((r) => r.low));
    if (today.close >= maxClose) {
      add('watch', `收盤 ${fmtP(today.close)} 創近 ${R.highLowDays} 個交易日新高。`, ['創新高／新低'], 'up');
      highlights.push({ p: 3, text: `收盤創近三個月新高` });
    } else if (today.close <= minClose) {
      add('watch', `收盤 ${fmtP(today.close)} 創近 ${R.highLowDays} 個交易日新低。`, ['創新高／新低'], 'down');
      highlights.push({ p: 3, text: `收盤創近三個月新低` });
    } else if (pct(maxHigh, today.close) <= R.nearHighLowPct) {
      add('watch', `股價接近近三個月高點 ${fmtP(maxHigh)}，這附近過去曾遇到賣壓，可能來回震盪。`, ['壓力與支撐']);
      highlights.push({ p: 7, text: `接近近三個月高點` });
    } else if (pct(today.close, minLow) <= R.nearHighLowPct) {
      add('watch', `股價接近近三個月低點 ${fmtP(minLow)}，這附近過去曾有買盤，可能來回震盪。`, ['壓力與支撐']);
      highlights.push({ p: 7, text: `接近近三個月低點` });
    }
  }

  const base = todayRef.ref;
  const body = today.close - today.open;
  const bodyPct = (body / base) * 100;
  const upperShadow = today.high - Math.max(today.open, today.close);
  const lowerShadow = Math.min(today.open, today.close) - today.low;
  if (bodyPct >= R.longBodyPct) {
    add('watch', `今天是一根長紅 K 棒（收盤比開盤高 ${bodyPct.toFixed(1)}%），盤中買盤較積極。`, ['K 棒', '實體'], 'up');
    highlights.push({ p: 5, text: '今天收長紅 K 棒' });
  } else if (bodyPct <= -R.longBodyPct) {
    add('watch', `今天是一根長黑 K 棒（收盤比開盤低 ${Math.abs(bodyPct).toFixed(1)}%），盤中賣壓較重。`, ['K 棒', '實體'], 'down');
    highlights.push({ p: 5, text: '今天收長黑 K 棒' });
  }
  const minShadow = Math.max(Math.abs(body) * R.shadowToBody, (base * R.shadowMinPct) / 100);
  if (upperShadow >= minShadow) add('watch', `今天留下長上影線，盤中衝到 ${fmtP(today.high)} 後被賣回。`, ['上影線／下影線']);
  if (lowerShadow >= minShadow) add('watch', `今天留下長下影線，盤中跌到 ${fmtP(today.low)} 後被買回。`, ['上影線／下影線']);

  if (todayRef.exRight) {
    // 除權息日股價先扣掉股利，跟前一天直接比會像跳空下跌，所以不判斷缺口
    add('watch', todayRef.unknown
      ? '今天是除權息日，股價已先扣掉股利。官方參考價暫時查不到，漲跌先用前一天收盤計算，可能看起來跌比較多。'
      : `今天是除權息日，股價已先扣掉股利，漲跌以除權息參考價 ${fmtP(todayRef.ref)} 計算。`, ['除權息']);
  } else if (today.low > prev.high) {
    add('watch', `今天向上跳空，${fmtP(prev.high)}～${fmtP(today.low)} 之間留下缺口。`, ['跳空缺口'], 'up');
    highlights.push({ p: 2, text: '今天向上跳空' });
  } else if (today.high < prev.low) {
    add('watch', `今天向下跳空，${fmtP(today.high)}～${fmtP(prev.low)} 之間留下缺口。`, ['跳空缺口'], 'down');
    highlights.push({ p: 2, text: '今天向下跳空' });
  }

  const changes = dailyChanges(rows).slice(1);
  const st = streak(changes);
  if (st.days >= R.streakDays) {
    add('watch', `已經連續 ${st.days} 天${st.dir > 0 ? '上漲' : '下跌'}。`, [], st.dir > 0 ? 'up' : 'down');
    highlights.push({ p: 6, text: `連續 ${st.days} 天${st.dir > 0 ? '上漲' : '下跌'}` });
  }

  if (B.upper[i] != null) {
    if (today.close > B.upper[i]) add('watch', '收盤在布林通道上緣之外，屬於強勢，但離平均價較遠。', ['布林通道'], 'up');
    else if (today.close < B.lower[i]) add('watch', '收盤在布林通道下緣之外，屬於弱勢，但離平均價較遠。', ['布林通道'], 'down');
    const widths = [];
    for (let j = Math.max(0, i - R.bollSqueezeLookback + 1); j <= i; j++) {
      if (B.upper[j] != null) widths.push((B.upper[j] - B.lower[j]) / B.mid[j]);
    }
    if (widths.length >= R.bollSqueezeLookback / 2) {
      const sorted = [...widths].sort((a, b) => a - b);
      const cut = sorted[Math.floor((sorted.length - 1) * (R.bollSqueezePercentile / 100))];
      if (last(widths) <= cut) add('watch', '最近波動變得很小（布林通道收窄），通常之後波動會變大，但方向不一定。', ['布林通道']);
    }
  }

  // ---------------- 法人與融資融券 ----------------
  const instRows = chips.filter((c) => c.inst);
  const instUpToDate = chipsStatus.ready && instRows.length > 0 && last(instRows).date === today.date;
  if (!chipsStatus.ready) {
    add('inst', chipsStatus.message || '法人資料下載中…', ['三大法人']);
    score('外資', 0, '資料下載中');
    score('投信', 0, '資料下載中');
  } else if (!instUpToDate) {
    const lastInst = instRows.length ? last(instRows).date : null;
    const why = chipsStatus.error ? `法人資料下載失敗（${chipsStatus.error}）` : `法人資料還沒更新到 ${today.date.slice(5).replace('-', '/')}${lastInst ? `（目前只到 ${lastInst.slice(5).replace('-', '/')}）` : ''}`;
    add('inst', `${why}，法人兩項暫不計分。證交所通常在收盤後幾個小時公布。`, ['三大法人']);
    score('外資', 0, '法人資料未更新');
    score('投信', 0, '法人資料未更新');
  } else {
    for (const [key, label] of [['foreign', '外資'], ['trust', '投信']]) {
      const s = streak(instRows.map((c) => c.inst[key]));
      if (s.days >= R.instStreakDays) {
        // 連續天數等於抓到的天數時，實際可能更長，改用「近 N 天每天都…」
        const allDays = s.days >= instRows.length;
        const desc = allDays ? `近 ${s.days} 天每天都${s.dir > 0 ? '買超' : '賣超'}` : `連續 ${s.days} 天${s.dir > 0 ? '買超' : '賣超'}`;
        add('inst', `${label}${desc}，合計約 ${fmtLots(s.sum)} 張。`, [label, '買賣超'], s.dir > 0 ? 'up' : 'down');
        score(label, s.dir > 0 ? R.score[key] : -R.score[key], `${label}連 ${s.days} 日${s.dir > 0 ? '買超' : '賣超'}`);
        highlights.push({ p: 6, text: `${label}${desc}` });
      } else {
        const v = last(instRows).inst[key];
        add('inst', `${label}今天${v > 0 ? `買超 ${fmtLots(v)} 張` : v < 0 ? `賣超 ${fmtLots(v)} 張` : '沒有買賣超'}，近幾天沒有連續同方向。`, [label, '買賣超']);
        score(label, 0, `${label}沒有連續同方向`);
      }
    }
    const wd = R.instWeightDays;
    if (instRows.length >= wd) {
      const sumNet = instRows.slice(-wd).reduce((a, c) => a + c.inst.total, 0);
      const volMap = new Map(rows.map((r) => [r.date, r.volume / 1000]));
      const sumVol = instRows.slice(-wd).reduce((a, c) => a + (volMap.get(c.date) || 0), 0);
      if (sumVol > 0) {
        const w = (Math.abs(sumNet) / sumVol) * 100;
        if (w >= R.instWeightPct) {
          add('inst', `近 ${wd} 天三大法人合計${sumNet > 0 ? '買超' : '賣超'} ${fmtLots(sumNet)} 張，約佔成交量 ${w.toFixed(0)}%，法人動向對股價的影響可能較大。`, ['三大法人', '法人比重'], sumNet > 0 ? 'up' : 'down');
        }
      }
    }
  }

  const mRows = chips.filter((c) => c.margin);
  if (chipsStatus.ready && mRows.length > 0) {
    const lm = last(mRows).margin;
    const back = mRows.length > R.marginChangeDays ? mRows[mRows.length - 1 - R.marginChangeDays].margin : null;
    if (back && back.margin > 0) {
      const ch = pct(lm.margin, back.margin);
      if (ch >= R.marginChangePct) add('inst', `融資 ${R.marginChangeDays} 天增加 ${ch.toFixed(0)}%，借錢買股票的人變多，波動可能變大。`, ['融資'], 'neutral');
      else if (ch <= -R.marginChangePct) add('inst', `融資 ${R.marginChangeDays} 天減少 ${Math.abs(ch).toFixed(0)}%，借錢買股票的人變少。`, ['融資'], 'neutral');
    }
    if (lm.margin >= R.shortRatioMinMargin) {
      const sr = (lm.short / lm.margin) * 100;
      if (sr >= R.shortRatioPct) add('inst', `券資比 ${sr.toFixed(0)}%，看空的人較多，股價波動可能變大。`, ['融券', '券資比'], 'neutral');
    }
    if (last(mRows).date !== today.date) {
      add('inst', `融資融券資料目前只到 ${last(mRows).date.slice(5).replace('-', '/')}（通常晚上才公布）。`, ['融資', '融券']);
    }
  }

  // ---------------- 總評 ----------------
  const total = scoreItems.reduce((a, s) => a + s.score, 0);
  const max = Object.values(R.score).reduce((a, b) => a + b, 0);
  const level = total >= R.verdictBull ? 'bull' : total <= R.verdictBear ? 'bear' : 'neutral';
  const strong = total >= R.verdictStrongBull || total <= R.verdictStrongBear;
  const label = { bull: strong ? '明顯偏強' : '偏強', bear: strong ? '明顯偏弱' : '偏弱', neutral: '中性，持續觀察' }[level];
  const note = level === 'bull' ? '這是依目前指標統計的結果，不代表之後一定上漲。'
    : level === 'bear' ? '這是依目前指標統計的結果，不代表之後一定下跌。'
      : '偏強和偏弱的指標差不多，方向還不明確。這是依目前指標統計的結果，不代表之後的走勢。';

  // ---------------- 一句話總結 ----------------
  const pattern = detectPattern(rows);
  const trendWord = pattern ? `目前呈現「${pattern.name}」`
    : { up: '目前屬於上升趨勢', down: '目前屬於下降趨勢', range: '目前在盤整', unknown: '上市時間較短' }[trend];
  highlights.sort((a, b) => a.p - b.p);
  const summary = highlights.length ? `${trendWord}；${highlights[0].text}。` : `${trendWord}，今天沒有特別明顯的變化。`;

  return {
    verdict: { level, strong, label, score: total, max, items: scoreItems, note, pending: !chipsStatus.ready },
    pattern,
    summary,
    cards,
  };
}
