// خدمة تثبيت التطبيق: الشبكة أولاً دائماً، والنسخة المحفوظة للصفحات فقط عند انقطاع الإنترنت. لا تُخزَّن طلبات /api أبداً.
const C = 'afhas-shell-1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
    const r = e.request, u = new URL(r.url);
    if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
    e.respondWith(fetch(r).then(res => {
        if (res.ok && r.mode === 'navigate') { const cp = res.clone(); caches.open(C).then(c => c.put(r, cp)).catch(() => {}); }
        return res;
    }).catch(() => caches.match(r).then(m => m || caches.match('/') || new Response('لا يوجد اتصال بالإنترنت. افتح التطبيق عند توفر الاتصال.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))));
});
