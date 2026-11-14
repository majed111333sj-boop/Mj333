// الفاحص الذكي · الأسعار والفواتير
// جزء من index.html، يُحمَّل بالترتيب: كل الملفات تشترك في نفس النطاق العام

// 💰 الأسعار (مرجعية + مساهمات المستخدمين في نفس الدولة والمدينة)
// =====================================================================
const PRICE_PARTS = (() => {
    const m = new Map();
    CAR_KB.forEach(k => k.parts.forEach(([n, s]) => { const name = n.replace(' (عند الحاجة)', ''); if (!m.has(name)) m.set(name, s); }));
    [['تغيير زيت وفلتر', 150], ['فحص كمبيوتر', 100], ['كمبروسر مكيف', 1300], ['رديتر', 450], ['طرمبة ماء', 380], ['مساعدات أمامية (زوج)', 900], ['هوبات أمامية (زوج)', 500], ['دينمو', 900], ['سلف', 650], ['كفر واحد', 400]].forEach(([n, s]) => { if (!m.has(n)) m.set(n, s); });
    return [...m.entries()].map(([name, sar]) => ({ name, sar }));
})();
const PART_ALIASES = { 'كويل': 'كويل إشعال', 'بواجي': 'طقم بواجي (شمعات)', 'بوجي': 'طقم بواجي (شمعات)', 'شمعات': 'طقم بواجي (شمعات)', 'فحمات': 'طقم فحمات أمامي', 'فريون': 'تعبئة فريون + فحص تسريب', 'كمبروسر': 'كمبروسر مكيف', 'بطاريه': 'بطارية', 'ثرموستات': 'ثرموستات', 'سير': 'سير محرك', 'زيت': 'تغيير زيت وفلتر', 'رديتر': 'رديتر', 'دينمو': 'دينمو', 'سلف': 'سلف', 'اكسجين': 'حساس أكسجين', 'مساعدات': 'مساعدات أمامية (زوج)', 'هوبات': 'هوبات أمامية (زوج)' };
function matchPart(name) {
    const n = normalizeAr(name);
    const exact = PRICE_PARTS.find(p => normalizeAr(p.name) === n);
    if (exact) return exact.name;
    const k = Object.keys(PART_ALIASES).find(a => n.includes(normalizeAr(a)));
    return k ? PART_ALIASES[k] : null;
}

let cityPrices = [];   // مساهمات المستخدمين للمدينة الحالية [{part, price}]
// المساهمات خارج 20%–500% من السعر المرجعي تُرفض وتُستبعد (حماية من التسميم والأخطاء)
const PRICE_MIN_RATIO = 0.2, PRICE_MAX_RATIO = 5;
function partStats(partName) {
    const p = PRICE_PARTS.find(x => x.name === partName);
    const ref = p ? localPrice(p.sar) : 0;
    let user = cityPrices
        .filter(x => x.part === partName && x.price > 0 && (!ref || (x.price >= ref * PRICE_MIN_RATIO && x.price <= ref * PRICE_MAX_RATIO)))
        .map(x => x.price).sort((a, b) => a - b);
    const validCount = user.length;
    // المتوسط المقلّم (15% من كل طرف) عند 4 مساهمات فأكثر
    if (user.length >= 4) { const t = Math.max(1, Math.floor(user.length * 0.15)); user = user.slice(t, user.length - t); }
    let avg = ref;
    if (user.length) {
        // المرجع يعادل 10 فواتير حتى لا يغيّر سعر واحد المتوسط بشكل كبير
        const W = Math.max(2, 10 - user.length);
        avg = (ref * W + user.reduce((a, b) => a + b, 0)) / (W + user.length);
    }
    return { ref, avg, min: Math.min(avg * 0.8, user[0] || Infinity), max: avg * 1.6, count: validCount };
}
function fillPartSelects() {
    ['price-part', 'audit-part', 'contrib-part'].forEach(id => {
        const s = $(id); const cur = s.value; s.innerHTML = '';
        PRICE_PARTS.forEach(p => s.appendChild(el('option', null, p.name)));
        if (cur) s.value = cur;
    });
}
async function refreshPrices() {
    try { cityPrices = await Prices.list(LOC ? LOC.country : 'SA', cityName()); } catch (e) { cityPrices = []; }
    renderPriceLookup();
}
function renderPriceLookup() {
    applyLock();
    const st = partStats($('price-part').value);
    $('pl-min').textContent = fmtLocal(st.min);
    $('pl-avg').textContent = fmtLocal(st.avg);
    $('pl-max').textContent = fmtLocal(st.max);
    $('pl-source').textContent = st.count ? `محسوب من السعر المرجعي + ${st.count} فاتورة من مستخدمين في ${cityName()}` : `سعر مرجعي تقديري لـ ${cityName()} — ساهم بسعرك لتحسينه`;
}
function runAudit() {
    if (!canUsePrices()) return blockService('تدقيق الفاتورة ضمن باقات الفحص.');
    const part = $('audit-part').value;
    const price = parseFloat($('audit-part-price').value), labor = parseFloat($('audit-labor-price').value) || 0;
    const box = $('audit-result');
    const show = (cls, txt) => { box.className = 'rounded-xl p-3 text-[11px] leading-relaxed border whitespace-pre-line ' + cls; box.textContent = txt; box.classList.remove('hidden'); };
    if (!(price > 0)) { show('bg-amber-50 border-amber-200 text-amber-800', 'اكتب سعر القطعة في الفاتورة أولاً.'); return; }
    const st = partStats(part);
    if (!(st.avg > 0)) { show('bg-amber-50 border-amber-200 text-amber-800', 'لا يوجد سعر مرجعي لهذه القطعة بعد. جرّب قطعة أخرى.'); return; }
    consumeFreePricesUse();
    const diff = Math.round((price - st.avg) / st.avg * 100);
    let v, cls;
    if (price <= st.avg * 1.15) { v = '✅ السعر عادل'; cls = 'bg-emerald-50 border-emerald-200 text-emerald-800'; }
    else if (price <= st.max) { v = '⚠️ السعر أعلى من المتوسط'; cls = 'bg-amber-50 border-amber-200 text-amber-800'; }
    else { v = '🛑 السعر مبالغ فيه'; cls = 'bg-rose-50 border-rose-200 text-rose-800'; }
    let t = `${v}\n${part} في ${cityName()}: العادل نحو ${fmtLocal(st.avg)} (المعتاد من ${fmtLocal(st.min)} إلى ${fmtLocal(st.max)}).\nفاتورتك ${diff >= 0 ? 'أعلى' : 'أقل'} من العادل بنسبة ${Math.abs(diff)}%.`;
    const fairLabor = localPrice(150);
    if (labor > 0) t += `\nأجرة اليد: ${labor > fairLabor * 1.5 ? 'مرتفعة' : 'ضمن المعتاد'} (المعتاد نحو ${fmtLocal(fairLabor)}).`;
    show(cls, t);
}
async function contributePrice() {
    const part = $('contrib-part').value, price = parseFloat($('contrib-price').value);
    if (!(price > 0) || price > 1e6) { alert('اكتب المبلغ الذي دفعته.'); return; }
    const st = partStats(part);
    if (st.ref > 0 && (price > st.ref * PRICE_MAX_RATIO || price < st.ref * PRICE_MIN_RATIO)) { alert('المبلغ المدخل (' + fmtLocal(price) + ') خارج النطاق المنطقي لهذه القطعة. اكتب سعر القطعة فقط بعملة ' + C().cur + '.'); return; }
    // نفس القطعة والمدينة من نفس الجهاز: مرة كل 24 ساعة
    const log = store.get('sd_price_contrib_log', {}), key = (LOC ? LOC.country : 'SA') + '|' + cityName() + '|' + part;
    if (log[key] && Date.now() - log[key] < 24 * 3600e3) { alert('أضفت سعراً لهذه القطعة اليوم بالفعل. شكراً لمساهمتك!'); return; }
    try {
        await Prices.add({ country: LOC ? LOC.country : 'SA', city: cityName(), part, price });
        log[key] = Date.now(); store.set('sd_price_contrib_log', log);
        $('contrib-price').value = '';
        await refreshPrices();
        alert('شكراً! تمت إضافة سعرك ✓');
    } catch (e) { alert('تعذر الحفظ، حاول مرة أخرى.'); }
}

