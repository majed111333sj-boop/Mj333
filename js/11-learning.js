// الفاحص الذكي · طابور التعلم والصفوف التلقائية والمراجعة
// جزء من index.html، يُحمَّل بالترتيب: كل الملفات تشترك في نفس النطاق العام

// 📥 طابور التعلّم: حالات المستخدمين غير الموجودة في الجداول ← مراجعة المالك ← إضافة بضغطة
// =====================================================================
const KBQ_STOP = new Set(['و', 'في', 'من', 'على', 'الى', 'عن', 'مع', 'انا', 'وانا', 'هي', 'وهي', 'هو', 'السياره', 'سيارتي', 'سياره', 'فيها', 'فيه', 'لما', 'اذا', 'كذا', 'شوي', 'جدا', 'مره', 'يا', 'ان', 'ما', 'لي', 'عندي', 'صار', 'يصير', 'تصير', 'كل', 'بعد', 'قبل']);
function kbqTokens(t) { return normalizeAr(t).split(/\s+/).map(w => w.replace(/^و(?=..)/, '')).filter(w => w.length > 2 && !KBQ_STOP.has(w)).filter((w, i, a) => a.indexOf(w) === i); }
function kbqId(text, make) {
    const key = [normalizeAr(make || '')].concat(kbqTokens(text).sort()).join('|');
    let h = 5381; for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
    return 'q_' + h.toString(36);
}
const kbqClean = t => String(t || '').replace(/\S+@\S+/g, '').replace(/\+?\d[\d\s-]{6,}\d/g, '').trim().slice(0, 300);
async function kbQueueRecord(final, meta) {
    try {
        if (!final || !final.ai || final.fromKb || (final.kb && final.kb.remote)) return;
        if (!['desc', 'both', 'code'].includes(meta.source)) return;
        const text = kbqClean(meta.text || meta.code || ''); if (text.length < 3) return;
        const toks = kbqTokens(text);
        if (toks.length < 1 && !meta.code) return;
        const id = kbqId(text + ' ' + (meta.structured || ''), $('car-make').value);

        // حد محلي لكل جهاز يومياً (يخفف التكرار فقط). الحماية الحقيقية من الإغراق مكانها قواعد Firestore / App Check
        const today = new Date().toISOString().slice(0, 10);
        const qLog = store.get('sd_kbq_rate', { day: today, ids: [] });
        if (qLog.day !== today) { qLog.day = today; qLog.ids = []; }
        if (qLog.ids.includes(id) || qLog.ids.length >= 6) return;
        qLog.ids.push(id);
        store.set('sd_kbq_rate', qLog);

        const row = { text, structured: String(meta.structured || '').slice(0, 300), car: carLabel().slice(0, 80), aiTitle: String(final.title || '').slice(0, 120),
                      aiSev: final.sev || 'caution', aiKb: final.kb ? final.kb.id : '', aiAdvice: String(final.advice || '').slice(0, 300),
                      answers: followups.slice(0, 6).map(f => String(f.q).slice(0, 80) + ' ← ' + String(f.a).slice(0, 60)).join(' | ').slice(0, 600), status: 'new', count: 1 };
        if (PV.mode === 'firebase' && PV.db) {
            const ref = PV.db.collection('kb_queue').doc(id), FV = firebase.firestore.FieldValue;
            try { await ref.update({ count: FV.increment(1), lastAt: FV.serverTimestamp() }); }
            catch (e) { await ref.set(Object.assign(row, { lastAt: FV.serverTimestamp() })); }
        } else {
            const q = store.get('sd_kbq_demo', {}); if (q[id]) { q[id].count++; q[id].lastAt = Date.now(); } else q[id] = Object.assign(row, { lastAt: Date.now() });
            store.set('sd_kbq_demo', q);
        }
    } catch (e) { /* التعلم اختياري: لا نوقف التطبيق بسببه */ }
}
async function kbqLoad() {
    try {
        if (PV.mode === 'firebase' && PV.oApp) {
            const s = await PV.oApp.firestore().collection('kb_queue').where('status', '==', 'new').limit(100).get();
            KB.queue = s.docs.map(d => Object.assign({ id: d.id }, d.data()));
        } else KB.queue = Object.entries(store.get('sd_kbq_demo', {})).map(([id, v]) => Object.assign({ id }, v)).filter(x => x.status === 'new');
    } catch (e) { KB.queue = []; }
    KB.queue.sort((a, b) => (b.count || 0) - (a.count || 0));
    renderKbQueue();
}
async function kbqSet(id, patch) {
    if (PV.mode === 'firebase') await PV.oApp.firestore().collection('kb_queue').doc(id).update(patch);
    else { const q = store.get('sd_kbq_demo', {}); if (q[id]) Object.assign(q[id], patch); store.set('sd_kbq_demo', q); }
}
function kbqKeywords(item) {
    const n = normalizeAr(item.text); const toks = kbqTokens(item.text).filter(w => !['صوت', 'المحرك', 'محرك', 'شي', 'شيء'].includes(w)).slice(0, 6);
    const out = []; if (n.split(/\s+/).length <= 5 && n.length <= 40) out.push(n + '*4');
    return out.concat(toks).join('، ');
}
function renderKbQueue() {
    const box = $('kb-queue'); if (!box) return;
    box.innerHTML = '';
    $('kbq-count').textContent = KB.queue.length ? '(' + KB.queue.length + ')' : '';
    if (!KB.queue.length) { box.appendChild(el('p', 'text-[10px] text-amber-700', 'لا توجد حالات جديدة حالياً 👍')); return; }
    KB.queue.slice(0, 40).forEach(item => {
        const c = el('div', 'bg-white border border-amber-200 rounded-lg p-2 text-[10px] space-y-1');
        const top = el('div', 'flex justify-between gap-2');
        top.appendChild(el('span', 'font-black text-slate-900', '“' + item.text + '”'));
        top.appendChild(el('span', 'shrink-0 bg-amber-100 text-amber-900 font-black rounded px-1.5', '×' + (item.count || 1)));
        c.appendChild(top);
        c.appendChild(el('p', 'text-slate-500', item.car + (item.structured ? ' • ' + item.structured : '')));
        if (item.answers) c.appendChild(el('p', 'text-slate-500', '❓ ' + item.answers));
        c.appendChild(el('p', 'text-indigo-800 font-bold', '🤖 ' + item.aiTitle));
        const bar = el('div', 'grid grid-cols-3 gap-1');
        const mk = (label, cls, fn) => { const b = el('button', cls + ' font-bold py-1.5 rounded', label); b.onclick = fn; bar.appendChild(b); };
        mk('➕ عطل جديد', 'bg-emerald-600 text-white', () => kbqApproveNew(item));
        mk('🔗 أضف لعطل', 'bg-indigo-700 text-white', () => kbqMerge(item));
        // [إصلاح] فشل التجاهل كان يمر بصمت
        mk('❌ تجاهل', 'bg-slate-200 text-slate-700', async () => { try { await kbqSet(item.id, { status: 'ignored' }); kbqLoad(); } catch (e) { alert('تعذر التنفيذ.'); } });
        c.appendChild(bar);
        box.appendChild(c);
    });
}
function kbqApproveNew(item) {
    const base = item.aiKb ? kbById(item.aiKb) : null;
    const draft = { title: item.aiTitle, sev: item.aiSev, advice: item.aiAdvice || (base ? base.advice : ''),
                    parts: base ? base.parts.map(p => ({ n: p[0].replace(' (عند الحاجة)', ''), p: p[1], opt: isOptional(p) })) : [],
                    labor: base ? base.labor : 0, codes: base ? base.codes : [], models: [], questions: [], kw: kbTextToKw(kbqKeywords(item)) };
    KB.fromQueue = item.id;
    kbEdit(null, draft);
    $('kbm-title').textContent = '📥 اعتماد حالة مستخدم (راجع الأسعار قبل الحفظ)';
    $('kbm-note').value = 'معتمد من حالة مستخدم ×' + (item.count || 1);
}
async function kbqMerge(item) {
    // [إصلاح] مع قاعدة كبيرة نبحث بالاسم أولاً بدل عرض مئات الأعطال في نافذة واحدة (الأرقام تبقى أرقام القائمة الكاملة)
    let list = CAR_KB.map((k, i) => ({ k, i })), more = '';
    if (list.length > 30) {
        const q = prompt('اكتب كلمة من اسم العطل للبحث عنه (أو اتركه فارغاً لعرض الكل):');
        if (q === null) return;
        const nq = normalizeAr(q.trim());
        if (nq) {
            list = list.filter(x => normalizeAr(x.k.title).includes(nq));
            if (!list.length) { alert('لا يوجد عطل بهذا الاسم.'); return; }
            if (list.length > 30) { list = list.slice(0, 30); more = '\n… وغيرها، ضيّق البحث إن لم تجده.'; }
        }
    }
    const opts = list.map(x => (x.i + 1) + '. ' + x.k.title).join('\n');
    const pick = prompt('اختر رقم العطل الذي تُضاف له كلمات هذه الحالة:\n\n' + opts + more);
    const k = CAR_KB[parseInt(pick) - 1]; if (!k) return;
    const words = prompt('الكلمات التي ستُضاف إلى "' + k.title + '" (عدّلها إن أردت):', kbqKeywords(item));
    if (words === null) return;
    const kw = Object.assign({}, k.kw, kbTextToKw(words));
    // [إصلاح 4] الدمج يضيف كلمات فقط: لا يمسح مصادر العطل ولا يغيّر مصدره إن كانت محفوظة عليه
    const data = { title: k.title, sev: k.sev, kw, parts: k.parts.map(p => ({ n: p[0].replace(' (عند الحاجة)', ''), p: p[1], opt: isOptional(p) })),
                   labor: k.labor, codes: k.codes || [], models: k.models || [], advice: k.advice, questions: k.questions || [], active: true,
                   source: k.source || 'manual', sources: Array.isArray(k.sources) ? k.sources : [] };
    try { await kbWrite(k.id, data, 'edit', 'دمج من حالة مستخدم: ' + item.text.slice(0, 60)); await kbqSet(item.id, { status: 'approved', faultId: k.id }); await kbLoad(); kbqLoad(); alert('تمت الإضافة ✓'); }
    catch (e) { alert('تعذر الحفظ. تأكد من نشر قواعد Firestore الجديدة.'); }
}

