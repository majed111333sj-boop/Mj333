// تثبيت التطبيق على الشاشة الرئيسية (أندرويد: زر تثبيت، آيفون: تلميح). لا يظهر إن كان مثبتاً أو أُغلق من قبل.
(() => {
    if (location.protocol === 'file:') return;
    if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const KEY = 'pwa_hide';
    const hidden = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
    if (standalone || hidden()) return;
    const bar = (msg, btnText, onBtn) => {
        const b = document.createElement('div'); b.setAttribute('role', 'dialog');
        b.style.cssText = 'position:fixed;inset-inline:12px;bottom:12px;z-index:60;background:#0F172A;color:#fff;border-radius:14px;padding:10px 12px;display:flex;gap:8px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.3);font-size:14px;line-height:1.5';
        const t = document.createElement('span'); t.style.flex = '1'; t.textContent = msg; b.appendChild(t);
        if (btnText) { const i = document.createElement('button'); i.type = 'button'; i.textContent = btnText; i.style.cssText = 'min-height:44px;padding:0 14px;border:0;border-radius:10px;background:#F59E0B;color:#0F172A;font:inherit;font-weight:800;cursor:pointer'; i.onclick = () => { onBtn(); b.remove(); }; b.appendChild(i); }
        const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'إغلاق'); x.style.cssText = 'min-width:44px;min-height:44px;border:0;background:transparent;color:#CBD5E1;font-size:18px;cursor:pointer';
        x.onclick = () => { try { localStorage.setItem(KEY, '1'); } catch (e) {} b.remove(); }; b.appendChild(x);
        document.body.appendChild(b);
    };
    window.addEventListener('beforeinstallprompt', ev => {
        ev.preventDefault();
        setTimeout(() => bar('ثبّت «افحص الآن» على جوالك كتطبيق', 'تثبيت', () => { ev.prompt(); try { localStorage.setItem(KEY, '1'); } catch (e) {} }), 8000);
    });
    if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent))
        setTimeout(() => bar('لتثبيت التطبيق: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»'), 10000);
})();
