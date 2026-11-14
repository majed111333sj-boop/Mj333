// الفاحص الذكي · الدفع والمحفظة والأكواد
// جزء من index.html، يُحمَّل بالترتيب: كل الملفات تشترك في نفس النطاق العام

// 💳 الدفع: النتيجة الأساسية مجانية، والتقرير الكامل مدفوع (أول تقرير مجاني)
// =====================================================================
const PAYWALL_ON = true;
// خدمة واحدة مجانية (أول فحص)، ثم وصول كامل لكل الخدمات بالمدة
// الباقات: الفحص وأسعار القطع وخدماتهما. الأدوات المستقلة وفحص المستعملة لهما أسعارهما
const PRODUCTS = {
    pack3:  { sar: 9.99,  title: 'باقة 3 فحوصات', desc: 'ثلاث فحوصات كاملة مع أسعار القطع وكل خدمات الفحص' },
    day:    { sar: 19.99,    title: 'يوم كامل', desc: 'فحوصات غير محدودة لمدة 24 ساعة', badge: 'الأكثر طلباً' },
    week:   { sar: 139,    title: 'أسبوع كامل', desc: 'فحوصات غير محدودة لمدة 7 أيام • الأوفر' },
    report: { sar: 33,    title: 'فحص سيارة مستعملة', desc: 'فحص كامل قبل الشراء مرة واحدة: كاميرا وصوت واهتزاز، ويمكن عن بعد' },
    tools:  { sar: 14.9, title: 'باقة الأدوات', desc: '5 استخدامات للأدوات المستقلة (الكاميرا، الصوت، الاهتزاز، الكفرات…)' }
};
const PAY_ORDER = ['pack3', 'day', 'week', 'report', 'tools'];
// السعر المعروض: بعملة المنطقة خارج الشرق الأوسط، ومن الريال داخله
const prodPrice = k => (window.SD && SD.price(k)) || priceText(PRODUCTS[k].sar);
// روابط الدفع تُضاف بعد اختيار بوابة الدفع؛ {WID} يُستبدل برقم محفظة المستخدم
const PAY_LINKS = {};   // تأتي تلقائياً من الخادم (متغيرات LEMON_CHECKOUT_*)
const Wallet = { state: null };
function walletId() {
    let w = store.get('sd_wallet', null);
    if (!w || !/^w_[a-z0-9]{12,24}$/.test(w)) {
        const a = new Uint8Array(12); crypto.getRandomValues(a);
        w = 'w_' + Array.from(a, b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('') + Date.now().toString(36).slice(-4);
        store.set('sd_wallet', w);
    }
    return w;
}
const priceText = sar => { const c = C(); const v = sar * c.rate; return v.toLocaleString('en', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: Math.max(2, c.dec ?? 0) }) + ' ' + c.cur; };
async function payApi(body) {
    if (location.protocol === 'file:') return { status: 0, json: null };
    try {
        const res = await fetch(AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ wid: walletId() }, body)) });
        return { status: res.status, json: await res.json().catch(() => null) };
    } catch (e) { return { status: 0, json: null }; }
}
// أرقام الاستخدام (بدون أي بيانات شخصية): لمعرفة كم بدأ وكم أكمل وكم وصل للدفع
function track(ev) { try { if (location.protocol !== 'file:') fetch(AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'track', ev }), keepalive: true }).catch(() => {}); } catch (e) {} }
// آخر حالة معروفة للمحفظة: من لديه وصول مدفوع ساري يبقى وصوله عند انقطاع الإنترنت، ومن ليس لديه لا يُفتح له شيء
async function walletRefresh() {
    const r = await payApi({ mode: 'wallet' });
    if (r.status === 200 && r.json) {
        Wallet.state = r.json;
        store.set('sd_wallet_last_known', { passUntil: r.json.passUntil || 0, uses: r.json.uses || 0, toolUses: r.json.toolUses || 0, reports: r.json.reports || 0, unlocked: r.json.unlocked || [], freeChoice: r.json.freeChoice || null, at: Date.now() });
    } else if (r.status === 503 || r.status === 0) {
        const lk = store.get('sd_wallet_last_known', null);
        Wallet.state = Object.assign({}, lk && lk.passUntil > Date.now() ? { passUntil: lk.passUntil, uses: lk.uses, toolUses: lk.toolUses, reports: lk.reports, unlocked: lk.unlocked || [] } : {}, { offline: true, freeAvailable: false });
    }
    applyLock();
    return Wallet.state;
}
function diagIdFor(m) {
    m = m || {};
    const key = [carLabel(), m.source, m.text, m.structured, m.code, m.soundSummary ? 'snd' : ''].join('|');
    let h = 5381; for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
    return 'd' + h.toString(36) + key.length.toString(36);
}
const diagId = () => diagIdFor(lastMeta);
const passActive = () => !!(Wallet.state && Wallet.state.passUntil > Date.now());
function isUnlocked() { return !PAYWALL_ON || passActive(); }
const hasUses = () => !!(Wallet.state && Wallet.state.uses > 0);
// الفحص الحالي مفتوح: بوصول زمني، أو لأنه خُصم من باقة الفحوصات
function diagUnlocked() { return isUnlocked() || !!(Wallet.state && (Wallet.state.unlocked || []).includes(diagId())); }
// هل يحق للمستخدم بدء هذه الخدمة؟ (أول خدمة مجانية، أو نفس الخدمة المجانية، أو وصول مدفوع)
function canStart(did) {
    if (isUnlocked() || !Wallet.state) return true;          // قبل تحميل المحفظة نترك الخادم يقرر
    if (Wallet.state.freeAvailable || hasUses()) return true;
    return Wallet.state.freeDid === did || (Wallet.state.unlocked || []).includes(did);
}
function openCodeTool() {
    switchTab('diagnose'); setDiagMode('code');
    setTimeout(() => { const c = $('panel-code'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
}
const OFFLINE_MSG = 'تعذر الاتصال بالخادم، تحقق من الإنترنت وأعد المحاولة.';
function blockService(msg) {
    if (Wallet.state && Wallet.state.offline && !passActive()) { alert(OFFLINE_MSG); return false; }
    openPayModal(msg || 'استخدمت خدمتك المجانية. لإكمال هذه الخدمة وكل خدمات التطبيق افتح الوصول الكامل.');
    return false;
}
function onFreeUsed(did) { if (Wallet.state && !passActive() && Wallet.state.freeAvailable) { Wallet.state.freeAvailable = false; Wallet.state.freeDid = did; } }
function passText() {
    if (!passActive()) return '';
    const d = new Date(Wallet.state.passUntil);
    return '✅ وصول كامل حتى ' + d.toLocaleString('ar', { weekday: 'long', hour: 'numeric', minute: '2-digit' });
}
// الخدمة المجانية الأولى تعرض الفحص وأسعار القطع مرة واحدة؛ بعدها صفحة الدفع
// ---------- الخدمة المجانية الواحدة بالاختيار (فحص السيارة المستعملة خارجها تماماً) ----------
const FREE_CHOICES = [
    ['diag_only', '🔍 فحص وتشخيص عطل واحد', 'اسم العطل والخطورة والشرح. عدد القطع وأسعارها وصيغة التفاوض ضمن الباقات.'],
    ['parts_prices', '💰 عدد القطع وأسعارها العادلة', 'يفتح جدول القطع وأسعارها وأجرة اليد وتدقيق الفاتورة لمرة واحدة.'],
    ['single_tool', '🛠️ أداة فحص مستقلة واحدة', 'الصوت أو الكود أو مدقق القطع لمرة واحدة.']
];
const freeChoice = () => (Wallet.state && Wallet.state.freeChoice) || store.get('sd_free_choice', null);
const freeStillOpen = () => !!(Wallet.state && Wallet.state.freeAvailable && !passActive() && !hasUses());
let _choiceP = null;
function promptFreeServiceChoiceIfNeeded() {
    if (!freeStillOpen() || freeChoice()) return Promise.resolve(freeChoice());
    if (_choiceP) return _choiceP;
    _choiceP = new Promise(resolve => {
        const wrap = el('div', 'fixed inset-0 z-[70] bg-slate-900/70 flex items-end sm:items-center justify-center p-3');
        const box = el('div', 'bg-white rounded-2xl p-4 w-full max-w-md space-y-2.5'); wrap.appendChild(box);
        box.appendChild(el('p', 'font-black text-[15px] text-slate-900', '🎁 خدمتك المجانية: اختر واحدة'));
        box.appendChild(el('p', 'text-[12px] text-slate-600', 'لك خدمة مجانية واحدة. اختر ما يناسبك الآن (لا يمكن تغييرها بعد الاختيار).'));
        FREE_CHOICES.forEach(([id, t, d]) => {
            const b = el('button', 'w-full text-right border-2 border-slate-200 hover:border-blue-600 rounded-xl p-2.5');
            b.appendChild(el('span', 'block font-black text-[13px]', t)); b.appendChild(el('span', 'block text-[11px] text-slate-500', d));
            b.onclick = async () => {
                store.set('sd_free_choice', id); if (Wallet.state) Wallet.state.freeChoice = id;
                payApi({ mode: 'set_free_choice', choice: id });
                wrap.remove(); _choiceP = null; resolve(id);
            };
            box.appendChild(b);
        });
        const no = el('button', 'w-full text-[12px] text-slate-500 py-1.5', 'لاحقاً'); no.onclick = () => { wrap.remove(); _choiceP = null; resolve(null); }; box.appendChild(no);
        document.body.appendChild(wrap);
    });
    return _choiceP;
}
// القطع والأسعار وصيغة التفاوض: تُعرض بوصول مدفوع، أو في الخدمة المجانية إن اختارها المستخدم
function costsVisible() {
    if (diagUnlocked()) return true;
    const ws = Wallet.state; if (!ws || ws.offline) return false;
    return !!(ws.freeDid && ws.freeDid === diagId() && freeChoice() === 'parts_prices');
}
// جدول الأسعار وتدقيق الفاتورة: وصول مدفوع أو رصيد، أو مرة واحدة لمن اختارها مجاناً
function canUsePrices() {
    return isUnlocked() || hasUses() || (freeChoice() === 'parts_prices' && !!Wallet.state && !Wallet.state.offline && !store.get('sd_free_prices_used', false));
}
function consumeFreePricesUse() { if (!isUnlocked() && !hasUses() && freeChoice() === 'parts_prices') store.set('sd_free_prices_used', true); }
const freeView = () => !!(lastDiag && lastDiag.title && Wallet.state && !diagUnlocked() && Wallet.state.freeDid && Wallet.state.freeDid === diagId() && freeChoice() === 'parts_prices');
let _relock = false;
function applyLock() {
    // بعد الشراء أو تغيّر الحالة: أعد رسم النتيجة لتظهر القطع والأسعار (أو تختفي) لأنها لا تُحقن في الصفحة إلا لمن يحق له
    if (!_relock && lastDiag && lastDiag.title && lastRenderedCosts !== null && lastRenderedCosts !== costsVisible()) { _relock = true; try { renderDiagnosis(lastDiag, false); } finally { _relock = false; } return; }
    const unlocked = diagUnlocked();
    const hasResult = !!(lastDiag && lastDiag.title);
    $('car-results').classList.toggle('locked', hasResult && !unlocked);
    $('car-results').classList.toggle('freeview', freeView());
    $('pw-title').textContent = freeView() ? '🎁 هذا تقريرك المجاني: الفحص وأسعار القطع' : '🔓 افتح عدد القطع وأسعارها وصيغة التفاوض';
    $('paywall').classList.toggle('hidden', !hasResult || unlocked);
    const pricesOpen = canUsePrices();
    $('tab-prices').classList.toggle('locked', !pricesOpen);
    $('prices-paywall').classList.toggle('hidden', pricesOpen);
    $('pw-btn').textContent = '🔓 ' + PRODUCTS.pack3.title + ' بـ ' + prodPrice('pack3');
    $('pw-sub').textContent = 'أو يوم كامل بـ ' + prodPrice('day') + ' • أسبوع ' + prodPrice('week');
    const pb = $('pass-banner'); if (pb) { pb.textContent = passText(); pb.classList.toggle('hidden', !passActive()); }
    const wf = $('welcome-free'); if (wf) wf.classList.toggle('hidden', !(Wallet.state && Wallet.state.freeAvailable && !passActive()));
    const al = $('accuracy-line'), acc = Wallet.state && Wallet.state.accuracy;
    if (al && acc && acc.total >= 20) { al.textContent = '✅ ' + Math.round((acc.good !== undefined ? acc.good : acc.yes) / acc.total * 100) + '% من المشتركين قيّموا دقة التشخيص بـ 90% فأعلى (من ' + acc.total + ' تقييم)'; al.classList.remove('hidden'); }
}
async function unlockCurrent() { if (diagUnlocked()) return true; openPayModal(); return false; }
function openPayModal(msg) {
    track('pay_open');
    $('pm-msg').textContent = msg || ''; $('pm-msg').classList.toggle('hidden', !msg);
    const ws = Wallet.state || {}, bal = [];
    if (ws.uses) bal.push(ws.uses + ' فحوصات'); if (ws.reports) bal.push(ws.reports + ' فحص مستعملة'); if (ws.toolUses) bal.push(ws.toolUses + ' استخدامات أدوات');
    $('pm-wallet').textContent = (passActive() ? passText() : '💼 لا يوجد وصول زمني فعّال') + (bal.length ? ' • رصيدك: ' + bal.join('، ') : '');
    $('pm-wid').textContent = walletId();
    const box = $('pm-products'); box.innerHTML = '';
    PAY_ORDER.forEach(k => {
        const p = PRODUCTS[k];
        const c = el('button', 'w-full text-right border-2 rounded-xl p-2.5 flex items-center justify-between gap-2 ' + (p.badge ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'));
        const t = el('span', 'min-w-0'); t.appendChild(el('span', 'block font-black text-[12px]', p.title + (p.badge ? ' ⭐' : ''))); t.appendChild(el('span', 'block text-[10px] text-slate-500', p.desc + (p.badge ? ' • ' + p.badge : '')));
        c.appendChild(t); c.appendChild(el('span', 'shrink-0 font-black text-[13px] font-mono', prodPrice(k)));
        c.onclick = () => buyProduct(k);
        box.appendChild(c);
    });
    const tam = (Wallet.state && Wallet.state.tam) || {};
    if (Object.keys(tam).length) {
        const sec = el('div', 'border-2 border-blue-200 bg-blue-50 rounded-xl p-2.5 space-y-2');
        sec.appendChild(el('span', 'block font-black text-[13px] text-blue-900', '💳 ادفع بمدى أو Apple Pay عبر تم pay'));
        const g = el('div', 'grid grid-cols-2 gap-1.5');
        PAY_ORDER.filter(k => tam[k]).forEach(k => { const b = el('button', 'bg-white border border-blue-200 rounded-lg p-2 text-[12px] font-bold text-blue-900', PRODUCTS[k].title + ' · ' + prodPrice(k)); b.onclick = () => tamBuy(k); g.appendChild(b); });
        sec.appendChild(g);
        sec.appendChild(el('span', 'block text-[11px] text-blue-800', 'بعد الدفع ارجع هنا وأدخل رقم العملية، ويتفعّل وصولك بعد التحقق (عادة خلال دقائق).'));
        box.appendChild(sec);
    }
    openModal('pay-modal');
}
// TamPay: لا توجد واجهة برمجية معلنة، فنطلب رقم العملية ويعتمده المالك بضغطة
function tamBuy(k) {
    const link = ((Wallet.state && Wallet.state.tam) || {})[k]; if (!link) return;
    track('checkout_click');
    store.set('sd_tam_buy', { k, at: Date.now() });
    window.open(link, '_blank');
    setTimeout(() => tamClaimForm(k), 600);
}
function tamClaimForm(k) {
    const box = $('pm-products'); box.innerHTML = '';
    const f = el('div', 'border-2 border-blue-300 bg-white rounded-xl p-3 space-y-2');
    f.appendChild(el('span', 'block font-black text-[13px]', 'أكمل التفعيل: ' + PRODUCTS[k].title));
    f.appendChild(el('span', 'block text-[12px] text-slate-600', 'بعد إتمام الدفع في تم pay، انسخ رقم العملية من رسالة التأكيد أو الإيصال والصقه هنا.'));
    const ref = el('input', 'w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono'); ref.placeholder = 'رقم العملية'; ref.dir = 'ltr'; ref.maxLength = 40; f.appendChild(ref);
    const ct = el('input', 'w-full bg-slate-50 border border-slate-200 rounded-lg p-2'); ct.placeholder = 'بريدك أو واتساب (للتواصل إن احتجنا)'; ct.maxLength = 80; f.appendChild(ct);
    const err = el('span', 'block text-[12px] text-red-700'); f.appendChild(err);
    const go = el('button', 'w-full bg-blue-700 text-white font-black py-2.5 rounded-xl', 'أرسل للتحقق');
    go.onclick = async () => {
        err.textContent = '';
        if (ref.value.trim().length < 4) { err.textContent = 'أدخل رقم العملية كما ظهر لك.'; return; }
        go.disabled = true;
        const r = await payApi({ mode: 'tamclaim', product: k, ref: ref.value.trim(), contact: ct.value.trim() });
        go.disabled = false;
        if (r.status === 200) { store.set('sd_tam_pending', { k, at: Date.now(), rc: (Wallet.state && Wallet.state.reports) || 0, pu: (Wallet.state && Wallet.state.passUntil) || 0, uc: (Wallet.state && Wallet.state.uses) || 0, tc: (Wallet.state && Wallet.state.toolUses) || 0 }); f.innerHTML = ''; f.appendChild(el('span', 'block font-black text-[14px] text-blue-900', '✅ وصلنا طلبك')); f.appendChild(el('span', 'block text-[12px] text-slate-600', 'نتحقق من الدفع ويتفعّل وصولك تلقائياً على هذا الجهاز، عادة خلال دقائق. يمكنك إغلاق النافذة.')); watchTam(); }
        else if (r.status === 409) err.textContent = 'رقم العملية هذا مُستخدم من قبل. تأكد منه أو تواصل معنا.';
        else if (r.status === 429) err.textContent = 'طلبات كثيرة اليوم. تواصل معنا عبر «أبلغ عن مشكلة».';
        else err.textContent = 'تعذر الإرسال الآن، حاول بعد قليل.';
    };
    f.appendChild(go); box.appendChild(f);
}
// ننتظر موافقة المالك ونفعّل الوصول على الجهاز دون أن يفعل المستخدم شيئاً
async function watchTam() {
    const pend = store.get('sd_tam_pending', null);
    if (!pend || Date.now() - pend.at > 48 * 3600e3) { store.del('sd_tam_pending'); return; }
    const pb = $('pass-banner'); pb.textContent = '⏳ طلب الدفع قيد التحقق، سيتفعّل وصولك تلقائياً.'; pb.classList.remove('hidden');
    for (let i = 0; i < 40; i++) {
        await walletRefresh();
        if (!passActive()) { pb.textContent = '⏳ طلب الدفع قيد التحقق، سيتفعّل وصولك تلقائياً.'; pb.classList.remove('hidden'); }
        const ws = Wallet.state || {};
        if ((ws.passUntil || 0) > (pend.pu || 0) || (ws.reports || 0) > (pend.rc || 0) || (ws.uses || 0) > (pend.uc || 0) || (ws.toolUses || 0) > (pend.tc || 0)) { store.del('sd_tam_pending'); alert('✅ تم التحقق من الدفع وتفعيل وصولك. شكراً لثقتك 🌟'); return; }
        await sleep(30000);
    }
}
function buyProduct(k) {
    const links = Object.assign({}, PAY_LINKS, (Wallet.state && Wallet.state.links) || {});
    const link = links[k];
    if (!link) { if (((Wallet.state && Wallet.state.tam) || {})[k]) return tamBuy(k); alert('الدفع الإلكتروني سيتوفر قريباً.\nإذا لديك كود تفعيل، أدخله في الأسفل.'); $('pm-code').focus(); return; }
    // رقم المحفظة يُرسل مع الطلب، فيُفعَّل الوصول تلقائياً فور الدفع
    if (/^https:\/\/(www\.)?whop\.com\//i.test(link)) {   // Whop (متى أُضيف لاحقاً): رقم المحفظة والمنتج في metadata
        const w0w = Wallet.state || {};
        store.set('sd_pay_pending', { k, at: Date.now(), pu: w0w.passUntil || 0, rc: w0w.reports || 0, uc: w0w.uses || 0, tc: w0w.toolUses || 0 }); track('checkout_click');
        location.href = link + (link.includes('?') ? '&' : '?') + 'd2c=true&metadata[wid]=' + encodeURIComponent(walletId()) + '&metadata[product]=' + encodeURIComponent(k);
        return;
    }
    const url = link.replace('{WID}', encodeURIComponent(walletId()))
        + (link.includes('{WID}') ? '' : (link.includes('?') ? '&' : '?') + 'checkout[custom][wid]=' + encodeURIComponent(walletId()));
    const w0 = Wallet.state || {};
    store.set('sd_pay_pending', { k, at: Date.now(), pu: w0.passUntil || 0, rc: w0.reports || 0, uc: w0.uses || 0, tc: w0.toolUses || 0 }); track('checkout_click');
    location.href = url;
}
// بعد الرجوع من صفحة الدفع: ننتظر إشعار البوابة ونفعّل تلقائياً
async function watchPayment() {
    const pend = store.get('sd_pay_pending', null);
    const params = new URLSearchParams(location.search);
    if (params.get('pay') === '1') setTimeout(() => openPayModal(), 600);
    if (params.get('tab') === 'code') setTimeout(openCodeTool, 400);
    if (!pend || Date.now() - pend.at > 30 * 60 * 1000) { store.del('sd_pay_pending'); return; }
    const pb = $('pass-banner');
    pb.textContent = '⏳ جاري تأكيد الدفع وتفعيل وصولك…'; pb.classList.remove('hidden');
    for (let i = 0; i < 24; i++) {
        await walletRefresh();
        const ws = Wallet.state || {};
        if ((ws.passUntil || 0) > (pend.pu || 0) || (ws.reports || 0) > (pend.rc || 0) || (ws.uses || 0) > (pend.uc || 0) || (ws.toolUses || 0) > (pend.tc || 0)) {
            store.del('sd_pay_pending');
            alert('✅ تم الدفع وتفعيل الوصول الكامل!\n' + (passActive() ? passText() : 'أُضيف الرصيد إلى حسابك') + '\nشكراً لثقتك 🌟');
            return;
        }
        await sleep(5000);
    }
    pb.textContent = '⏳ لم يصل تأكيد الدفع بعد. إذا دفعت فعلاً سيُفعّل خلال دقائق، أعد فتح التطبيق.';
}
async function redeemCode() {
    const code = $('pm-code').value.trim().toUpperCase();
    if (!/^SD-[A-Z0-9]{8}$/.test(code)) { alert('الكود غير صحيح. الشكل: SD-XXXXXXXX'); return; }
    const r = await payApi({ mode: 'redeem', code });
    if (r.status === 200 && r.json && r.json.ok) {
        Wallet.state = r.json; $('pm-code').value = '';
        applyLock(); closeModal('pay-modal');
        alert('✅ تم التفعيل: ' + PRODUCTS[r.json.product].title + '\n' + passText());
    } else alert(r.status === 409 ? 'هذا الكود مستخدم من قبل.' : r.status === 404 ? 'الكود غير موجود.' : 'تعذر التفعيل، حاول لاحقاً.');
}
function copyWid() { const t = walletId(); if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(() => alert('تم النسخ ✓')); else alert(t); }
async function restoreWallet() {
    const w = $('pm-restore').value.trim();
    if (!/^w_[a-z0-9]{12,24}$/.test(w)) { alert('رقم المحفظة غير صحيح.'); return; }
    if (!confirm('استبدال محفظة هذا الجهاز بالمحفظة المدخلة؟')) return;
    store.set('sd_wallet', w); await walletRefresh(); openPayModal(); alert('تمت الاستعادة ✓');
}
// الخدمات المدفوعة تمر من هنا
async function requirePaid(fn) { if (diagUnlocked()) return fn(); blockService('هذه الخدمة ضمن باقات الفحص.'); }

// ---------- أكواد التفعيل للمالك ----------
async function ownerCreateCodes() {
    const token = await ownerToken(); if (!token) { alert('سجّل دخول الإدارة على الموقع المنشور.'); return; }
    const product = $('oc-product').value, count = parseInt($('oc-count').value) || 1;
    const r = await payApi({ mode: 'codes_create', token, product, count, note: $('oc-note').value.trim() });
    if (r.status !== 200 || !r.json) { alert('تعذر إنشاء الأكواد.'); return; }
    $('oc-out').value = r.json.codes.join('\n'); $('oc-out').classList.remove('hidden');
    ownerPayStats();
}
async function ownerInsights() {
    const token = await ownerToken(); if (!token) return;
    const r = await payApi({ mode: 'insights', token }); if (r.status !== 200 || !r.json) return;
    const j = r.json, f = j.funnel || {}, box = $('ins-funnel'); box.innerHTML = '';
    [['زيارات', f.visit], ['بدأ فحصاً', f.diag_start], ['أكمل الفحص', f.diag_done], ['أدوات', f.tool_done], ['تقارير شراء', f.insp_report], ['فتح الدفع', f.pay_open], ['ضغط شراء', f.checkout_click], ['مشاركات', f.share], ['أخطاء AI اليوم', j.ai_fail_today]]
        .forEach(([k, v]) => { const d = el('div', 'bg-white border border-slate-200 rounded-lg py-1.5'); d.appendChild(el('b', 'block text-[14px] font-mono', String(v || 0))); d.appendChild(el('span', 'text-[10px] text-slate-500', k)); box.appendChild(d); });
    const a = j.accuracy || {}, tot = (a.yes || 0) + (a.no || 0) + (a.partial || 0);
    $('ins-acc').textContent = tot ? '✅ ' + Math.round((a.yes || 0) / tot * 100) + '% من المشتركين قيّموا الدقة بـ 90% فأعلى: ' + (a.yes || 0) + ' (90–100%)، ' + (a.partial || 0) + ' (80–90%)، ' + (a.no || 0) + ' (أقل من 80%) من ' + tot : 'لا توجد تقييمات دقة بعد (تظهر بعد يومين من أول فحوصات).';
    const vf = j.verified || {}, vt = (vf.yes || 0) + (vf.no || 0) + (vf.partial || 0);
    $('ins-acc').textContent += vt ? ' • مؤكد من فنيين: ' + (vf.yes || 0) + ' صحيح من ' + vt + ' (' + Math.round((vf.yes || 0) / vt * 100) + '%)' : ' • لا توجد حالات مؤكدة من فنيين بعد.';
    let iv = $('ins-vib'); if (!iv) { iv = el('div', 'text-[12px] space-y-1 mt-2'); iv.id = 'ins-vib'; $('ins-acc').after(iv); }
    iv.innerHTML = ''; iv.appendChild(el('b', null, '📳 حدود الاهتزاز من بيانات الفنيين'));
    const VN = { idle: 'الوقوف', drive: 'القيادة', brake: 'الفرملة' }, sugg = {};
    Object.entries(j.vib || {}).forEach(([k, x]) => {
        const line = VN[k] + ': ' + x.normal + ' سليمة، ' + x.problem + ' فيها مشكلة • الحالي ' + JSON.stringify(x.current) + (x.suggested ? ' • المقترح ' + JSON.stringify(x.suggested) + (x.overlap ? ' ⚠️ تداخل كبير: القياس لا يميز جيداً' : '') : ' • يحتاج 15 سليمة و 8 فيها مشكلة');
        iv.appendChild(el('p', null, line)); if (x.suggested) sugg[k] = x.suggested;
    });
    if (Object.keys(sugg).length) iv.appendChild(el('p', 'font-mono bg-slate-100 rounded p-1', 'VIB_LIMITS=' + JSON.stringify(sugg)));
    let ie = $('ins-err'); if (!ie) { ie = el('div', 'text-[12px] space-y-1 mt-2'); ie.id = 'ins-err'; iv.after(ie); }
    let im = $('ins-mod'); if (!im) { im = el('div', 'text-[12px] space-y-1 mt-2'); im.id = 'ins-mod'; ie.after(im); }
    im.innerHTML = ''; const md = j.models || {}, fmtM = o => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' • ') || '—';
    im.appendChild(el('b', null, '🤖 استخدام النماذج')); im.appendChild(el('p', null, 'اليوم: ' + fmtM(md.today))); im.appendChild(el('p', 'text-slate-500', 'أمس: ' + fmtM(md.yesterday)));
    if (md.routes) im.appendChild(el('p', 'text-slate-500', 'المسارات: ' + Object.entries(md.routes).map(([k, v]) => k + '→' + v).join('، ')));
    let ir = $('ins-rpk'); if (!ir) { ir = el('div', 'text-[12px] space-y-1.5 mt-2'); ir.id = 'ins-rpk'; im.after(ir);
        const hd = el('div', 'flex items-center justify-between'); hd.appendChild(el('b', null, '🌍 وكيل البيانات الإقليمي'));
        const bt = el('button', 'bg-blue-700 text-white font-bold px-3 py-1 rounded-lg text-[11px]', 'عرض الدول'); bt.onclick = ownerRpackList; hd.appendChild(bt); ir.appendChild(hd);
        ir.appendChild(el('p', 'text-slate-500', 'يجمع لكل دولة: الموديلات الشائعة، وخصائص سياراتها، وأكثر الأعطال وتكاليفها بعملتها، وأجرة اليد. تُستخدم مرجعاً في التشخيص.'));
        const ls = el('div', 'space-y-1'); ls.id = 'rpk-list'; ir.appendChild(ls); }
    let is = $('ins-iss'); if (!is) { is = el('div', 'text-[12px] space-y-1 mt-2'); is.id = 'ins-iss'; ie.after(is); }
    is.innerHTML = ''; is.appendChild(el('b', null, '📣 بلاغات المستخدمين اليوم: ' + (j.issues_today || 0)));
    (j.issues || []).slice(0, 8).forEach(x => is.appendChild(el('p', 'bg-amber-50 border border-amber-200 rounded px-2 py-1', new Date(x.at).toLocaleString('ar') + ' • ' + (x.ctx || x.page || '') + ' • ' + x.text + (x.contact ? ' • تواصل: ' + x.contact : ''))));
    ie.innerHTML = ''; ie.appendChild(el('b', null, '🐞 أخطاء الواجهة اليوم: ' + (j.client_err_today || 0) + ' • تجاوز الحد اليومي: ' + (j.quota_hits || 0)));
    (j.errors || []).slice(0, 6).forEach(x => ie.appendChild(el('p', 'bg-white border border-slate-200 rounded px-2 py-1 font-mono', '[' + (x.ver || '') + ' ' + (x.page || '') + '] ' + x.msg)));
    const m = $('ins-miss'); m.innerHTML = '';
    (j.mismatches || []).slice(0, 8).forEach(x => m.appendChild(el('p', 'bg-white border border-rose-100 rounded px-2 py-1', (x.r === 'no' ? '❌ ' : '🔶 ') + (x.title || '') + (x.car ? ' • ' + x.car : '') + (x.actual ? ' ← الفعلي: ' + x.actual : ''))));
}
async function ownerHealth() {
    const token = await ownerToken(); const out = $('ins-health'); out.classList.remove('hidden');
    if (!token) { out.textContent = 'سجّل دخول الإدارة على الموقع المنشور.'; return; }
    out.textContent = '⏳ جاري الفحص…';
    const r = await payApi({ mode: 'health', token });
    if (r.status !== 200 || !r.json) { out.textContent = '❌ تعذر الوصول للخادم.'; return; }
    const h = r.json, ok = b => b ? '✅' : '❌';
    out.textContent = ok(h.kv) + ' قاعدة التخزين (Upstash) • ' + ok(h.gemini_key) + ' مفتاح Gemini • ' + ok(h.gemini_ok) + ' اتصال Gemini' + (h.gemini_error ? ' (' + h.gemini_error + ')' : '') + ' • ' + ok(h.lemon_secret) + ' سر Lemon • روابط الدفع: ' + h.lemon_links + '/3';
}
async function ownerTamList() {
    const token = await ownerToken(); if (!token) { alert('سجّل دخول الإدارة على الموقع المنشور.'); return; }
    const r = await payApi({ mode: 'tam_list', token }); const box = $('tam-list'); box.innerHTML = '';
    if (r.status !== 200 || !r.json) { box.appendChild(el('p', 'text-red-700', 'تعذر التحميل.')); return; }
    if (!r.json.claims.length) { box.appendChild(el('p', 'text-slate-500', 'لا توجد طلبات معلّقة ✓')); return; }
    r.json.claims.forEach(c => {
        const row = el('div', 'bg-white border border-blue-200 rounded-lg p-2 space-y-1');
        row.appendChild(el('p', 'font-bold', PRODUCTS[c.product].title + ' · ' + prodPrice(c.product)));
        row.appendChild(el('p', 'font-mono', 'رقم العملية: ' + c.ref));
        row.appendChild(el('p', 'text-slate-500', new Date(c.at).toLocaleString('ar') + (c.contact ? ' • ' + c.contact : '')));
        const g = el('div', 'grid grid-cols-2 gap-1.5');
        const ok = el('button', 'bg-blue-700 text-white font-bold py-1.5 rounded-lg', '✅ اعتماد'), no = el('button', 'bg-white border border-red-300 text-red-700 font-bold py-1.5 rounded-lg', '✖ رفض');
        const decide = async approve => { if (!confirm(approve ? 'تأكدت أن الدفعة وصلت في تم pay؟' : 'رفض الطلب؟')) return; const d = await payApi({ mode: 'tam_decide', token, id: c.id, approve }); if (d.status === 200) row.remove(); else alert('تعذر الحفظ.'); ownerPayStats(); };
        ok.onclick = () => decide(true); no.onclick = () => decide(false);
        g.appendChild(ok); g.appendChild(no); row.appendChild(g); box.appendChild(row);
    });
}
async function ownerPayStats() {
    const token = await ownerToken(); if (!token) return;
    const r = await payApi({ mode: 'pay_stats', token }); if (r.status !== 200 || !r.json) return;
    const s = r.json;
    $('oc-stats').textContent = 'خدمات مجانية: ' + s['free'] + ' • محاولات بعد المجاني: ' + s['blocked']
        + ' | مدفوعات: ' + PAY_ORDER.map(t => PRODUCTS[t].title + ' ' + s['paid:' + t] + (s['refund:' + t] ? ' (مسترجع ' + s['refund:' + t] + ')' : '')).join('، ')
        + ' | أكواد مستخدمة: ' + PAY_ORDER.reduce((a, t) => a + (s['redeem:' + t] || 0), 0);
}
// =====================================================================