// =====================================================================
// 🤖 الصفوف التلقائية: اعتماد بضغطة أو مراجعة أو حذف
// =====================================================================
// ---------- 🌍 وكيل البيانات الإقليمي (للمالك): حزمة بيانات لكل دولة ----------
async function ownerRpackList() {
    const token = await ownerToken(); if (!token) { alert('سجّل دخول الإدارة على الموقع المنشور.'); return; }
    const box = $('rpk-list'); box.innerHTML = ''; box.appendChild(el('p', 'text-slate-500', 'جاري التحميل…'));
    const r = await payApi({ mode: 'rpack_list', token }); box.innerHTML = '';
    if (r.status !== 200 || !r.json || !Array.isArray(r.json.countries)) { box.appendChild(el('p', 'text-red-700', 'تعذر التحميل.')); return; }
    const RN = { mena: 'الشرق الأوسط', eu: 'أوروبا', us: 'أمريكا الشمالية', latam: 'أمريكا اللاتينية' };
    Object.keys(RN).forEach(reg => {
        const rows = r.json.countries.filter(c => c.region === reg); if (!rows.length) return;
        box.appendChild(el('p', 'font-black mt-1', RN[reg] + ' (' + rows.filter(c => c.has).length + '/' + rows.length + ')'));
        rows.forEach(c => {
            const row = el('div', 'flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1');
            row.appendChild(el('span', null, c.name + ' · ' + c.currency + (c.has ? ' ✓ ' + (c.faults || 0) + ' عطل' : ' — لا توجد بيانات')));
            const b = el('button', 'shrink-0 bg-slate-800 text-white font-bold px-2 py-1 rounded-lg text-[11px]', c.has ? 'تحديث' : 'اجمع');
            b.onclick = async () => {
                b.disabled = true; b.textContent = '⏳ حتى دقيقة…';
                const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 70000); let ok = false, n = 0;
                try { const res = await fetch(AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify({ mode: 'rpack_build', token, cc: c.cc, lang: (window.SD && SD.defaultLang(c.cc) !== 'ar') ? SD.defaultLang(c.cc) : 'en' }) }); const j = await res.json(); ok = res.ok && j.ok; n = ok ? j.pack.faults.length : 0; } catch (e) {}
                clearTimeout(t); b.disabled = false; b.textContent = ok ? '✓ ' + n + ' عطل' : 'فشل، أعد';
            };
            row.appendChild(b); box.appendChild(row);
        });
    });
}
async function ownerToken() { return PV.mode === 'firebase' && PV.oApp && PV.oApp.auth().currentUser ? PV.oApp.auth().currentUser.getIdToken() : null; }
async function kbAutoDel(id, block) {
    const token = await ownerToken();
    if (token) await fetch(AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'kb_auto_del', id, token, block: !!block }) });
    KB.auto = KB.auto.filter(r => r.id !== id); store.set('sd_kb_auto_cache', KB.auto);
}
function kbAutoToData(r) {
    const k = kbFromRow(r.id, r);
    return { title: k.title, sev: k.sev, kw: k.kw, parts: k.parts.map(p => ({ n: p[0].replace(' (عند الحاجة)', ''), p: p[1], opt: isOptional(p) })),
             labor: k.labor, codes: k.codes, models: k.models, advice: k.advice, questions: k.questions, active: true, source: 'auto', sources: [] };
}
function renderKbAuto() {
    const box = $('kb-auto'); if (!box) return;
    box.innerHTML = '';
    $('kba-count').textContent = KB.auto.length ? '(' + KB.auto.length + ')' : '';
    if (!KB.auto.length) { box.appendChild(el('p', 'text-[10px] text-sky-700', 'لا توجد صفوف تلقائية بانتظار الاعتماد.')); return; }
    KB.auto.slice().sort((a, b) => (b.users || 0) - (a.users || 0)).forEach(r => {
        const k = kbFromRow(r.id, r);
        const c = el('div', 'bg-white border border-sky-200 rounded-lg p-2 text-[10px] space-y-1');
        const top = el('div', 'flex justify-between gap-2');
        top.appendChild(el('span', 'font-black text-slate-900', ({ safe: '🟢', caution: '🟡', stop: '🛑' }[k.sev] || '') + ' ' + k.title));
        top.appendChild(el('span', 'shrink-0 bg-sky-100 text-sky-900 font-black rounded px-1.5', '👥 ' + (r.users || 0)));
        c.appendChild(top);
        if (r.example) c.appendChild(el('p', 'text-slate-500', '“' + r.example + '” • ' + (r.car || '')));
        c.appendChild(el('p', 'text-slate-600', '🔑 ' + Object.keys(k.kw).slice(0, 8).join('، ')));
        c.appendChild(el('p', 'text-slate-600', '🔧 ' + (k.parts.length ? k.parts.map(p => p[0] + ' ' + p[1]).join('، ') + ' • يد ' + k.labor : 'لا توجد أسعار، أضفها عند المراجعة')));
        const bar = el('div', 'grid grid-cols-3 gap-1');
        const mk = (label, cls, fn) => { const b = el('button', cls + ' font-bold py-1.5 rounded', label); b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { alert('تعذر التنفيذ.'); } b.disabled = false; }; bar.appendChild(b); };
        mk('✅ اعتماد', 'bg-emerald-600 text-white', async () => { await kbWrite(r.id, kbAutoToData(r), 'create', 'اعتماد صف تلقائي (👥 ' + (r.users || 0) + ')'); await kbAutoDel(r.id, false); await kbLoad(); renderKbAuto(); });
        mk('✏️ مراجعة', 'bg-indigo-700 text-white', async () => { KB.fromAuto = r.id; kbEdit(null, Object.assign(kbAutoToData(r), { kw: k.kw })); $('kbm-title').textContent = '🤖 مراجعة صف تلقائي'; KB.editing = r.id; });
        mk('🗑️ حذف', 'bg-slate-200 text-slate-700', async () => { if (confirm('حذف هذا الصف؟ لن يُعاد إنشاؤه تلقائياً.')) { await kbAutoDel(r.id, true); kbApply(KB.rows); renderKbAuto(); } });
        c.appendChild(bar);
        box.appendChild(c);
    });
}

