// الفاحص الذكي · الإعدادات والأدوات العامة والإصدار
// جزء من index.html، يُحمَّل بالترتيب: كل الملفات تشترك في نفس النطاق العام

// ---------- الإصدار وتسجيل الأخطاء: أي خطأ عند المستخدم يصل للوحة الإدارة (3 كحد أقصى لكل جلسة) ----------
const APP_VERSION = '3.3.0';
const SITE_URL = 'https://alfahis.pages.dev';
// حذف أرقام الجوال والهوية والبريد من أي نص قبل إرساله أو حفظه
function noPii(text) {
    return String(text || '')
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[بريد]')
        .replace(/(?:\+|00)?\d[\d\s\-()]{8,}\d/g, '[رقم]')
        .replace(/\s+/g, ' ').trim();
}
(() => {
    let n = 0;
    const send = m => { if (n++ >= 3 || location.protocol === 'file:') return; try { fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ mode: 'clienterr', msg: String(m).slice(0, 200), page: location.pathname.slice(-20), ver: APP_VERSION, ua: navigator.userAgent.slice(0, 60) }) }).catch(() => {}); } catch (e) {} };
    window.reportClientError = send;
    window.addEventListener('error', e => send((e.message || 'error') + ' @' + (e.lineno || 0)));
    window.addEventListener('unhandledrejection', e => send('promise: ' + ((e.reason && e.reason.message) || e.reason)));
    document.addEventListener('DOMContentLoaded', () => { const v = document.createElement('p'); v.textContent = 'الإصدار ' + APP_VERSION + ' · '; const fl = document.createElement('a'); fl.href = '/faults/index.html'; fl.textContent = 'دليل الأعطال'; fl.style.cssText = 'color:#64748B;text-decoration:underline'; v.appendChild(fl); v.style.cssText = 'text-align:center;font-size:11px;color:#94A3B8;margin:14px 0 90px'; (document.querySelector('main') || document.body).appendChild(v); });
})();
// ---------- نسخة تجريبية + "أبلغ عن مشكلة" ----------
window.reportIssue = async function (ctx) {
    const text = prompt('وش المشكلة اللي واجهتك؟ (نقرأ كل بلاغ ونصلحه)');
    if (!text || text.trim().length < 3) return;
    const contact = prompt('رقم واتساب أو بريد للرد عليك (اختياري)') || '';
    try {
        const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'issue', text: text.trim(), contact: contact.trim(), page: location.pathname.slice(-20), ver: APP_VERSION, ctx: String(ctx || '').slice(0, 200) }) });
        alert(r.ok ? 'وصلنا بلاغك، شكراً لك. سنعمل عليه بأسرع وقت.' : 'تعذر الإرسال الآن، حاول بعد قليل.');
    } catch (e) { alert('تعذر الإرسال الآن، حاول بعد قليل.'); }
};
document.addEventListener('DOMContentLoaded', () => {
    const h = document.querySelector('header h1, header .t b, header > b');
    if (h && !document.getElementById('beta-badge')) {
        const b = document.createElement('span'); b.id = 'beta-badge'; b.textContent = 'نسخة تجريبية';
        b.style.cssText = 'display:inline-block;margin-inline-start:6px;font-size:11px;font-weight:700;color:#0F172A;background:#FCD34D;border-radius:6px;padding:1px 7px;vertical-align:middle;line-height:1.6';
        h.appendChild(b);
    }
    const host = document.querySelector('main') || document.body;
    const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = '⚠️ أبلغ عن مشكلة';
    btn.style.cssText = 'display:block;margin:18px auto 0;min-height:44px;padding:0 18px;border-radius:12px;border:1px solid #CBD5E1;background:#fff;color:#0F172A;font:inherit;font-size:14px;font-weight:600;cursor:pointer';
    btn.onclick = () => window.reportIssue('أسفل الصفحة');
    host.appendChild(btn);
    const cr = document.getElementById('car-results');
    if (cr) { const rb = document.createElement('button'); rb.type = 'button'; rb.className = 'no-print'; rb.textContent = '⚠️ التشخيص غير صحيح؟ أبلغنا';
        rb.style.cssText = 'display:block;width:100%;min-height:44px;border-radius:12px;border:1px solid #FECACA;background:#fff;color:#991B1B;font:inherit;font-size:14px;font-weight:600;cursor:pointer';
        rb.onclick = () => window.reportIssue('تشخيص: ' + ((document.getElementById('res-title') || {}).textContent || '')); cr.appendChild(rb); }
});


// =====================================================================
// ⚙️ الإعدادات — عدّل هذا القسم فقط عند الربط (التفاصيل في README.md)
// =====================================================================
const FIREBASE_CONFIG = {               // مشروع Firebase: mj333-24cde
    apiKey: "AIzaSyACt18eL1b_k0udQwXNH0dq56DmMXL8iLE",
    authDomain: "mj333-24cde.firebaseapp.com",
    projectId: "mj333-24cde",
    storageBucket: "mj333-24cde.firebasestorage.app",
    messagingSenderId: "432865728090",
    appId: "1:432865728090:web:59bf809cf19f58a320aa63"
};
const OWNER_EMAIL = "majed111333sj@gmail.com";   // بريد مالك التطبيق المسجّل في Firebase Authentication
const DEMO_OWNER_PASSWORD = "1234";    // كلمة مرور الإدارة في الوضع التجريبي فقط
const AI_ENDPOINT = "/api/ai";         // دالة الذكاء الاصطناعي على Vercel (تعمل بعد إضافة ANTHROPIC_API_KEY)
// =====================================================================

// ---------- أدوات عامة ----------
const $ = id => document.getElementById(id);
function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
}
const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
function cleanPhone(p) { return String(p || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '').slice(0, 16); }
function fmtTime(ts) { try { return new Date(ts).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return ''; } }
function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }
function normalizeAr(t) {
    return String(t || '').toLowerCase()
        .replace(/[\u064B-\u0652\u0640]/g, '')
        .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
        .replace(/\s+/g, ' ').trim();
}

// =====================================================================
