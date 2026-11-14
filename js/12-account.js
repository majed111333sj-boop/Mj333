// الفاحص الذكي · حساب اختياري بجوجل: يربط رصيدك بحسابك فيبقى معك على أي جهاز أو متصفح
// بدون حساب كل شيء يعمل كما كان. الحساب لا يُطلب أبداً للاستخدام أو الدفع.
const Acct = { user: null, busy: false, msg: '' };

function acctReady() {
    return new Promise(ok => { let n = 0; const t = setInterval(() => { if ((window.firebase && firebase.apps && firebase.apps.length) || ++n > 80) { clearInterval(t); ok(!!(window.firebase && firebase.apps && firebase.apps.length)); } }, 150); });
}
function acctEmail() { return (Acct.user && !Acct.user.isAnonymous && Acct.user.email) || store.get('sd_acct', null); }

function renderAcct() {
    document.querySelectorAll('.acct-slot').forEach(box => {
        box.textContent = '';
        const email = acctEmail();
        const card = el('div', 'rounded-xl border p-2.5 space-y-1.5 ' + (email ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'));
        if (email) {
            card.appendChild(el('p', 'font-black text-[11px] text-emerald-800', '✅ رصيدك محفوظ بحسابك'));
            const em = el('p', 'text-[10px] text-slate-600', email); em.dir = 'ltr'; em.setAttribute('data-noi18n', ''); card.appendChild(em);
            card.appendChild(el('p', 'text-[10px] text-slate-500 leading-relaxed', 'ادخل بنفس الحساب من أي جوال أو متصفح لتجد رصيدك.'));
            const b = el('button', 'text-[10px] underline text-slate-500', 'تسجيل الخروج'); b.type = 'button'; b.onclick = acctSignOut; card.appendChild(b);
        } else {
            card.appendChild(el('p', 'font-black text-[11px] text-slate-800', '💾 احفظ رصيدك (اختياري)'));
            card.appendChild(el('p', 'text-[10px] text-slate-500 leading-relaxed', 'سجّل بحساب جوجل ليبقى رصيدك معك إن غيّرت الجوال أو مسحت المتصفح. لا يلزمك التسجيل للاستخدام.'));
            const b = el('button', 'w-full min-h-[44px] rounded-lg border border-slate-300 bg-white font-bold text-[12px] flex items-center justify-center gap-2', Acct.busy ? 'جارٍ التسجيل…' : 'التسجيل بحساب جوجل'); b.type = 'button'; b.disabled = Acct.busy;
            b.onclick = acctGoogle; card.appendChild(b);
        }
        if (Acct.msg) card.appendChild(el('p', 'text-[10px] font-bold text-red-700', Acct.msg));
        box.appendChild(card);
    });
}

// يُرسل رمز الحساب للخادم، ويتبنّى المحفظة التي يعيدها (قد تكون محفظة الحساب القديمة)
async function acctLink() {
    const u = firebase.auth().currentUser;
    if (!u || u.isAnonymous) return false;
    const token = await u.getIdToken();
    const r = await payApi({ mode: 'acct_link', token, cc: (window.SD && SD.cc) || undefined });
    if (r.status !== 200 || !r.json || !r.json.wid) { Acct.msg = r.status === 401 ? 'تعذر التحقق من الحساب، حاول مرة أخرى.' : 'تعذر الربط الآن، حاول بعد قليل.'; return false; }
    const changed = r.json.wid !== store.get('sd_wallet', null);
    if (changed) store.set('sd_wallet', r.json.wid);
    store.set('sd_acct', u.email || r.json.email || 'حساب جوجل');
    store.set('sd_acct_name', String(u.displayName || '').trim().split(/\s+/)[0] || '');
    Acct.msg = '';
    if (typeof walletRefresh === 'function') await walletRefresh();
    return true;
}

async function acctGoogle() {
    if (Acct.busy) return;
    Acct.busy = true; Acct.msg = ''; renderAcct();
    try {
        if (!(await acctReady())) throw Object.assign(new Error('offline'), { code: 'sd/offline' });
        const provider = new firebase.auth.GoogleAuthProvider();
        const cur = firebase.auth().currentUser;
        try {
            // الأفضل: ربط الحساب بالزائر الحالي ليبقى طلباته للورش
            if (cur && cur.isAnonymous) await cur.linkWithPopup(provider); else await firebase.auth().signInWithPopup(provider);
        } catch (e) {
            if (e && e.code === 'auth/credential-already-in-use' && e.credential) await firebase.auth().signInWithCredential(e.credential);   // حساب موجود من جهاز آخر
            else throw e;
        }
        Acct.user = firebase.auth().currentUser;
        if (await acctLink()) { track('acct_ok'); Acct.busy = false; renderAcct(); if (typeof applyLock === 'function') try { applyLock(); } catch (e) {} return; }
    } catch (e) {
        const c = (e && e.code) || '';
        Acct.msg = c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request' ? '' :
            c === 'auth/popup-blocked' ? 'المتصفح منع النافذة، اسمح بالنوافذ المنبثقة ثم أعد المحاولة.' :
            c === 'auth/unauthorized-domain' || c === 'auth/operation-not-allowed' ? 'تسجيل جوجل غير مفعّل بعد في الإعدادات.' :
            c === 'sd/offline' ? 'تعذر الاتصال بخدمة الحساب، تأكد من الإنترنت.' : 'تعذر التسجيل، حاول مرة أخرى.';
    }
    Acct.busy = false; renderAcct();
}

async function acctSignOut() {
    if (!confirm('تسجيل الخروج؟ يبقى رصيدك في حسابك، وتجده عند الدخول مرة أخرى.')) return;
    try { await firebase.auth().signOut(); } catch (e) {}
    store.del('sd_wallet'); store.del('sd_acct'); store.del('sd_wallet_last_known');   // لا يبقى رصيدك على جهاز مشترك
    location.reload();
}

document.addEventListener('DOMContentLoaded', async () => {
    renderAcct();
    if (!(await acctReady())) return;
    firebase.auth().onAuthStateChanged(async u => {
        Acct.user = u;
        if (u && !u.isAnonymous && !store.get('sd_acct', null)) { try { await acctLink(); } catch (e) {} }   // دخول سابق لم يكتمل ربطه
        if (u && !u.isAnonymous && store.get('sd_acct', null) !== u.email && u.email) store.set('sd_acct', u.email);
        renderAcct();
    });
});
// قبل الدفع نذكّر بالتسجيل حتى لا يضيع الرصيد؛ تُستدعى بعد كل فتح لنافذة الدفع
window.renderAcct = renderAcct;

// ---------- عند أول عملية شراء: تسجيل بضغطة واحدة (الاسم والبريد يأتيان من جوجل) ----------
function acctNeeded() {
    if (acctEmail()) return false;
    const sk = store.get('sd_acct_skip', 0);
    return !(sk && Date.now() - sk < 30 * 864e5);   // من اختار المتابعة بدون حساب لا نسأله شهراً
}
function acctPrefill() {   // يُضاف لرابط الدفع فلا يكتب المشتري بياناته مرة ثانية
    const e = store.get('sd_acct', null), n = store.get('sd_acct_name', '');
    if (!e || !/^[^@\s]+@[^@\s]+$/.test(e)) return '';
    return '&checkout[email]=' + encodeURIComponent(e) + (n ? '&checkout[name]=' + encodeURIComponent(n) : '');
}
function acctAsk(k) {
    let m = document.getElementById('acct-ask');
    if (m) m.remove();
    m = el('div', 'fixed inset-0 bg-black/75 z-[90] flex items-center justify-center p-4'); m.id = 'acct-ask';
    const c = el('div', 'bg-white w-full max-w-sm rounded-2xl p-4 space-y-2.5 shadow-2xl'); m.appendChild(c);
    c.appendChild(el('h3', 'font-black text-sm', '👋 خطوة واحدة قبل الدفع'));
    c.appendChild(el('p', 'text-[12px] text-slate-600 leading-relaxed', 'سجّل بضغطة واحدة بحساب جوجل (يأخذ اسمك الأول وبريدك تلقائياً). فيُحفظ رصيدك معك على أي جوال، ويصلك إيصال الدفع.'));
    const err = el('p', 'text-[11px] font-bold text-red-700'); c.appendChild(err);
    const g = el('button', 'w-full min-h-[48px] rounded-xl bg-slate-900 text-white font-black text-[13px]', 'متابعة بحساب جوجل'); g.type = 'button';
    g.onclick = async () => { g.disabled = true; await acctGoogle(); g.disabled = false; if (acctEmail()) { m.remove(); buyProduct(k); } else err.textContent = Acct.msg || ''; };
    c.appendChild(g);
    const sk = el('button', 'w-full text-[11px] underline text-slate-500 py-1.5', 'متابعة الدفع بدون حساب'); sk.type = 'button';
    sk.onclick = () => { store.set('sd_acct_skip', Date.now()); m.remove(); buyProduct(k); };
    c.appendChild(sk);
    document.body.appendChild(m);
}
