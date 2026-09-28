// ═══════════════════════════════════════════════════════════════════════════
// POS SERVICE WORKER — FULL OFFLINE PWA ENGINE (v21)
// Caches complete application shell, UI, icons, scripts & assets so the POS
// works seamlessly with 100% functionality even when offline/no-network.
// ═══════════════════════════════════════════════════════════════════════════

const SHELL = 'pos-shell-v24';
const IMGS = 'pos-img-v4';
const IMG_LIMIT = 500;
const BASE = new URL('./', self.location).href;
const APP_SHELL_KEY = new URL('./?page=dashboard', self.location).href;

const PRECACHE_ASSETS = [
    new URL('./', BASE).href,
    new URL('index.php', BASE).href,
    new URL('./?source=pwa', BASE).href,
    new URL('index.php?source=pwa', BASE).href,
    new URL('./?page=dashboard', BASE).href,
    new URL('index.php?page=dashboard', BASE).href,
    new URL('./?page=login', BASE).href,
    new URL('index.php?page=login', BASE).href,
    new URL('manifest.json', BASE).href,
    new URL('manifest.webmanifest', BASE).href,
    new URL('assets/icon-192.png', BASE).href,
    new URL('assets/icon-512.png', BASE).href,
    new URL('assets/icon-192-maskable.png', BASE).href,
    new URL('assets/icon-512-maskable.png', BASE).href,
    new URL('assets/default-logo.png', BASE).href,
    new URL('assets/default-product.png', BASE).href,
    'https://cdn.jsdelivr.net/npm/@zxing/library@0.19.1/umd/index.min.js',
    'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
    'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js',
    'https://cdn.jsdelivr.net/npm/qz-tray@2.2.6/qz-tray.js'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(SHELL).then(async cache => {
            for (const url of PRECACHE_ASSETS) {
                try {
                    await cache.add(url);
                } catch (err) {
                    // Continue caching other assets even if an individual remote URL fails
                }
            }
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== IMGS).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', e => {
    if (e.data === 'skipWaiting') {
        self.skipWaiting();
    }
    if (e.data === 'clearUserCache') {
        caches.delete(SHELL);
    }
});