// =====================================================================
// 🔍 المراجعة الذكية الأسبوعية (أقوى نموذج متاح): تصحيح وحذف ودمج تلقائي مع سجل كامل
// =====================================================================
function kbReviewInfo() {
    const last = store.get('sd_kb_last_review', 0);
    const days = last ? Math.floor((Date.now() - last) / 864e5) : null;
    $('kbr-last').textContent = last ? 'آخر مراجعة: قبل ' + days + ' يوم' + (days >= 7 ? ' ⚠️ حان وقت المراجعة' : ' ✅') : 'لم تتم أي مراجعة بعد.';
    return days;
}
function kbRowForReview(k) {
    return { id: k.id, title: k.title, sev: k.sev, kw: k.kw, parts: k.parts.map(p => ({ n: p[0].replace(' (عند الحاجة)', ''), p: p[1], opt: isOptional(p) })),
             labor: k.labor, advice: k.advice, models: k.models || [], questions: k.questions || [], codes: k.codes || [] };
}
// أعطال السلامة (فرامل، حرارة، زيت، توجيه، وقود، إطارات): لا تُخفَّض خطورتها ولا تُعطَّل ولا تُدمج تلقائياً
const KB_CRITICAL = /فرامل|فرمل|بريك|حراره|حرارة|زيت|دركسون|توجيه|مقود|بنزين|وقود|اطار|إطار|كفر/;
function kbIsCritical(row) {
    const s = String(row && row.title || '') + ' ' + Object.keys(row && row.kw || {}).join(' ');
    let n = ''; try { n = normalizeAr(s); } catch (e) {}
    return KB_CRITICAL.test(s) || KB_CRITICAL.test(n);
}
const KB_SEV_RANK = { safe: 0, caution: 1, stop: 2 };
function kbSanitizeFix(base, fix) {
    const d = Object.assign({}, base);
    if (typeof fix.title === 'string' && fix.title.trim().length >= 3) d.title = fix.title.trim().slice(0, 90);
    // [إصلاح 3] السلامة: أعطال السلامة لا تُخفَّض خطورتها إطلاقاً (حتى من "توقف" إلى "تنبيه")، وغيرها لا ينزل من "توقف" إلى "آمن"
    if (['safe', 'caution', 'stop'].includes(fix.sev)) {
        const lower = KB_SEV_RANK[fix.sev] < (KB_SEV_RANK[base.sev] == null ? 1 : KB_SEV_RANK[base.sev]);
        if (!(kbIsCritical(base) && (lower || fix.sev === 'safe')) && !(fix.sev === 'safe' && base.sev === 'stop')) d.sev = fix.sev;
    }
    if (fix.kw && typeof fix.kw === 'object' && !Array.isArray(fix.kw)) {
        const kw = {}; Object.entries(fix.kw).slice(0, 40).forEach(([k, w]) => { k = String(k).trim().slice(0, 40); if (k) kw[k] = Math.min(6, Math.max(1, parseInt(w) || 2)); });
        if (Object.keys(kw).length) d.kw = kw;
    }
    if (Array.isArray(fix.parts)) {
        const parts = fix.parts.slice(0, 10).map(p => ({ n: String(p && p.n || '').trim().slice(0, 60), p: Math.max(0, Math.round(Number(p && p.p) || 0)), opt: !!(p && p.opt) })).filter(p => p.n && p.p > 0 && p.p < 100000);
        if (parts.length) d.parts = parts;
    }
    // [إصلاح 1] null أو نص فارغ أو قيمة غير رقمية لا تُصفّر أجرة اليد (Number(null) === 0)
    if (fix.labor != null && fix.labor !== '' && typeof fix.labor !== 'boolean') {
        const lb = Number(fix.labor);
        if (Number.isFinite(lb) && lb >= 0 && lb < 50000) d.labor = Math.round(lb);
    }
    if (typeof fix.advice === 'string' && fix.advice.trim().length > 10) d.advice = fix.advice.trim().slice(0, 500);
    if (Array.isArray(fix.questions)) d.questions = fix.questions.slice(0, 4).filter(q => q && q.q).map(q => q.type === 'choice'
        ? { q: String(q.q).slice(0, 140), type: 'choice', options: (q.options || []).slice(0, 5).map(o => ({ l: String(o && o.l || o).slice(0, 40), kw: String(o && o.kw || '').slice(0, 40) })) }
        : { q: String(q.q).slice(0, 140), type: 'yesno', kw: String(q.kw || '').slice(0, 40) });
    return d;
}
async function kbReviewRun(auto) {
    const token = await ownerToken();
    if (!token) { alert('المراجعة تعمل بعد تسجيل دخول الإدارة على الموقع المنشور.'); return; }
    const rows = CAR_KB.filter(k => !k.auto).map(kbRowForReview);
    if (!auto && !confirm('ستُراجع ' + rows.length + ' عطلاً بالذكاء الاصطناعي، ويُصحَّح الخطأ ويُعطَّل المضلل تلقائياً مع تسجيل كل تغيير. متابعة؟')) return;
    const btn = $('kbr-btn'), pr = $('kbr-progress'); btn.disabled = true; pr.classList.remove('hidden');
    const all = CAR_KB.map(k => ({ id: k.id, title: k.title }));
    const stats = { keep: 0, fix: 0, delete: 0, merge: 0, failed: 0, manual: 0 };
    // [إصلاح 2] الذاكرة (CAR_KB) لا تُحدَّث إلا بعد انتهاء المراجعة، فنحتفظ بآخر ما كُتب لكل عطل في هذه الجولة
    // حتى لا يكتب دمجٌ لاحق بيانات قديمة فوق تصحيح أو دمج سابق، ولا يعيد تفعيل عطل عُطِّل للتو
    const live = new Map(), off = new Set(), manual = [];
    const clone = o => JSON.parse(JSON.stringify(o));
    const rowNow = id => { if (live.has(id)) return clone(live.get(id)); const k = kbById(id); if (!k) return null; const d = kbRowForReview(k); delete d.id; return d; };
    const put = async (id, d, note) => { await kbWrite(id, d, 'review', note); live.set(id, clone(d)); if (d.active === false) off.add(id); };
    let okBatches = 0;
    for (let i = 0; i < rows.length; i += 8) {
        const batch = rows.slice(i, i + 8);
        pr.textContent = '⏳ جاري المراجعة… ' + Math.min(i + 8, rows.length) + ' من ' + rows.length;
        let j = null;
        try {
            const res = await fetch(AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'review', token: await ownerToken(), rows: batch, all, country: C().name }) });
            if (res.ok) j = await res.json();
        } catch (e) {}
        if (!j || !Array.isArray(j.reviews)) { stats.failed += batch.length; continue; }
        okBatches++;
        for (const rv of j.reviews) {
            const base = batch.find(b => b.id === rv.id); if (!base) continue;
            const data = Object.assign(rowNow(base.id) || clone(base), { active: true, source: 'review', sources: [] });
            delete data.id;
            const note = (rv.reason || '') + ' [' + (j.model || 'AI') + ']';
            try {
                if (rv.action === 'fix' && rv.fix) { await put(base.id, kbSanitizeFix(data, rv.fix), '✏️ ' + note); stats.fix++; }
                // [إصلاح 3] تعطيل أو دمج عطل سلامة لا يُنفَّذ تلقائياً: يُعرض على المالك ليقرر
                else if ((rv.action === 'delete' || rv.action === 'merge') && kbIsCritical(data)) {
                    manual.push(base.title + (rv.action === 'delete' ? ' (اقتراح: تعطيل)' : ' (اقتراح: دمج)')); stats.manual++;
                }
                else if (rv.action === 'delete') { await put(base.id, Object.assign(data, { active: false }), '🚫 ' + note); stats.delete++; }
                else if (rv.action === 'merge' && rv.merge_into && rv.merge_into !== base.id && !off.has(rv.merge_into) && rowNow(rv.merge_into)) {
                    const tid = rv.merge_into, t = rowNow(tid);
                    await put(tid, Object.assign(t, { kw: Object.assign({}, data.kw, t.kw), active: true, source: 'review', sources: [] }), '🔗 دمج "' + base.title + '" ' + note);
                    await put(base.id, Object.assign(data, { active: false }), '🔗 مدموج في ' + tid);
                    stats.merge++;
                } else stats.keep++;
            } catch (e) { stats.failed++; }
        }
    }
    // [إصلاح] لا نسجّل تاريخ المراجعة إذا فشلت كل الدفعات
    if (okBatches) store.set('sd_kb_last_review', Date.now());
    pr.textContent = !okBatches && rows.length
        ? '❌ تعذرت المراجعة (لم يرد الخادم على أي دفعة). أعد المحاولة لاحقاً.'
        : '✅ انتهت المراجعة: ' + stats.fix + ' تصحيح، ' + stats.delete + ' تعطيل، ' + stats.merge + ' دمج، ' + stats.keep + ' سليم' + (stats.failed ? '، ' + stats.failed + ' تعذر' : '') + '. كل التغييرات في "آخر التحديثات" ويمكن التراجع عنها بالتعديل.'
          + (manual.length ? ' ⚠️ ' + manual.length + ' عطل سلامة لم يُغيَّر وينتظر قرارك: ' + manual.slice(0, 8).join('، ') + (manual.length > 8 ? '…' : '') : '');
    btn.disabled = false; kbReviewInfo();
    await kbLoad();
}

