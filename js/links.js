// 「更多」分頁：外部網站連結、加入主畫面教學、關於本 App。
// 連結都在 2026-11-14 實測可開啟（Goodinfo 會先跳出防機器人檢查，用瀏覽器開正常）。

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function groups(code) {
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

    <details class="card info-block">
      <summary>怎麼把本 App 加到手機主畫面</summary>
      <p><b>iPhone（Safari）</b>：按下方的「分享」按鈕（方框加向上箭頭）→ 往下找「加入主畫面」→ 按「新增」。</p>
      <p><b>Android（Chrome）</b>：按右上角「⋮」→「加到主畫面」或「安裝應用程式」→ 按「安裝」。</p>
      <p>加入後桌面會出現「盤後診股室」圖示，點開就是全螢幕，跟一般 App 一樣使用。</p>
    </details>

    <details class="card info-block">
      <summary>關於本 App</summary>
      <p>盤後診股室用固定公式計算技術指標，再依事先寫好的規則，用白話描述股票目前的技術面狀態。App 本身不使用 AI。</p>
      <p><b>資料</b>：股價、三大法人、融資融券都來自臺灣證券交易所的盤後公開資料。每天下午三點後才會顯示當天資料；法人資料通常傍晚公布，融資融券通常晚上公布。資料存在你的手機裡，不會上傳。</p>
      <p><b>範圍</b>：目前只支援上市股票與 ETF，不支援上櫃股票。</p>
      <p><b>偏多／偏空怎麼算</b>：8 項指標各自判斷偏多（+）或偏空（−），加總後 +3 以上顯示偏多、−3 以下顯示偏空，其餘顯示中性。門檻是教科書常見的預設值，沒有經過回測。</p>
      <p><b>重要</b>：本 App 只描述目前的狀態，不預測漲跌，也不提供買賣建議。技術分析常常失準，請自行判斷並承擔投資風險。</p>
    </details>`;
}
