// 取得某檔股票的日資料：先讀本機，只補抓缺的或過期的月份。

import { CONFIG } from './config.js';
import { cutoffDate, lastPublishMoment, monthFinalMoment, recentMonths } from './dates.js';
import { fetchStockMonth, FetchError } from './twse.js';
import { loadStock, saveStock } from './store.js';

// 某月份是否需要（重）抓
function monthNeedsFetch(entry, month, now) {
  if (!entry) return true;
  const [y, m] = month.split('-').map(Number);
  if (entry.fetchedAt >= monthFinalMoment(y, m, CONFIG.afterCloseHour).getTime()) return false; // 該月已完整
  if (entry.fetchedAt >= lastPublishMoment(now, CONFIG.afterCloseHour).getTime()) return false; // 最近一次收盤後抓過
  return true;
}

/**
 * @param {string} code 股票代號
 * @param {(msg: string) => void} onProgress 進度文字
 * @returns {Promise<{
 *   status: 'ok' | 'notfound' | 'error',
 *   name?: string, rows?: object[], cutoff?: string,
 *   stale?: boolean,       // true = 有月份更新失敗，顯示的是舊資料
 *   error?: string,
 * }>}
 */
export async function getStockData(code, onProgress = () => {}, now = new Date()) {
  const months = recentMonths(now, CONFIG.monthsToFetch);
  const cutoff = cutoffDate(now, CONFIG.afterCloseHour);
  const data = loadStock(code) || { code, name: '', months: {}, rows: [] };

  // 新到舊抓：查無此股時，前兩個月就能判斷出來，不用白抓 7 次
  const todo = months.filter((mo) => monthNeedsFetch(data.months[mo], mo, now)).reverse();
  let error = null;
  let emptyStreak = 0;

  for (let i = 0; i < todo.length; i++) {
    const mo = todo[i];
    onProgress(todo.length > 1
      ? `正在向證交所下載資料（${i + 1}/${todo.length}）…第一次查詢這檔股票需要較久`
      : '正在向證交所更新資料…');
    let res;
    try {
      res = await fetchStockMonth(code, mo);
    } catch (e) {
      error = e instanceof FetchError ? e.message : '下載資料時發生未預期的錯誤。';
      break;
    }
    data.months[mo] = { fetchedAt: Date.now(), found: res.found };
    if (res.found) {
      emptyStreak = 0;
      if (res.name) data.name = res.name;
      data.rows = data.rows.filter((r) => !r.date.startsWith(mo)).concat(res.rows);
    } else {
      emptyStreak++;
      if (emptyStreak >= 2 && data.rows.length === 0) {
        return { status: 'notfound' };
      }
    }
  }

  // 整理：排序、只留需要的月份
  const oldest = months[0];
  data.rows = data.rows
    .filter((r) => r.date.slice(0, 7) >= oldest)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (data.rows.length === 0) {
    if (error) return { status: 'error', error };
    return { status: 'notfound' };
  }

  saveStock(data);

  // 盤後規則：下午三點前不顯示當天資料
  const rows = data.rows.filter((r) => r.date <= cutoff);
  return { status: 'ok', name: data.name, rows, cutoff, stale: !!error, error };
}
