// الفاحص الذكي · قاعدة المعرفة ولوحة تحريرها
// جزء من index.html، يُحمَّل بالترتيب: كل الملفات تشترك في نفس النطاق العام

// 📚 قاعدة المعرفة: جدول الأعطال (kb_faults) + جدول التحديثات (kb_updates)
// المالك يضيف ويعدّل من لوحة الإدارة، والتطبيق يدمجها مع الأعطال المدمجة
// =====================================================================
const BUILTIN_KB = JSON.parse(JSON.stringify(CAR_KB));
const KB = { rows: [], updates: [], editing: null, draftSources: [], queue: [], fromQueue: null, auto: [], fromAuto: null };

// تحويل صف الجدول إلى صيغة الأعطال الداخلية
function kbPriceFor(name) { const m = matchPart(name); const p = m ? PRICE_PARTS.find(x => x.name === m) : null; return p ? p.sar : 0; }
function kbFromRow(id, d) {
    if (d.auto) {
        const priced = (d.parts || []).map(p => ({ n: p.n, p: Number(p.p) || kbPriceFor(p.n), opt: p.opt })).filter(p => p.p > 0);
        d = Object.assign({}, d, { parts: priced, labor: Number(d.labor) || (priced.length ? 100 : 0) });
    }
    return {
        auto: !!d.auto, noPrice: !!d.auto && !(d.parts || []).length,
        id, remote: true, title: String(d.title || '').slice(0, 90), sev: SEV[d.sev] ? d.sev : 'caution',
        codes: Array.isArray(d.codes) ? d.codes.map(c => String(c).toUpperCase()) : [],
        kw: (d.kw && typeof d.kw === 'object') ? d.kw : {},
        parts: Array.isArray(d.parts) ? d.parts.map(p => [String(p.n || '') + (p.opt && !String(p.n).includes('عند الحاجة') ? ' (عند الحاجة)' : ''), Number(p.p) || 0]) : [],
        labor: Number(d.labor) || 0, advice: String(d.advice || ''),
        models: Array.isArray(d.models) ? d.models : [], questions: Array.isArray(d.questions) ? d.questions : [],
        active: d.active !== false
    };
}
function kbApply(rows) {
    CAR_KB.length = 0;
    BUILTIN_KB.forEach(k => CAR_KB.push(JSON.parse(JSON.stringify(k))));
    rows.forEach(r => {
        const k = kbFromRow(r.id, r);
        const i = CAR_KB.findIndex(x => x.id === k.id);
        if (!k.active) { if (i >= 0) CAR_KB.splice(i, 1); return; }
        if (i >= 0) CAR_KB[i] = k; else CAR_KB.push(k);
    });
    KB.rows = rows;
    // الصفوف التلقائية: لا تتجاوز صفاً معتمداً أو مدمجاً بنفس الاسم
    (KB.auto || []).forEach(r => {
        if (CAR_KB.some(x => x.id === r.id || normalizeAr(x.title) === normalizeAr(r.title || ''))) return;
        CAR_KB.push(kbFromRow(r.id, r));
    });
}
async function kbLoadAuto() {
    if (location.protocol === 'file:') return;
    try {
        const res = await fetch(AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'kb_auto' }) });
        if (!res.ok) return;
        const j = await res.json();
        KB.auto = Array.isArray(j.rows) ? j.rows : [];
        store.set('sd_kb_auto_cache', KB.auto);
        kbApply(KB.rows);
        if (PV.isOwner) renderKbAuto();
    } catch (e) {}
}
function kbApplyCache() { KB.auto = store.get('sd_kb_auto_cache', []); const c = store.get('sd_kb_cache', null); kbApply(c && Array.isArray(c.rows) ? c.rows : []); }
async function kbLoad() {
    try {
        let rows;
        if (PV.mode === 'firebase') {
            const s = await PV.db.collection('kb_faults').get();
            rows = s.docs.map(d => Object.assign({ id: d.id }, d.data()));
        } else rows = store.get('sd_kb_demo', []);
        kbApply(rows);
        store.set('sd_kb_cache', { t: Date.now(), rows: rows.map(r => { const o = Object.assign({}, r); delete o.updatedAt; return o; }) });
        if (PV.isOwner) renderKbAdmin();
    } catch (e) { console.warn('kb load', e); }
}