function isImageRequest(url, req) {
    if (req.method !== 'GET') return false;
    if (url.pathname.includes('get_product_image')) return true;
    if (url.pathname.includes('/assets/') && (url.pathname.endsWith('.png') || url.pathname.endsWith('.webp') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.svg'))) return true;
    if (url.hostname.endsWith('.supabase.co') && url.pathname.includes('/storage/v1/object/public/')) return true;
    if (url.hostname.endsWith('.cloudinary.com') && url.pathname.includes('/image/upload/')) return true;
    return false;
}

async function trimCache(cacheName, max) {
    try {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        while (keys.length > max) {
            await cache.delete(keys[0]);
            keys.shift();
        }
    } catch (e) {}
}

// Fetch with timeout — used for fast failover
async function fetchWithTimeout(request, timeoutMs = 3000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const response = await fetch(request, { signal: ctrl.signal });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
}

// Minimal inline fallback page shown only when the server is unreachable AND
// the app has never been cached yet (first ever visit while server is cold).
// Automatically retries every 5 seconds so the user does not have to click.
function buildSetupPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connecting… — ProCast POS</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
     background:#0a1628;color:#f8fafc;display:flex;align-items:center;
     justify-content:center;min-height:100vh;padding:20px;text-align:center}
.box{background:#112240;padding:40px 28px;border-radius:18px;max-width:460px;
     width:100%;border:1.5px solid rgba(255,255,255,.1);box-shadow:0 8px 40px rgba(0,0,0,.4)}
.spinner{width:48px;height:48px;border:4px solid rgba(59,130,246,.2);
         border-top-color:#3b82f6;border-radius:50%;margin:0 auto 22px;
         animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
h1{font-size:1.25rem;margin-bottom:10px;color:#38bdf8}
p{color:#94a3b8;font-size:.9rem;line-height:1.55;margin-bottom:6px}
.sub{font-size:.78rem;color:#64748b;margin-bottom:28px}
.btn{display:block;width:100%;padding:13px;border-radius:10px;font-weight:700;
     font-size:.95rem;cursor:pointer;border:none;background:#2563eb;color:#fff;
     transition:background .2s}
.btn:hover{background:#1d4ed8}
#cd{display:inline-block;width:1.6em;text-align:center;font-weight:800;color:#38bdf8}
</style>
</head>
<body>
<div class="box">
  <div class="spinner"></div>
  <h1>Connecting to POS Server…</h1>
  <p>Connecting to ProCast POS. If offline, the local POS interface is loading.</p>
  <p class="sub">Retrying in <span id="cd">3</span>s</p>
  <button class="btn" onclick="reload()">Retry Now</button>
</div>
<script>
function reload(){ location.reload(); }
var n=3;
var t=setInterval(function(){
  n--;
  var el=document.getElementById('cd');
  if(el) el.textContent=n;
  if(n<=0){ clearInterval(t); reload(); }
},1000);
</script>
</body>
</html>`;
}

self.addEventListener('fetch', e => {
    const req = e.request;
    const url = new URL(req.url);

    // State-changing calls (form POSTs, login, logout) bypass SW if online
    if (req.method !== 'GET') {
        return;
    }

    // Dynamic API requests (?api=...) - fast failover without premature offline triggers
    if (url.searchParams.has('api')) {
        const isPing = url.searchParams.get('api')?.startsWith('ping');
        const timeoutMs = isPing ? 5000 : 8500;
        e.respondWith(
            fetchWithTimeout(req, timeoutMs).catch(() => {
                return new Response(JSON.stringify({ success: false, offline: true, error: 'Offline - server unreachable' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // ── IMAGES: Cache-first (instant after first view, works offline) ──
    if (isImageRequest(url, req)) {
        e.respondWith((async () => {
            const cache = await caches.open(IMGS);
            const hit = await cache.match(req);
            if (hit) return hit;
            try {
                const resp = await fetch(req);
                if (resp && (resp.status === 200 || resp.type === 'opaque')) {
                    await cache.put(req, resp.clone());
                    trimCache(IMGS, IMG_LIMIT);
                }
                return resp;
            } catch (err) {
                // If offline and image not cached, fallback to default product or logo
                const defProd = await cache.match(new URL('assets/default-product.png', BASE).href);
                if (defProd) return defProd;
                return Response.error();
            }
        })());
        return;
    }

    // ── APP HTML NAVIGATION ──
    // Strategy: Instant Cache-First with fast network revalidation.
    // If offline or Wi-Fi is off: Returns cached shell immediately (0ms) so Chrome NEVER shows "You're offline".
    // If online: Fast network race (2.5s). If online answers, update cache & return.
    // If network times out or drops: Immediately serve cached shell with zero delay.
    if (req.mode === 'navigate') {
        e.respondWith((async () => {
            const shellCache = await caches.open(SHELL);

            async function getCachedShell() {
                // 1. Direct URL match
                let match = await shellCache.match(req);
                if (match) return match;

                // 2. Ignore query params match
                match = await shellCache.match(req, { ignoreSearch: true });
                if (match) return match;

                // 3. Known app shell URLs
                const candidateUrls = [
                    APP_SHELL_KEY,
                    new URL('index.php?page=dashboard', BASE).href,
                    new URL('./?source=pwa', BASE).href,
                    new URL('index.php?source=pwa', BASE).href,
                    new URL('index.php', BASE).href,
                    new URL('./', BASE).href,
                    new URL('./?page=login', BASE).href,
                    new URL('index.php?page=login', BASE).href
                ];
                for (const u of candidateUrls) {
                    const c = await shellCache.match(u);
                    if (c) return c;
                }

                // 4. Any HTML in shell cache as safe fallback
                const keys = await shellCache.keys();
                for (const k of keys) {
                    const res = await shellCache.match(k);
                    if (res && res.headers.get('content-type')?.includes('text/html')) {
                        return res;
                    }
                }
                return null;
            }

            // If device is offline, immediately return cached shell — NEVER let Chrome timeout to offline screen
            if (self.navigator && self.navigator.onLine === false) {
                const cached = await getCachedShell();
                if (cached) return cached;
            }

            // Online or uncertain: try network with a snappy 2.5s budget
            try {
                const resp = await fetchWithTimeout(req, 2500);
                if (resp && resp.status === 200) {
                    shellCache.put(APP_SHELL_KEY, resp.clone()).catch(() => {});
                    shellCache.put(req, resp.clone()).catch(() => {});
                    shellCache.put(new URL('./', BASE).href, resp.clone()).catch(() => {});
                    shellCache.put(new URL('index.php', BASE).href, resp.clone()).catch(() => {});
                    return resp;
                }
            } catch (err) {
                // Network unreachable or took longer than 2.5s — instant cache fallback
            }

            // Return cached version
            const cached = await getCachedShell();
            if (cached) return cached;

            // Only on absolute first visit with cold server: allow Render cold-start grace period
            try {
                const slowResp = await fetchWithTimeout(req, 12000);
                if (slowResp && slowResp.status === 200) {
                    shellCache.put(APP_SHELL_KEY, slowResp.clone()).catch(() => {});
                    return slowResp;
                }
            } catch (e) {}

            return new Response(buildSetupPage(), {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        })());
        return;
    }

    // ── CDN LIBRARIES & STATIC FILES: Cache-first, network fallback ──
    e.respondWith((async () => {
        const cache = await caches.open(SHELL);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
            const resp = await fetch(req);
            if (resp && (resp.status === 200 || resp.type === 'opaque')) {
                await cache.put(req, resp.clone());
            }
            return resp;
        } catch (err) {
            return hit || Response.error();
        }
    })());
});

// ── BACKGROUND SYNC: Wake up and signal clients when connection is restored ──
self.addEventListener('sync', e => {
    if (e.tag === 'sync-offline-orders' || e.tag === 'pos-sync') {
        e.waitUntil(
            self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'TRIGGER_SYNC' });
                });
            })
        );
    }
});