// ---------- لوحة الإدارة ----------
function openOwnerModal() {
    openModal('owner-modal');
    if (PV.mode === 'demo') { $('owner-hint').textContent = 'الوضع التجريبي: كلمة المرور ' + DEMO_OWNER_PASSWORD; $('owner-hint').classList.remove('hidden'); $('owner-email').classList.add('hidden'); }
    if (PV.isOwner) { $('owner-login').classList.add('hidden'); $('owner-panel').classList.remove('hidden'); renderOwnerPanel(); }
}
async function ownerLogin() {
    const pass = $('owner-pass').value;
    if (PV.mode === 'demo') { if (pass !== DEMO_OWNER_PASSWORD) { alert('كلمة المرور غير صحيحة.'); return; } PV.isOwner = true; }
    else {
        const email = $('owner-email').value.trim();
        if (!OWNER_EMAIL || email.toLowerCase() !== OWNER_EMAIL.toLowerCase()) { alert('هذا البريد ليس بريد الإدارة.'); return; }
        try {
            if (!PV.oApp) PV.oApp = firebase.initializeApp(FIREBASE_CONFIG, 'owner');
            await PV.oApp.auth().signInWithEmailAndPassword(email, pass);
            PV.isOwner = true;
            if (PV.unsubOwner) PV.unsubOwner();
            PV.unsubOwner = PV.oApp.firestore().collection('providers').onSnapshot(s => { PV.ownerAll = s.docs.map(d => Object.assign({ id: d.id }, d.data())); renderOwnerPanel(); },
                () => alert('لا تملك صلاحية الإدارة. تأكد من قواعد Firestore.'));
        } catch (e) { alert('فشل الدخول: تأكد من البريد وكلمة المرور.'); return; }
    }
    $('owner-pass').value = '';
    $('owner-login').classList.add('hidden'); $('owner-panel').classList.remove('hidden');
    renderOwnerPanel();
}
function ownerLogout() {
    PV.isOwner = false;
    PV._kbqLoadedAt = 0;
    if (PV.unsubOwner) { PV.unsubOwner(); PV.unsubOwner = null; }
    if (PV.oApp) PV.oApp.auth().signOut().catch(() => {});
    $('owner-login').classList.remove('hidden'); $('owner-panel').classList.add('hidden');
}
function renderOwnerPanel() {
    const all = PV.ownerAll;
    const pend = all.filter(p => p.status === 'pending'), appr = all.filter(p => p.status === 'approved');
    const st = $('owner-stats'); st.innerHTML = '';
    [['بانتظار', pend.length], ['ورش', appr.filter(p => p.type === 'workshop').length], ['وكلاء', appr.filter(p => p.type === 'agent').length]].forEach(([l, v]) => {
        const s = el('div', 'bg-slate-100 rounded-lg py-1.5'); s.appendChild(el('span', 'block font-black', String(v))); s.appendChild(el('span', 'text-[10px] text-slate-500', l)); st.appendChild(s);
    });
    const row = (p, buttons) => {
        const c = el('div', 'bg-slate-50 border border-slate-200 rounded-lg p-2 text-[11px] space-y-1');
        c.appendChild(el('span', 'font-black block', (p.type === 'agent' ? '🧩 ' : '🔧 ') + p.name + (p.featured ? ' ⭐' : '')));
        const ph = el('span', 'font-mono text-slate-600 block', p.phone); ph.dir = 'ltr'; ph.style.textAlign = 'right'; c.appendChild(ph);
        c.appendChild(el('span', 'text-slate-500 block', [COUNTRIES[p.country] ? COUNTRIES[p.country].name : p.country, p.city, p.type === 'agent' ? KIND[p.kind] : '', p.spec].filter(Boolean).join(' • ')));
        c.appendChild(el('span', 'text-[10px] text-slate-400 block', 'تاريخ الطلب: ' + fmtTime(p.createdAt)));
        const bar = el('div', buttons.length === 1 ? 'grid grid-cols-1 gap-1.5' : 'grid grid-cols-2 gap-1.5');
        buttons.forEach(([label, cls, fn]) => {
            const b = el('button', cls + ' font-bold py-1.5 rounded-lg', label);
            b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { alert('تعذر التنفيذ.'); b.disabled = false; } };
            bar.appendChild(b);
        });
        c.appendChild(bar);
        return c;
    };
    const pb = $('owner-pending'), ab = $('owner-approved'); pb.innerHTML = ''; ab.innerHTML = '';
    if (!pend.length) pb.appendChild(el('p', 'text-[11px] text-slate-400', 'لا توجد طلبات جديدة.'));
    pend.forEach(p => pb.appendChild(row(p, [
        ['✅ موافقة', 'bg-emerald-600 text-white', () => Store.ownerUpdate(p.id, { status: 'approved' })],
        ['❌ رفض', 'bg-rose-600 text-white', () => Store.ownerUpdate(p.id, { status: 'rejected' })]
    ])));
    if (!appr.length) ab.appendChild(el('p', 'text-[11px] text-slate-400', 'لا يوجد معتمدون بعد.'));
    renderKbAdmin(); renderKbAuto(); ownerPayStats(); ownerInsights();
    // [إصلاح] اللوحة تُعاد رسمها مع كل تغيير في الورش: لا نعيد قراءة الطابور من Firestore أكثر من مرة كل 30 ثانية
    // (أزرار الطابور نفسها تستدعي kbqLoad مباشرة فتبقى القائمة محدثة بعد كل إجراء)
    if (!PV._kbqLoadedAt || Date.now() - PV._kbqLoadedAt > 30000) { PV._kbqLoadedAt = Date.now(); kbqLoad(); }
    if (!PV._reviewAsked && PV.isOwner && PV.mode === 'firebase') { PV._reviewAsked = true; const d = kbReviewInfo(); if (d === null || d >= 7) setTimeout(() => { if (confirm('🔍 حان وقت المراجعة الأسبوعية لقاعدة المعرفة. تشغيلها الآن؟')) kbReviewRun(true); }, 800); }
    else kbReviewInfo();
    appr.forEach(p => ab.appendChild(row(p, [
        [p.featured ? 'إلغاء التمييز' : '⭐ تمييز', 'bg-amber-400 text-slate-950', () => Store.ownerUpdate(p.id, { featured: !p.featured })],
        ['🗑️ إزالة', 'bg-slate-800 text-white', async () => { if (confirm('إزالة ' + p.name + '؟')) await Store.ownerRemove(p.id); }]
    ])));
}

// =====================================================================