// ---------- قراءة وكتابة الحقول النصية في نموذج التحرير ----------
function kbKwToText(kw) { return Object.entries(kw || {}).map(([k, w]) => w && w !== 2 ? k + '*' + w : k).join('، '); }
function kbTextToKw(t) {
    const kw = {};
    String(t || '').split(/[,،\n]/).map(x => x.trim()).filter(Boolean).slice(0, 40).forEach(x => {
        const m = x.match(/^(.*?)\*(\d+)$/); const k = (m ? m[1] : x).trim().slice(0, 40); const w = m ? Math.min(6, Math.max(1, parseInt(m[2]))) : 2;
        if (k) kw[k] = w;
    });
    return kw;
}
function kbPartsToText(parts) { return (parts || []).map(p => p[0] + ' = ' + p[1]).join('\n'); }
function kbTextToParts(t) {
    return String(t || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 10).map(l => {
        const m = l.split('='); const n = (m[0] || '').trim().slice(0, 60); const p = parseFloat(String(m[1] || '').replace(/[^\d.]/g, '')) || 0;
        return { n: n.replace(' (عند الحاجة)', '').replace('(عند الحاجة)', '').trim(), p, opt: n.includes('عند الحاجة') };
    }).filter(x => x.n);
}
function kbQToText(qs) {
    return (qs || []).map(q => q.type === 'yesno' ? q.q + ' | نعم/لا' + (q.kw ? ' | ' + q.kw : '')
        : q.q + ' | ' + (q.options || []).map(o => o.kw ? o.l + '=' + o.kw : o.l).join('، ')).join('\n');
}
function kbTextToQ(t) {
    return String(t || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4).map(l => {
        const parts = l.split('|').map(x => x.trim());
        const q = (parts[0] || '').slice(0, 140); if (!q) return null;
        if (!parts[1] || /^نعم\s*\/\s*لا$/.test(parts[1])) return { q, type: 'yesno', kw: (parts[2] || '').slice(0, 40) };
        const options = parts[1].split(/[,،]/).map(x => x.trim()).filter(Boolean).slice(0, 5).map(o => { const [l2, kw] = o.split('='); return { l: l2.trim().slice(0, 40), kw: (kw || '').trim().slice(0, 40) }; });
        return options.length >= 2 ? { q, type: 'choice', options } : { q, type: 'yesno', kw: '' };
    }).filter(Boolean);
}

