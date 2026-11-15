// 「更多」分頁：外部網站連結、加入主畫面教學、關於本 App。
// 連結都在 2026-11-14 實測可開啟（Goodinfo 會先跳出防機器人檢查，用瀏覽器開正常）。

import { APP_VERSION, APP_VERSION_DATE } from './config.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function groups(code) {
  if (code === 'TAIEX') {
    const y = 'https://tw.stock.yahoo.com/quote/%5ETWII';
    return [{ title: '大盤', items: [['加權指數走勢', y, 'Yahoo股市'], ['技術分析', `${y}/technical-analysis`, 'Yahoo股市']] }];
  }
  const y = `https://tw.stock.yahoo.com/quote/${encodeURIComponent(code)}.TW`;
  return [
    {
      title: '籌碼', items: [
        ['主力進出（券商分點）', `${y}/broker-trading`, 'Yahoo股市'],
        ['大戶籌碼', `${y}/major-holders`, 'Yahoo股市'],
      ],
    },
    {
      title: '基本面', items: [
        ['每月營收', `${y}/revenue`, 'Yahoo股市'],
        ['每股盈餘 EPS', `${y}/eps`, 'Yahoo股市'],
        ['股利政策', `${y}/dividend`, 'Yahoo股市'],
        ['公司基本資料', `${y}/profile`, 'Yahoo股市'],
      ],
    },
    {
      title: '新聞與綜合資訊', items: [
        ['相關新聞', `${y}/news`, 'Yahoo股市'],
        ['個股綜合資料', `https://goodinfo.tw/tw/StockDetail.asp?STOCK_ID=${encodeURIComponent(code)}`, 'Goodinfo'],
        ['個股總覽', `https://www.cnyes.com/twstock/${encodeURIComponent(code)}`, '鉅亨網'],
      ],
    },
  ];
}

export function renderMore(container, code, name) {
  const linkHtml = groups(code).map((g) => `
    <section class="card link-group">
      <h3>${g.title}</h3>
      <ul>${g.items.map(([label, url, site]) => `
        <li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">
          <span>${esc(label)}</span><small>${esc(site)} ↗</small>
        </a></li>`).join('')}
      </ul>
    </section>`).join('');

  container.innerHTML = `
    <div class="panel-head">${esc(name)} ${esc(code)} 的其他資訊</div>
    <p class="muted more-note">以下連到其他網站，內容由各網站提供，不是本 App 的判斷。</p>
    ${linkHtml}

    <p class="muted more-note">怎麼加到主畫面、儲存空間、關於本 App：點搜尋框下方的「☰ 選單」。</p>`;
}

// 選單裡的「加到手機主畫面」與「關於本 App」（搜尋框下方「☰ 選單」與首頁按鈕都會打開）
// open：要展開哪一項（menu = 全部收起，讓使用者先看到有哪些項目）
export function renderInfo(installEl, aboutEl, open = 'menu') {
  installEl.innerHTML = `<details class="card info-block">
      <summary>📲 加到手機主畫面</summary>
      <p><b>iPhone（Safari）</b>：按下方的「分享」按鈕（方框加向上箭頭）→ 往下找「加入主畫面」→ 按「新增」。</p>
      <p><b>Android（Chrome）</b>：按右上角「⋮」→「加到主畫面」或「安裝應用程式」→ 按「安裝」。</p>
      <p>加入後桌面會出現「盤後診股室」圖示，點開就是全螢幕，跟一般 App 一樣使用。</p>
    </details>`;
  aboutEl.innerHTML = `<details class="card info-block">
      <summary>ℹ️ 關於本 App</summary>
      <p>盤後診股室用固定公式計算技術指標，再依事先寫好的規則，用白話描述股票目前的技術面狀態。App 本身不使用 AI。</p>
      <p><b>資料</b>：股價、三大法人、融資融券都來自臺灣證券交易所的盤後公開資料。收盤（13:30）前不會顯示當天資料；收盤後證交所一公布，查詢時就會自動更新。三大法人通常傍晚、融資融券通常晚上才公布，公布前會顯示前一個交易日並註明日期。資料存在你的手機裡，不會上傳。</p>
      <p><b>範圍</b>：上市股票、ETF 與加權指數（大盤），不支援上櫃股票。</p>
      <p><b>偏強／偏弱怎麼算</b>：8 項指標各自判斷偏強（+）或偏弱（−），加總後 +3 以上顯示偏強、−3 以下顯示偏弱，其餘顯示中性。門檻是教科書常見的預設值，沒有經過回測。</p>
      <p><b>版本</b>：v${APP_VERSION}（${APP_VERSION_DATE}）</p>
      <p><b>重要</b>：本 App 只描述目前的狀態，不預測漲跌，也不提供買賣建議。技術分析常常失準，請自行判斷並承擔投資風險。</p>
    </details>`;
  installEl.querySelector('details').open = open === 'install';
  aboutEl.querySelector('details').open = open === 'about';
}
