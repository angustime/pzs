// 狀態頁（總評＋分項卡片）、法人與融資券表格、名詞解釋視窗的畫面組裝。

import { GLOSSARY } from './glossary.js';
import { shortDateLabel } from './dates.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const termBtn = (t) => (GLOSSARY[t] ? `<button type="button" class="term" data-term="${esc(t)}">${esc(t)}<span aria-hidden="true">?</span></button>` : '');

// 技術指標卡片：成交量、KD、RSI、MACD 放在同一張卡片，點上方分頁切換
export const IND_TABS = [
  { type: 'volume', label: '成交量', legend: [['紅綠柱', '每天成交量（張）'], ['#e0a106', '20 日均量']] },
  { type: 'kd', label: 'KD', legend: [['#e0a106', 'K 值'], ['#2f80c9', 'D 值'], ['虛線', '80／20']] },
  { type: 'rsi', label: 'RSI', legend: [['#7b5cd6', 'RSI'], ['虛線', '70／30']] },
  { type: 'macd', label: 'MACD', legend: [['紅綠柱', '柱狀體'], ['#e0a106', 'DIF'], ['#2f80c9', '訊號線']] },
];

// 狀態頁卡片順序
export const CARDS = [
  { key: 'trend', title: '趨勢' },
  { key: 'ind', title: '技術指標', indicators: true },
  { key: 'inst', title: '法人與融資' },
  { key: 'watch', title: '要留意' },
];

export function renderVerdict(container, result) {
  const v = result.verdict;
  const sign = v.score > 0 ? '+' : v.score < 0 ? '−' : '±';
  const reasons = (filter, title, cls) => {
    const list = v.items.filter(filter);
    if (!list.length) return '';
    return `<div class="reason-group ${cls}"><div class="reason-title">${title}</div><ul>${list
      .map((s) => `<li><span>${esc(s.name)}：${esc(s.reason)}</span><b>${s.score > 0 ? '+' : s.score < 0 ? '−' : ''}${Math.abs(s.score)}</b></li>`)
      .join('')}</ul></div>`;
  };
  const p = result.pattern;
  const patternHtml = p ? `
    <div class="pattern tone-${p.tone}">
      <div class="pattern-head">
        <span class="verdict-label">目前型態</span>
        <span class="pattern-name">${esc(p.name)}</span>
        ${termBtn(p.name)}
      </div>
      <p class="pattern-text">${esc(p.text)}</p>
      ${p.tags.length ? `<div class="pattern-tags">${p.tags.map((t) => `<span class="ptag">${termBtn(t.name)}<small>${esc(t.text)}</small></span>`).join('')}</div>` : ''}
    </div>` : '';
  container.className = `card verdict ${v.level}${v.strong ? ' strong' : ''}`;
  container.innerHTML = `${patternHtml}
    <div class="verdict-head">
      <span class="verdict-label">技術面</span>
      <span class="verdict-level">${esc(v.label)}</span>
      <span class="verdict-score">${sign}${Math.abs(v.score)}<small> / ±${v.max}</small></span>
      ${termBtn('偏強／偏弱')}
    </div>
    <p class="summary">${esc(result.summary)}</p>
    <details>
      <summary>看根據（${v.items.filter((s) => s.score > 0).length} 項偏強、${v.items.filter((s) => s.score < 0).length} 項偏弱、${v.items.filter((s) => s.score === 0).length} 項中性）</summary>
      ${reasons((s) => s.score > 0, '偏強', 'bull')}
      ${reasons((s) => s.score < 0, '偏弱', 'bear')}
      ${reasons((s) => s.score === 0, '中性', 'neutral')}
    </details>
    ${v.pending ? '<p class="verdict-pending">法人資料下載中，下載完成後總評可能會改變。</p>' : ''}
    <p class="verdict-note">${esc(v.note)}</p>`;
}

const legendHtml = (legend) => legend.map(([c, label]) => {
  const swatch = c.startsWith('#') ? `<i style="background:${c}"></i>` : c === '虛線' ? '<i class="dash"></i>' : '<i class="bars"></i>';
  return `<span>${swatch}${esc(label)}</span>`;
}).join('');

// 某個指標目前偏哪邊：有偏強沒偏弱 → up，反之 → down，其餘 → neutral（分頁上的小圓點）
function toneOf(items) {
  const up = items.some((x) => x.tone === 'up'), down = items.some((x) => x.tone === 'down');
  return up && !down ? 'up' : down && !up ? 'down' : 'neutral';
}

// 卡片骨架（每檔股票建一次；指標小圖由 main.js 畫在 .ind-chart 裡）
export function buildCards(container) {
  container.innerHTML = CARDS.map((c) => `<section class="card state-card" data-card="${c.key}">
      <h3>${c.title}</h3>
      ${c.indicators ? `<div class="ind-tabs" role="tablist">${IND_TABS.map((t) => `<button type="button" role="tab" data-ind="${t.type}"><i class="dot"></i>${t.label}</button>`).join('')}</div>
      <div class="ind-legend"></div><div class="ind-chart"></div>` : ''}
      <ul class="state-list"></ul>
      <div class="terms"></div>
    </section>`).join('');
}

const emptyText = (key) => (key === 'watch' ? '今天沒有特別需要留意的狀況。' : '資料不足，暫時無法判斷。');