// ---------- لوحة الإدارة: القائمة والتحديثات ----------
function renderKbAdmin() {
    const box = $('kb-list'); if (!box) return;
    const q = normalizeAr($('kb-search').value || '');
    const remoteIds = new Set(KB.rows.map(r => r.id));
    const disabled = KB.rows.filter(r => r.active === false);
    $('kb-count').textContent = '(' + CAR_KB.length + ' عطل مفعّل • ' + KB.rows.length + ' في الجدول)';
    box.innerHTML = '';
    const items = CAR_KB.map(k => ({ k, off: false })).concat(disabled.map(r => ({ k: kbFromRow(r.id, r), off: true })))
        .filter(({ k }) => !q || normalizeAr(k.title + ' ' + Object.keys(k.kw).join(' ')).includes(q));
    items.forEach(({ k, off }) => {
        const row = el('button', 'w-full text-right bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-2' + (off ? ' opacity-50' : ''));
        row.appendChild(el('span', 'font-bold truncate', ({ safe: '🟢', caution: '🟡', stop: '🛑' }[k.sev] || '') + ' ' + k.title));
        row.appendChild(el('span', 'shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded ' + (off ? 'bg-slate-200 text-slate-600' : remoteIds.has(k.id) ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-600'), off ? 'معطّل' : remoteIds.has(k.id) ? '📚 الجدول' : 'مدمج'));
        row.onclick = () => kbEdit(k.id);
        box.appendChild(row);
    });
    if (!items.length) box.appendChild(el('p', 'text-[10px] text-slate-400', 'لا توجد نتائج.'));
    kbLoadUpdates();
}
async function kbLoadUpdates() {
    const box = $('kb-updates'); if (!box) return;
    try {
        if (PV.mode === 'firebase' && PV.oApp) {
            const s = await PV.oApp.firestore().collection('kb_updates').orderBy('at', 'desc').limit(15).get();
            KB.updates = s.docs.map(d => d.data());
        } else KB.updates = store.get('sd_kb_updates_demo', []).slice(-15).reverse();
    } catch (e) { KB.updates = []; }
    box.innerHTML = '';
    if (!KB.updates.length) { box.appendChild(el('p', 'text-slate-400', 'لا توجد تحديثات بعد.')); return; }
    const A = { create: '➕ إضافة', edit: '✏️ تعديل', disable: '🚫 تعطيل', ai: '🤖 من البحث', import: '📥 استعادة', review: '🔍 مراجعة' };
    KB.updates.forEach(u => box.appendChild(el('p', 'bg-slate-50 rounded px-2 py-1', (A[u.action] || u.action) + ' • ' + (u.title || '') + (u.note ? ' — ' + u.note : '') + ' • ' + fmtTime(u.at))));
}

// ---------- نموذج التحرير ----------
function kbEdit(id, draft) {
    if (!draft) { KB.fromQueue = null; KB.fromAuto = null; }
    const k = draft ? null : (id ? (kbById(id) || (KB.rows.find(r => r.id === id) ? kbFromRow(id, KB.rows.find(r => r.id === id)) : null)) : null);
    const src = draft || k || { title: '', sev: 'caution', kw: {}, parts: [], labor: 0, advice: '', codes: [], models: [], questions: [] };
    KB.editing = draft ? null : (k ? k.id : null);
    KB.draftSources = draft ? (draft.sources || []) : [];
    $('kbm-title').textContent = draft ? '🤖 مسودة من البحث (راجعها قبل الحفظ)' : (k ? '✏️ تعديل عطل' : '➕ عطل جديد');
    $('kbm-name').value = src.title || '';
    $('kbm-sev').value = SEV[src.sev] ? src.sev : 'caution';
    $('kbm-kw').value = kbKwToText(src.kw);
    $('kbm-parts').value = draft ? (src.parts || []).map(p => p.n + (p.opt ? ' (عند الحاجة)' : '') + ' = ' + (p.p || 0)).join('\n') : kbPartsToText(src.parts);
    $('kbm-labor').value = src.labor || '';
    $('kbm-codes').value = (src.codes || []).join(', ');
    $('kbm-models').value = (src.models || []).join('، ');
    $('kbm-advice').value = src.advice || '';
    $('kbm-q').value = kbQToText(src.questions);
    $('kbm-active').checked = src.active !== false;
    $('kbm-note').value = '';
    const srcBox = $('kbm-src');
    if (KB.draftSources.length) {
        srcBox.innerHTML = ''; srcBox.appendChild(el('b', null, '⚠️ معلومات من الإنترنت قد لا تكون دقيقة. تأكد من الأسعار والكلمات قبل الحفظ. المصادر:'));
        KB.draftSources.slice(0, 5).forEach(s => { const a = el('a', 'block underline truncate', s.title || s.uri); a.href = s.uri; a.target = '_blank'; a.rel = 'noopener'; srcBox.appendChild(a); });
        srcBox.classList.remove('hidden');
    } else srcBox.classList.add('hidden');
    $('kbm-del').classList.toggle('hidden', !k);
    openModal('kb-modal');
}
function kbSlug(t) { return 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
async function kbWrite(id, data, action, note) {
    const log = { faultId: id, title: data.title || id, action, note: note || '', by: OWNER_EMAIL || 'owner' };
    if (PV.mode === 'firebase') {
        const db = PV.oApp.firestore();
        await db.collection('kb_faults').doc(id).set(Object.assign({}, data, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }));
        await db.collection('kb_updates').add(Object.assign(log, { at: firebase.firestore.FieldValue.serverTimestamp() }));
    } else {
        const rows = store.get('sd_kb_demo', []).filter(r => r.id !== id); rows.push(Object.assign({ id }, data)); store.set('sd_kb_demo', rows);
        const ups = store.get('sd_kb_updates_demo', []); ups.push(Object.assign(log, { at: Date.now() })); store.set('sd_kb_updates_demo', ups.slice(-100));
    }
}
async function kbSave() {
    const title = $('kbm-name').value.trim();
    const kw = kbTextToKw($('kbm-kw').value), parts = kbTextToParts($('kbm-parts').value);
    if (title.length < 3) { alert('اكتب اسم العطل.'); return; }
    if (!Object.keys(kw).length) { alert('أضف كلمة واحدة على الأقل يصف بها الناس العطل.'); return; }
    const data = {
        title: title.slice(0, 90), sev: $('kbm-sev').value, kw, parts, labor: Math.max(0, parseFloat($('kbm-labor').value) || 0),
        codes: $('kbm-codes').value.split(/[,،\s]+/).map(c => c.trim().toUpperCase()).filter(c => /^[PBCU]\d{4}$/.test(c)).slice(0, 10),
        models: $('kbm-models').value.split(/[,،]/).map(x => x.trim()).filter(Boolean).slice(0, 15),
        advice: $('kbm-advice').value.trim().slice(0, 500), questions: kbTextToQ($('kbm-q').value),
        active: $('kbm-active').checked, source: KB.draftSources.length ? 'ai' : 'manual',
        sources: KB.draftSources.slice(0, 5).map(s => ({ uri: String(s.uri || '').slice(0, 300), title: String(s.title || '').slice(0, 120) }))
    };
    const id = KB.editing || kbSlug(title);
    const action = KB.draftSources.length ? 'ai' : (KB.editing ? 'edit' : 'create');
    const b = $('kbm-save'); b.disabled = true;
    try {
        await kbWrite(id, data, action, $('kbm-note').value.trim()); closeModal('kb-modal');
        if (KB.fromQueue) { await kbqSet(KB.fromQueue, { status: 'approved', faultId: id }).catch(() => {}); KB.fromQueue = null; kbqLoad(); }
        if (KB.fromAuto) { await kbAutoDel(KB.fromAuto, false).catch(() => {}); KB.fromAuto = null; renderKbAuto(); }
        await kbLoad(); alert('تم الحفظ ✓ وسيستخدمه التشخيص فوراً.');
    }
    catch (e) { console.error(e); alert('تعذر الحفظ. تأكد من نشر قواعد Firestore الجديدة لقاعدة المعرفة.'); }
    b.disabled = false;
}
async function kbDelete() {
    if (!KB.editing) return;
    const k = kbById(KB.editing); if (!k) return;
    if (!confirm('تعطيل "' + k.title + '" من التشخيص؟ يمكنك إعادة تفعيله لاحقاً.')) return;
    const data = { title: k.title, sev: k.sev, kw: k.kw, parts: k.parts.map(p => ({ n: p[0].replace(' (عند الحاجة)', ''), p: p[1], opt: isOptional(p) })),
                   labor: k.labor, codes: k.codes, models: k.models || [], advice: k.advice, questions: k.questions || [], active: false, source: 'manual', sources: [] };
    try { await kbWrite(k.id, data, 'disable', $('kbm-note').value.trim()); closeModal('kb-modal'); await kbLoad(); }
    catch (e) { alert('تعذر التعطيل.'); }
}

// ---------- البحث بالذكاء الاصطناعي ----------
async function kbResearch() {
    const topic = $('kb-research-q').value.trim();
    if (topic.length < 4) { alert('اكتب موضوع البحث، مثل: تكتكة محرك هيونداي أكسنت.'); return; }
    if (PV.mode !== 'firebase' || !PV.oApp || !PV.oApp.auth().currentUser) { alert('البحث يحتاج تسجيل دخول الإدارة على الموقع المنشور.'); return; }
    const b = $('kb-research-btn'); b.disabled = true; b.textContent = '⏳';
    try {
        const token = await PV.oApp.auth().currentUser.getIdToken();
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
        const res = await fetch(AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
            body: JSON.stringify({ mode: 'research', topic, token, existing: CAR_KB.map(k => k.title).slice(0, 60) }) });
        clearTimeout(t);
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.draft) { alert(res.status === 403 ? 'غير مصرح: سجّل دخول الإدارة من جديد.' : 'تعذر البحث الآن، حاول بعد قليل.'); }
        else { const d = j.draft; d.kw = {}; (d.keywords || []).forEach(x => { if (x && x.k) d.kw[x.k] = x.w || 2; }); d.sources = j.sources || []; kbEdit(null, d); }
    } catch (e) { alert('تعذر البحث الآن، حاول بعد قليل.'); }
    b.disabled = false; b.textContent = '🔎 ابحث';
}

// ---------- التصدير والاستعادة ----------
function kbDownload(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function kbExportCsv() {
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = ['المعرف', 'العطل', 'الخطورة', 'الكلمات', 'الأكواد', 'القطع والأسعار', 'أجرة اليد', 'النصيحة', 'الموديلات', 'الأسئلة', 'المصدر', 'مفعّل'];
    const sevName = { safe: 'آمن', caution: 'أصلحه قريباً', stop: 'توقف فوراً' };
    const remoteIds = new Set(KB.rows.map(r => r.id));
    const rows = CAR_KB.map(k => [k.id, k.title, sevName[k.sev], kbKwToText(k.kw), (k.codes || []).join(' '), kbPartsToText(k.parts).replace(/\n/g, ' ؛ '), k.labor, k.advice, (k.models || []).join('، '), kbQToText(k.questions).replace(/\n/g, ' ؛ '), remoteIds.has(k.id) ? 'الجدول' : 'مدمج', 'نعم']);
    const csv = '\ufeff' + [head].concat(rows).map(r => r.map(esc).join(',')).join('\r\n');
    kbDownload('قاعدة-المعرفة-' + new Date().toISOString().slice(0, 10) + '.csv', csv, 'text/csv;charset=utf-8');
    const ups = '\ufeff' + [['التاريخ', 'العملية', 'العطل', 'الملاحظة']].concat(KB.updates.map(u => [fmtTime(u.at), u.action, u.title, u.note])).map(r => r.map(esc).join(',')).join('\r\n');
    setTimeout(() => kbDownload('تحديثات-المعرفة-' + new Date().toISOString().slice(0, 10) + '.csv', ups, 'text/csv;charset=utf-8'), 600);
}
function kbExportJson() {
    const rows = KB.rows.map(r => { const o = Object.assign({}, r); delete o.updatedAt; return o; });
    kbDownload('نسخة-المعرفة-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ app: 'smart-diag', v: 1, at: new Date().toISOString(), kb_faults: rows }, null, 1), 'application/json');
}
async function kbImportJson(input) {
    const f = input.files[0]; input.value = ''; if (!f) return;
    try {
        const j = JSON.parse(await f.text());
        const rows = Array.isArray(j.kb_faults) ? j.kb_faults : [];
        if (!rows.length) { alert('الملف لا يحتوي أعطالاً.'); return; }
        if (!confirm('استعادة ' + rows.length + ' عطل من النسخة؟ ستُستبدل الأعطال التي لها نفس المعرف.')) return;
        for (const r of rows.slice(0, 300)) { const id = String(r.id || kbSlug(r.title)); const d = Object.assign({}, r); delete d.id; await kbWrite(id, d, 'import', f.name); }
        await kbLoad(); alert('تمت الاستعادة ✓');
    } catch (e) { alert('ملف غير صالح.'); }
}

// =====================================================================
