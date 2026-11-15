// 自選名單：兩組（預設叫自選1、自選2，可改名），每組最多 25 檔，可調整順序。
// 存在這支手機的瀏覽器（localStorage），不會上傳，也不會跟別人共用。
// 只存代號與名稱；點自選股時跟一般查詢一樣會補抓最新資料（不顯示舊價格，避免把舊資料當最新）。

const KEY = 'twstock:v2:watchgroups';
const OLD_KEY = 'twstock:v1:watchlist'; // 第一版只有一組
export const GROUP_MAX = 25;
const DEFAULT_NAMES = ['自選1', '自選2'];

function emptyGroups() {
  return DEFAULT_NAMES.map((name) => ({ name, items: [] }));
}

export function loadGroups() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && Array.isArray(v.groups) && v.groups.length === 2) return v.groups;
    // 舊版單一名單 → 搬到自選1
    const old = JSON.parse(localStorage.getItem(OLD_KEY));
    const groups = emptyGroups();
    if (Array.isArray(old)) groups[0].items = old.filter((x) => x && x.code).slice(0, GROUP_MAX);
    return groups;
  } catch {
    return emptyGroups();
  }
}

function save(groups) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ groups }));
    localStorage.removeItem(OLD_KEY);
    return true;
  } catch {
    return false;
  }
}

// 這檔股票在哪幾組（回傳組別索引陣列）
export function groupsOf(code) {
  return loadGroups().map((g, i) => (g.items.some((x) => x.code === code) ? i : -1)).filter((i) => i >= 0);
}

// 在某一組加入或移除，回傳 { added, full, saved }
export function toggleInGroup(gi, code, name) {
  const groups = loadGroups();
  const items = groups[gi].items;
  const i = items.findIndex((x) => x.code === code);
  if (i >= 0) { items.splice(i, 1); return { added: false, saved: save(groups) }; }
  if (items.length >= GROUP_MAX) return { added: false, full: true, saved: false };
  items.push({ code, name });
  return { added: true, saved: save(groups) };
}

// 調整順序：dir = -1 上移、+1 下移
export function moveInGroup(gi, idx, dir) {
  const groups = loadGroups();
  const items = groups[gi].items;
  const j = idx + dir;
  if (j < 0 || j >= items.length) return false;
  [items[idx], items[j]] = [items[j], items[idx]];
  return save(groups);
}

export function removeFromGroup(gi, idx) {
  const groups = loadGroups();
  groups[gi].items.splice(idx, 1);
  return save(groups);
}

export function renameGroup(gi, name) {
  const groups = loadGroups();
  const clean = String(name || '').trim().slice(0, 8);
  groups[gi].name = clean || DEFAULT_NAMES[gi];
  return save(groups);
}

// 大盤預設放在自選1 第一個（每支手機只做一次；使用者移除後不會再加回來）
const SEED_KEY = 'twstock:v1:indexSeeded';
export function seedIndexOnce(code, name) {
  try {
    if (localStorage.getItem(SEED_KEY)) return;
    const groups = loadGroups();
    const g = groups[0];
    if (!groups.some((x) => x.items.some((it) => it.code === code)) && g.items.length < GROUP_MAX) {
      g.items.unshift({ code, name });
      save(groups);
    }
    localStorage.setItem(SEED_KEY, '1');
  } catch { /* 無法儲存就略過 */ }
}
