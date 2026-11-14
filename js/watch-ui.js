// 自選名單的畫面：搜尋框下方的「自選1 ▾」「自選2 ▾」、展開的名單（可編輯排序、改名）、加入自選的選擇視窗。

import { loadGroups, groupsOf, toggleInGroup, moveInGroup, removeFromGroup, renameGroup, GROUP_MAX } from './watchlist.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param el {{bar, panel, sheet, choices, sheetClose, starBtn}}
 * @param opts {{onPick: (code) => void, getCurrent: () => ({code, name} | null)}}
 */
export function setupWatchUI(el, { onPick, getCurrent }) {
  let open = -1;       // 展開中的組別，-1 = 沒展開
  let editing = false;

  function renderBar() {
    const groups = loadGroups();
    el.bar.innerHTML = groups.map((g, i) => `<button type="button" class="watch-tab${open === i ? ' open' : ''}" data-group="${i}" aria-expanded="${open === i}">
        ${esc(g.name)} <small>${g.items.length}</small> <span aria-hidden="true">${open === i ? '▴' : '▾'}</span></button>`).join('');
  }

  function renderPanel() {
    if (open < 0) { el.panel.hidden = true; return; }
    const g = loadGroups()[open];
    const cur = getCurrent();
    const rows = g.items.length
      ? g.items.map((x, i) => `<li class="${cur && cur.code === x.code ? 'current' : ''}">
          <button type="button" class="watch-item" data-pick="${esc(x.code)}"><b>${esc(x.code)}</b>${esc(x.name || '')}</button>
          ${editing ? `<span class="watch-edit">
            <button type="button" data-move="-1" data-idx="${i}" aria-label="上移" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" data-move="1" data-idx="${i}" aria-label="下移" ${i === g.items.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" data-remove="${i}" class="danger" aria-label="移除">移除</button></span>` : ''}
        </li>`).join('')
      : `<li class="empty">還沒有股票。查到股票後按名稱下方的「☆ 加入自選」。</li>`;
    el.panel.innerHTML = `
      <div class="watch-panel-head">
        <span>${esc(g.name)}（${g.items.length}/${GROUP_MAX}）</span>
        <span>
          ${editing ? '<button type="button" data-rename>改名</button>' : ''}
          ${g.items.length || editing ? `<button type="button" data-edit>${editing ? '完成' : '編輯'}</button>` : ''}
        </span>
      </div>
      <ul>${rows}</ul>`;
    el.panel.hidden = false;
  }

  function renderStar() {
    const cur = getCurrent();
    if (!cur) return;
    const groups = loadGroups();
    const inG = groupsOf(cur.code);
    el.starBtn.textContent = inG.length ? `★ ${inG.map((i) => groups[i].name).join('、')}` : '☆ 加入自選';
    el.starBtn.classList.toggle('on', inG.length > 0);
    el.starBtn.setAttribute('aria-pressed', String(inG.length > 0));
  }

  function renderChoices() {
    const cur = getCurrent();
    if (!cur) return;
    const groups = loadGroups();
    el.choices.innerHTML = groups.map((g, i) => {
      const on = g.items.some((x) => x.code === cur.code);
      return `<button type="button" class="watch-choice${on ? ' on' : ''}" data-choose="${i}" aria-pressed="${on}">
        <span>${on ? '★' : '☆'} ${esc(g.name)}</span><small>${g.items.length}/${GROUP_MAX}</small></button>`;
    }).join('');
  }

  function refresh() { renderBar(); renderPanel(); renderStar(); }

  // ---- 事件 ----
  el.bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-group]');
    if (!b) return;
    const gi = +b.dataset.group;
    open = open === gi ? -1 : gi;
    editing = false;
    renderBar(); renderPanel();
  });

  el.panel.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.pick) { const code = t.dataset.pick; open = -1; editing = false; refresh(); onPick(code); return; }
    if ('edit' in t.dataset) { editing = !editing; renderPanel(); return; }
    if ('rename' in t.dataset) {
      const g = loadGroups()[open];
      const name = prompt('自選名單的新名稱（最多 8 個字）', g.name);
      if (name != null) { renameGroup(open, name); refresh(); }
      return;
    }
    if (t.dataset.move) { moveInGroup(open, +t.dataset.idx, +t.dataset.move); renderPanel(); return; }
    if (t.dataset.remove != null) { removeFromGroup(open, +t.dataset.remove); refresh(); }
  });

  // 點名單外面就收起來
  document.addEventListener('click', (e) => {
    // 按鈕被重畫後原本的元素已不在畫面上（isConnected = false），這種不算點在外面
    if (open < 0 || !e.target.isConnected || el.panel.contains(e.target) || el.bar.contains(e.target)) return;
    open = -1; editing = false; renderBar(); renderPanel();
  });

  el.starBtn.addEventListener('click', () => { renderChoices(); el.sheet.hidden = false; });
  el.choices.addEventListener('click', (e) => {
    const b = e.target.closest('[data-choose]');
    const cur = getCurrent();
    if (!b || !cur) return;
    const r = toggleInGroup(+b.dataset.choose, cur.code, cur.name);
    if (r.full) alert(`這組最多 ${GROUP_MAX} 檔，請先移除一些，或加到另一組。`);
    else if (!r.saved) alert('這個瀏覽器不允許儲存資料（可能是無痕模式），自選名單無法保存。');
    renderChoices(); refresh();
  });
  const closeSheet = () => { el.sheet.hidden = true; };
  el.sheetClose.addEventListener('click', closeSheet);
  el.sheet.addEventListener('click', (e) => { if (e.target === el.sheet) closeSheet(); });

  renderBar();
  return { refresh };
}