function fillList(sec, items, key) {
  if (!items.length) items = [{ text: emptyText(key), terms: [], tone: 'neutral' }];
  sec.querySelector('.state-list').innerHTML = items.map((it) => `<li class="tone-${it.tone}">${esc(it.text)}</li>`).join('');
  const terms = [...new Set(items.flatMap((it) => it.terms))];
  sec.querySelector('.terms').innerHTML = terms.map(termBtn).join('');
}

// 更新卡片文字；indType 是技術指標卡片目前選的分頁
export function updateCards(container, result, indType) {
  for (const c of CARDS) {
    const sec = container.querySelector(`[data-card="${c.key}"]`);
    if (!sec) continue;
    if (!c.indicators) { fillList(sec, result.cards[c.key] || [], c.key); continue; }
    const tab = IND_TABS.find((t) => t.type === indType) || IND_TABS[0];
    sec.querySelectorAll('[data-ind]').forEach((b) => {
      const t = b.dataset.ind;
      b.setAttribute('aria-selected', String(t === tab.type));
      b.querySelector('.dot').className = `dot ${toneOf(result.cards[t] || [])}`;
    });
    sec.querySelector('.ind-legend').innerHTML = legendHtml(tab.legend);
    fillList(sec, result.cards[tab.type] || [], tab.type);
  }
}

const signed = (n) => {
  if (n == null) return '<td class="na">—</td>';
  const cls = n > 0 ? 'up' : n < 0 ? 'down' : '';
  return `<td class="${cls}">${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString()}</td>`;
};

export function renderChipsTable(container, chips, status) {
  const rows = [...chips].reverse();
  const head = `<div class="panel-head">三大法人買賣超（張）${termBtn('三大法人')}${termBtn('買賣超')}</div>`;
  if (!status.ready) { container.innerHTML = head + `<div class="placeholder">${esc(status.message || '下載中…')}</div>`; return; }
  if (!rows.some((c) => c.inst)) { container.innerHTML = head + `<div class="placeholder">${esc(status.error ? `下載失敗：${status.error}` : '目前沒有法人資料。')}</div>`; return; }
  container.innerHTML = head + `<div class="card table-card"><table class="data-table">
    <thead><tr><th>日期</th><th>外資</th><th>投信</th><th>自營商</th><th>合計</th></tr></thead>
    <tbody>${rows.map((c) => `<tr><td>${shortDateLabel(c.date)}</td>${c.inst ? signed(c.inst.foreign) + signed(c.inst.trust) + signed(c.inst.dealer) + signed(c.inst.total) : '<td colspan="4" class="na">尚未公布</td>'}</tr>`).join('')}</tbody>
  </table></div><p class="muted table-note">紅色是買超、綠色是賣超。1 張 = 1000 股。資料來源：證交所。</p>`;
}

export function renderMarginTable(container, chips, status) {
  const head = `<div class="panel-head">融資融券餘額（張）${termBtn('融資')}${termBtn('融券')}${termBtn('券資比')}</div>`;
  if (!status.ready) { container.innerHTML = head + `<div class="placeholder">${esc(status.message || '下載中…')}</div>`; return; }
  const asc = chips;
  if (!asc.some((c) => c.margin)) { container.innerHTML = head + `<div class="placeholder">${esc(status.error ? `下載失敗：${status.error}` : '目前沒有融資融券資料（這檔可能不能信用交易）。')}</div>`; return; }
  const body = asc.map((c, i) => {
    const p = i > 0 ? asc[i - 1].margin : null;
    if (!c.margin) return `<tr><td>${shortDateLabel(c.date)}</td><td colspan="5" class="na">尚未公布</td></tr>`;
    const m = c.margin;
    const ratio = m.margin > 0 ? ((m.short / m.margin) * 100).toFixed(1) + '%' : '—';
    return `<tr><td>${shortDateLabel(c.date)}</td><td>${m.margin.toLocaleString()}</td>${signed(p ? m.margin - p.margin : null)}<td>${m.short.toLocaleString()}</td>${signed(p ? m.short - p.short : null)}<td>${ratio}</td></tr>`;
  }).reverse().join('');
  container.innerHTML = head + `<div class="card table-card"><table class="data-table">
    <thead><tr><th>日期</th><th>融資</th><th>增減</th><th>融券</th><th>增減</th><th>券資比</th></tr></thead>
    <tbody>${body}</tbody></table></div>
    <p class="muted table-note">融資融券通常晚上才公布，當天資料可能要隔天早上才看得到。資料來源：證交所。</p>`;
}

// ---- 名詞解釋視窗 ----
export function setupGlossary(sheet) {
  const title = sheet.querySelector('#termTitle');
  const what = sheet.querySelector('#termWhat');
  const how = sheet.querySelector('#termHow');
  const rule = sheet.querySelector('#termRule');
  const close = () => { sheet.hidden = true; };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button.term');
    if (b) {
      const g = GLOSSARY[b.dataset.term];
      if (!g) return;
      title.textContent = b.dataset.term;
      what.textContent = g.what;
      how.textContent = g.how;
      rule.parentElement.hidden = !g.rule;
      rule.textContent = g.rule || '';
      sheet.hidden = false;
      return;
    }
    if (e.target === sheet || e.target.id === 'termClose') close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