// --- قراءة الفاتورة بالصورة (تحتاج الذكاء الاصطناعي) ---
function compressImage(file, maxSide = 1400, quality = 0.8) {
    return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => {
            const s = Math.min(1, maxSide / Math.max(img.width, img.height));
            const cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            URL.revokeObjectURL(img.src);
            res(cv.toDataURL('image/jpeg', quality).split(',')[1]);
        };
        img.onerror = rej;
        img.src = URL.createObjectURL(file);
    });
}
async function readInvoicePhoto(input) {
    if (!canUsePrices()) { input.value = ''; return blockService('قراءة الفاتورة ضمن باقات الفحص.'); }
    const file = input.files && input.files[0]; input.value = '';
    if (!file) return;
    const st = $('invoice-status'), list = $('invoice-items');
    st.classList.remove('hidden'); st.textContent = '⏳ جاري قراءة الفاتورة…'; list.classList.add('hidden');
    if (location.protocol === 'file:' || !aiUsable()) { st.textContent = 'قراءة الفاتورة تحتاج تفعيل الذكاء الاصطناعي (راجع README). أدخل الأرقام يدوياً.'; return; }
    try {
        const image = await compressImage(file);
        const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 38000);
        const res = await fetch(AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
            body: JSON.stringify({ mode: 'invoice', wid: walletId(), did: 'v' + Date.now().toString(36), image, currency: C().code }) });
        clearTimeout(to);
        if (res.status === 503 || res.status === 404) { aiOff(); st.textContent = 'قراءة الفاتورة غير مفعّلة حالياً. أدخل الأرقام يدوياً.'; return; }
        if (!res.ok) throw new Error();
        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items.slice(0, 15) : [];
        if (!items.length) { st.textContent = 'لم أستطع قراءة بنود واضحة. جرّب صورة أوضح.'; return; }
        st.textContent = '✅ تمت القراءة. اضغط على أي بند لتدقيقه:';
        list.innerHTML = ''; list.classList.remove('hidden');
        items.forEach(it => {
            const name = String(it.name || '').slice(0, 60), price = Number(it.price) || 0;
            const b = el('button', 'w-full flex justify-between bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px]');
            b.appendChild(el('span', 'truncate', name));
            b.appendChild(el('span', 'font-mono font-bold', fmtLocal(price)));
            b.onclick = () => {
                const m = matchPart(name);
                if (m) $('audit-part').value = m;
                $('audit-part-price').value = price;
                if (data.labor) $('audit-labor-price').value = Number(data.labor) || '';
                if (!m) alert('لم أتعرف على هذه القطعة تلقائياً. اختر نوعها من القائمة ثم اضغط "قارن".'); else runAudit();
            };
            list.appendChild(b);
        });
    } catch (e) { st.textContent = 'تعذر قراءة الفاتورة. أدخل الأرقام يدوياً.'; }
}

// =====================================================================
