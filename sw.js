// 離線快取：只快取 App 本身的檔案（網頁、程式、圖示），讓沒網路時也能打開。
// 股價資料不經過這裡（存在 localStorage），也絕不快取證交所的回應，避免把舊資料當新資料。
// 策略：先連網拿最新版，連不上才用快取 → App 更新後使用者重新整理就是新版。
// 改了 App 檔案後把 VERSION 加 1，舊快取會被清掉。
const VERSION = 'v4';
const CACHE = `pzs-app-${VERSION}`;
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/main.js', 'js/config.js', 'js/dates.js', 'js/twse.js', 'js/store.js', 'js/data.js',
  'js/chart.js', 'js/indicators.js', 'js/rules.js', 'js/glossary.js', 'js/chips.js', 'js/ui-state.js', 'js/links.js', 'js/price.js', 'js/patterns.js', 'js/watchlist.js', 'js/watch-ui.js', 'js/search.js', 'js/stock-list.js', 'js/industry.js',
  'vendor/lightweight-charts.mjs',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pzs-app-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // 證交所等外部請求不處理
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
