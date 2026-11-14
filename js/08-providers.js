// الفاحص الذكي · الورش والوكلاء والإرسال
// جزء من index.html، يُحمَّل بالترتيب: كل الملفات تشترك في نفس النطاق العام

// 🔧🧩 الورش والوكلاء: تسجيل → موافقة الإدارة → طلبات المستخدمين → عرض سعر → قبول → تقييم
// =====================================================================
const PV = { mode: 'demo', uid: null, db: null, pApp: null, oApp: null, isOwner: false,
             list: [], reviews: [], myReqs: [], me: null, meReqs: [], meReviews: [], ownerAll: [],
             unsubCity: [], unsubUser: null, unsubMe: [], unsubOwner: null };
let readyResolve; const PVReady = new Promise(r => readyResolve = r);

const TYPE = {
    workshop: { label: 'ورشة', send: '📤 أرسل التقرير', sendTitle: 'إرسال التقرير', listId: 'ws-list', countId: 'ws-count', section: 'workshops-section' },
    agent:    { label: 'وكيل/قطع غيار', send: '📤 اطلب تسعير', sendTitle: 'طلب تسعير القطع', listId: 'ag-list', countId: 'ag-count', section: 'agents-section' }
};
const KIND = { parts: 'محل قطع غيار', dealer: 'وكيل معتمد' };
const AVAIL = ['متوفر أصلي', 'متوفر تجاري', 'متوفر أصلي وتجاري', 'غير متوفر حالياً — يُطلب خلال أيام'];

function localDigits(country, phone) {
    let d = cleanPhone(phone).replace('+', '');
    const dial = COUNTRIES[country] ? COUNTRIES[country].dial : '';
    if (d.startsWith('00')) d = d.slice(2);
    if (dial && d.startsWith(dial)) d = d.slice(dial.length);
    return d.replace(/^0+/, '');
}
function loginKey(country, phone) { return country.toLowerCase() + '-' + localDigits(country, phone); }
function loginEmail(country, phone) { return loginKey(country, phone) + '@providers.smartdiag.app'; }
function waLink(country, phone, text) {
    const dial = COUNTRIES[country] ? COUNTRIES[country].dial : '';
    return 'https://wa.me/' + dial + localDigits(country, phone) + (text ? '?text=' + encodeURIComponent(text) : '');
}

// ---------- الوضع التجريبي ----------
const Demo = {
    get: k => store.get('pv_demo_' + k, []),
    set: (k, v) => store.set('pv_demo_' + k, v),
    id: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    refresh() {
        const all = Demo.get('providers'), reqs = Demo.get('requests'), revs = Demo.get('reviews');
        const country = LOC ? LOC.country : 'SA', city = cityName();
        PV.ownerAll = all;
        PV.list = all.filter(p => p.status === 'approved' && p.country === country && p.city === city);
        PV.reviews = revs.filter(r => r.country === country && r.city === city);
        PV.myReqs = reqs.filter(r => r.userUid === PV.uid);
        const sess = store.get('pv_demo_session', null);
        PV.me = sess ? all.find(p => p.id === sess) || null : null;
        PV.meReqs = PV.me ? reqs.filter(r => r.providerOwnerUid === PV.me.ownerUid) : [];
        PV.meReviews = PV.me ? revs.filter(r => r.providerId === PV.me.id) : [];
        renderProviders();
    }
};

// ---------- عمليات البيانات ----------
const Store = {
    async apply(d, pass) {
        const doc = { type: d.type, name: d.name, phone: d.phone, country: d.country, city: d.city, spec: d.spec, kind: d.kind || '',
                      status: 'pending', featured: false, createdAt: Date.now() };
        if (PV.mode === 'demo') {
            const all = Demo.get('providers');
            if (all.some(p => loginKey(p.country, p.phone) === loginKey(d.country, d.phone))) throw new Error('exists');
            const id = Demo.id();
            all.push(Object.assign({ id, ownerUid: 'pv_' + id, passHash: await hashPass(pass) }, doc));
            Demo.set('providers', all); store.set('pv_demo_session', id); Demo.refresh(); return;
        }
        let cred;
        try { cred = await PV.pApp.auth().createUserWithEmailAndPassword(loginEmail(d.country, d.phone), pass); }
        catch (e) { if (e.code === 'auth/email-already-in-use') throw new Error('exists'); throw e; }
        await PV.pApp.firestore().collection('providers').add(Object.assign({ ownerUid: cred.user.uid }, doc));
    },
    async login(country, phone, pass) {
        if (PV.mode === 'demo') {
            const h = await hashPass(pass);
            const p = Demo.get('providers').find(x => loginKey(x.country, x.phone) === loginKey(country, phone) && x.passHash === h);
            if (!p) throw new Error('bad');
            store.set('pv_demo_session', p.id); Demo.refresh(); return;
        }
        try { await PV.pApp.auth().signInWithEmailAndPassword(loginEmail(country, phone), pass); } catch (e) { throw new Error('bad'); }
    },
    async logout() {
        if (PV.mode === 'demo') { store.del('pv_demo_session'); Demo.refresh(); return; }
        await PV.pApp.auth().signOut();
    },
    async ownerUpdate(id, fields) {
        if (PV.mode === 'demo') { const a = Demo.get('providers'); const p = a.find(x => x.id === id); if (p) Object.assign(p, fields); Demo.set('providers', a); Demo.refresh(); return; }
        await PV.oApp.firestore().collection('providers').doc(id).update(fields);
    },
    async ownerRemove(id) {
        if (PV.mode === 'demo') { Demo.set('providers', Demo.get('providers').filter(x => x.id !== id)); Demo.refresh(); return; }
        await PV.oApp.firestore().collection('providers').doc(id).delete();
    },
    async sendRequest(prov, d) {
        await PVReady;
        const doc = Object.assign({ providerId: prov.id, providerOwnerUid: prov.ownerUid, providerType: prov.type, providerName: prov.name,
                                    userUid: PV.uid, country: prov.country, city: prov.city, cur: C().cur,
                                    status: 'sent', reply: '', quote: 0, availability: '', repliedAt: 0, statusAt: 0, createdAt: Date.now() }, d);
        if (PV.mode === 'demo') { const a = Demo.get('requests'); a.push(Object.assign({ id: Demo.id() }, doc)); Demo.set('requests', a); Demo.refresh(); return; }
        await PV.db.collection('requests').add(doc);
    },
    async reply(reqId, f) {
        const fields = { reply: f.reply, quote: f.quote, availability: f.availability, repliedAt: Date.now(), status: 'replied' };
        if (PV.mode === 'demo') { const a = Demo.get('requests'); const r = a.find(x => x.id === reqId); if (r) Object.assign(r, fields); Demo.set('requests', a); Demo.refresh(); return; }
        await PV.pApp.firestore().collection('requests').doc(reqId).update(fields);
    },
    async setUserStatus(reqId, status) {
        const fields = { status, statusAt: Date.now() };
        if (PV.mode === 'demo') { const a = Demo.get('requests'); const r = a.find(x => x.id === reqId); if (r) Object.assign(r, fields); Demo.set('requests', a); Demo.refresh(); return; }
        await PV.db.collection('requests').doc(reqId).update(fields);
    },
    async addReview(req, stars, text) {
        const doc = { providerId: req.providerId, reqId: req.id, country: req.country, city: req.city, stars, text, userUid: PV.uid, createdAt: Date.now() };
        if (PV.mode === 'demo') { const a = Demo.get('reviews').filter(x => x.id !== req.id); a.push(Object.assign({ id: req.id }, doc)); Demo.set('reviews', a); Demo.refresh(); return; }
        await PV.db.collection('reviews').doc(req.id).set(doc);
    }
};
const Prices = {
    async list(country, city) {
        if (PV.mode === 'demo' || !PV.db) return Demo.get('prices').filter(p => p.country === country && p.city === city);
        const s = await PV.db.collection('prices').where('country', '==', country).where('city', '==', city).limit(1000).get();
        return s.docs.map(d => d.data());
    },
    async add(d) {
        await PVReady;
        const doc = Object.assign({ uid: PV.uid, createdAt: Date.now() }, d);
        if (PV.mode === 'demo') { const a = Demo.get('prices'); a.push(doc); Demo.set('prices', a.slice(-2000)); return; }
        await PV.db.collection('prices').add(doc);
    }
};
async function hashPass(p) {
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sd:' + p));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { let h = 0; for (const c of 'sd:' + p) h = (h * 31 + c.charCodeAt(0)) | 0; return 'h' + h; }
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

// ---------- التهيئة ----------
const Providers = {
    async init() {
        if (!FIREBASE_CONFIG) {
            PV.mode = 'demo';
            $('demo-banner').classList.remove('hidden');
            PV.uid = store.get('pv_demo_uid', null) || Demo.id(); store.set('pv_demo_uid', PV.uid);
            readyResolve(); kbLoad();
            Demo.refresh();
            return;
        }
        PV.mode = 'firebase';
        try {
            const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
            await loadScript(base + 'firebase-app-compat.js');
            await loadScript(base + 'firebase-auth-compat.js');
            await loadScript(base + 'firebase-firestore-compat.js');
            firebase.initializeApp(FIREBASE_CONFIG);
            PV.db = firebase.firestore();
            kbLoad();
            PV.pApp = firebase.initializeApp(FIREBASE_CONFIG, 'provider');
            Providers.subscribeCity();
            refreshPrices();
            firebase.auth().onAuthStateChanged(u => {
                if (!u) { firebase.auth().signInAnonymously().catch(showProvidersError); return; }
                PV.uid = u.uid; readyResolve();
                if (PV.unsubUser) PV.unsubUser();
                PV.unsubUser = PV.db.collection('requests').where('userUid', '==', u.uid)
                    .onSnapshot(s => { PV.myReqs = s.docs.map(d => Object.assign({ id: d.id }, d.data())); renderProviders(); }, e => console.error(e));
            });
            PV.pApp.auth().onAuthStateChanged(u => {
                PV.unsubMe.forEach(f => f()); PV.unsubMe = [];
                PV.me = null; PV.meReqs = []; PV.meReviews = [];
                if (u && !u.isAnonymous) {
                    const db2 = PV.pApp.firestore(); let reviewsFor = null;
                    PV.unsubMe.push(db2.collection('providers').where('ownerUid', '==', u.uid).onSnapshot(s => {
                        PV.me = s.docs.length ? Object.assign({ id: s.docs[0].id }, s.docs[0].data()) : null;
                        if (PV.me && reviewsFor !== PV.me.id) {
                            reviewsFor = PV.me.id;
                            PV.unsubMe.push(db2.collection('reviews').where('providerId', '==', PV.me.id).onSnapshot(r => { PV.meReviews = r.docs.map(d => d.data()); renderProviders(); }));
                        }
                        renderProviders();
                    }, e => console.error(e)));
                    PV.unsubMe.push(db2.collection('requests').where('providerOwnerUid', '==', u.uid)
                        .onSnapshot(s => { PV.meReqs = s.docs.map(d => Object.assign({ id: d.id }, d.data())); renderProviders(); }, e => console.error(e)));
                }
                renderProviders();
            });
        } catch (e) { showProvidersError(e); readyResolve(); }
    },
    subscribeCity() {
        PV.unsubCity.forEach(f => f()); PV.unsubCity = [];
        const country = LOC ? LOC.country : 'SA', city = cityName();
        PV.list = []; PV.reviews = [];
        PV.unsubCity.push(PV.db.collection('providers').where('status', '==', 'approved').where('country', '==', country).where('city', '==', city)
            .onSnapshot(s => { PV.list = s.docs.map(d => Object.assign({ id: d.id }, d.data())); renderProviders(); }, showProvidersError));
        PV.unsubCity.push(PV.db.collection('reviews').where('country', '==', country).where('city', '==', city)
            .onSnapshot(s => { PV.reviews = s.docs.map(d => d.data()); renderProviders(); }, e => console.error(e)));
    },
    onLocation() { if (PV.mode === 'demo') Demo.refresh(); else if (PV.db) Providers.subscribeCity(); },
    renderMyRequests() { renderMyRequestsList(); }
};
function showProvidersError(e) {
    console.error(e);
    ['ws-list', 'ag-list'].forEach(id => { const b = $(id); b.innerHTML = ''; b.appendChild(el('p', 'text-[11px] text-rose-300 text-center py-2', 'تعذر الاتصال. تحقق من الإنترنت.')); });
}

// ---------- العرض ----------
function ratingOf(pid) {
    const r = PV.reviews.filter(x => x.providerId === pid);
    if (!r.length) return null;
    return { avg: r.reduce((a, b) => a + (b.stars || 0), 0) / r.length, count: r.length };
}
function renderProviders() {
    ['workshop', 'agent'].forEach(type => {
        const T = TYPE[type], box = $(T.listId);
        box.innerHTML = '';
        const items = PV.list.filter(p => p.type === type).map(p => Object.assign({ _r: ratingOf(p.id) }, p))
            .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || ((b._r ? b._r.avg : 0) - (a._r ? a._r.avg : 0)) || (a.createdAt - b.createdAt));
        $(T.countId).textContent = items.length;
        $(T.section).classList.toggle('hidden', !items.length);
        if (!items.length) box.appendChild(el('p', 'text-[11px] opacity-60 text-center py-3', type === 'workshop' ? 'لا توجد ورش معتمدة في مدينتك بعد.' : 'لا يوجد وكلاء أو محلات معتمدة في مدينتك بعد.'));
        items.forEach(p => box.appendChild(providerCard(p)));
    });
    // لا نعرض قسماً فارغاً: نكتفي بدعوة مختصرة للتسجيل حتى تتوفر جهات معتمدة
    const jc = $('join-compact'); if (jc) jc.classList.toggle('hidden', PV.list.some(p => p.type === 'workshop') && PV.list.some(p => p.type === 'agent'));
    renderProviderPanel();
    renderMyRequestsList();
    if (PV.isOwner) renderOwnerPanel();
}
function providerCard(p) {
    const agent = p.type === 'agent';
    const card = el('div', 'rounded-xl p-3 space-y-2 border ' + (agent ? 'bg-blue-900/40 border-blue-800' : 'bg-slate-900 border-slate-800') + (p.featured ? ' ring-1 ring-amber-400' : ''));
    const head = el('div', 'flex justify-between items-start gap-2');
    const info = el('div', 'min-w-0');
    const nameRow = el('div', 'flex items-center gap-1.5 flex-wrap');
    nameRow.appendChild(el('span', 'font-extrabold text-xs ' + (agent ? 'text-blue-200' : 'text-amber-300'), p.name));
    if (p.featured) nameRow.appendChild(el('span', 'text-[9px] bg-amber-400 text-slate-950 font-black px-1.5 rounded', '⭐ مميز'));
    if (agent && p.kind) nameRow.appendChild(el('span', 'text-[9px] bg-white/10 px-1.5 rounded', KIND[p.kind] || ''));
    info.appendChild(nameRow);
    if (p.spec) info.appendChild(el('span', 'text-[10px] opacity-70 block', p.spec));
    const ph = el('span', 'text-[11px] font-mono block mt-0.5', '📱 ' + p.phone); ph.dir = 'ltr'; ph.style.textAlign = 'right';
    info.appendChild(ph);
    head.appendChild(info);
    head.appendChild(el('span', 'text-[10px] font-bold shrink-0 ' + (p._r ? 'text-amber-300' : 'opacity-60'), p._r ? '★ ' + p._r.avg.toFixed(1) + ' (' + p._r.count + ')' : 'جديد'));
    card.appendChild(head);

    const actions = el('div', 'grid grid-cols-2 gap-1.5');
    const sendBtn = el('button', 'bg-blue-600 text-white font-bold py-2 rounded-lg text-[11px]', TYPE[p.type].send);
    sendBtn.onclick = () => openSend(p);
    const contactBtn = el('button', 'bg-white/10 font-bold py-2 rounded-lg text-[11px]', '📞 تواصل');
    actions.append(sendBtn, contactBtn);
    card.appendChild(actions);

    const contact = el('div', 'hidden bg-black/30 rounded-lg p-2 space-y-1.5');
    const num = el('div', 'font-mono font-black text-base text-center', p.phone); num.dir = 'ltr';
    const row = el('div', 'grid grid-cols-2 gap-1.5');
    const tel = el('a', 'bg-blue-500 text-slate-950 font-black py-1.5 rounded-lg text-[11px] text-center', '📞 اتصال'); tel.href = 'tel:' + cleanPhone(p.phone);
    const wa = el('a', 'bg-green-600 text-white font-black py-1.5 rounded-lg text-[11px] text-center', '💬 واتساب');
    wa.href = waLink(p.country, p.phone, 'السلام عليكم، تواصلت معكم عن طريق تطبيق الفاحص الذكي.'); wa.target = '_blank'; wa.rel = 'noopener';
    row.append(tel, wa); contact.append(num, row);
    contactBtn.onclick = () => contact.classList.toggle('hidden');
    card.appendChild(contact);

    const reply = el('div', 'bg-black/30 rounded-lg p-2 text-[11px] leading-relaxed');
    reply.appendChild(el('span', 'font-bold opacity-80 block mb-0.5', '💬 الرد:'));
    const mine = PV.myReqs.filter(r => r.providerId === p.id).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!mine) reply.appendChild(el('span', 'opacity-50', agent ? 'لم تطلب تسعيراً من هنا بعد.' : 'لم ترسل تقريراً لهذه الورشة بعد.'));
    else reply.appendChild(requestStatusBlock(mine, true));
    card.appendChild(reply);
    return card;
}
function quoteText(r) { return r.quote > 0 ? Number(r.quote).toLocaleString('en') + ' ' + (r.cur || '') : ''; }
function requestStatusBlock(r, dark) {
    const box = el('div', 'space-y-1');
    const muted = dark ? 'opacity-60' : 'text-slate-400';
    if (r.status === 'sent') { box.appendChild(el('span', dark ? 'text-amber-200' : 'text-amber-700', '⏳ أُرسل ' + fmtTime(r.createdAt) + ' — بانتظار الرد')); return box; }
    if (r.reply) box.appendChild(el('p', 'whitespace-pre-wrap', r.reply));
    if (r.quote > 0) box.appendChild(el('p', 'font-black ' + (dark ? 'text-amber-300' : 'text-blue-800'), '💰 عرض السعر: ' + quoteText(r)));
    if (r.availability) box.appendChild(el('p', 'font-bold', '📦 ' + r.availability));
    box.appendChild(el('span', 'text-[10px] ' + muted, fmtTime(r.repliedAt)));
    if (r.status === 'replied') {
        const b = el('button', 'w-full mt-1 bg-amber-500 text-slate-950 font-black py-1.5 rounded-lg text-[11px]', '✅ قبول العرض');
        b.onclick = async () => { b.disabled = true; try { await Store.setUserStatus(r.id, 'accepted'); alert('تم قبول العرض ✓ تواصل معهم لتحديد الموعد.'); } catch (e) { alert('تعذر التنفيذ.'); b.disabled = false; } };
        box.appendChild(b);
    } else if (r.status === 'accepted') {
        box.appendChild(el('p', 'font-bold ' + (dark ? 'text-blue-300' : 'text-blue-700'), '👍 قبلت العرض'));
        const b = el('button', 'w-full mt-1 bg-blue-500 text-slate-950 font-black py-1.5 rounded-lg text-[11px]', r.providerType === 'agent' ? '🏁 استلمت القطع — قيّم' : '🏁 تم الإصلاح — قيّم');
        b.onclick = () => openRate(r);
        box.appendChild(b);
    } else if (r.status === 'done') {
        box.appendChild(el('p', 'font-bold ' + (dark ? 'text-blue-300' : 'text-blue-700'), '✔️ مكتمل — شكراً لتقييمك'));
    }
    return box;
}
function renderMyRequestsList() {
    const box = $('my-requests'); if (!box) return;
    box.innerHTML = '';
    const reqs = PV.myReqs.slice().sort((a, b) => b.createdAt - a.createdAt);
    if (!reqs.length) box.appendChild(el('p', 'text-[11px] text-slate-400', 'لم ترسل أي طلب بعد. افحص سيارتك ثم أرسل التقرير لورشة أو اطلب تسعير القطع من وكيل.'));
    reqs.forEach(r => {
        const c = el('div', 'bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px] space-y-1');
        c.appendChild(el('div', 'font-black', (r.providerType === 'agent' ? '🧩 ' : '🔧 ') + (r.providerName || '') + ' • ' + (r.city || '')));
        c.appendChild(el('div', 'text-[10px] text-slate-500 truncate', ((r.report || '').split('\n').find(l => l.startsWith('🔧')) || '').replace('🔧 ', '')));
        c.appendChild(requestStatusBlock(r, false));
        box.appendChild(c);
    });
    const seen = new Set(store.get('sd_seen', []));
    const unseen = reqs.filter(r => r.status === 'replied' && !seen.has(r.id + r.repliedAt));
    const onMine = !$('tab-mine').classList.contains('hidden');
    if (onMine) { store.set('sd_seen', reqs.map(r => r.id + r.repliedAt).slice(0, 200)); $('mine-dot').classList.add('hidden'); }
    else $('mine-dot').classList.toggle('hidden', !unseen.length);
}

// ---------- لوحة الورشة/الوكيل ----------
function renderProviderPanel() {
    const box = $('provider-panel'); box.innerHTML = '';
    const p = PV.me;
    $('provider-login-btn').classList.toggle('hidden', !!p);
    if (!p) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const agent = p.type === 'agent';
    const hdr = el('div', 'flex justify-between items-center gap-2');
    hdr.appendChild(el('span', 'font-black text-sm', (agent ? '🧩 لوحة ' : '🔧 لوحة ') + p.name));
    const out = el('button', 'text-[10px] opacity-60 underline shrink-0', 'تسجيل خروج');
    out.onclick = () => Store.logout().catch(() => {});
    hdr.appendChild(out); box.appendChild(hdr);
    box.appendChild(el('p', 'text-[10px] opacity-60', COUNTRIES[p.country].name + ' • ' + p.city + ' • ' + p.phone));
    if (p.status === 'pending') { box.appendChild(el('p', 'text-[11px] text-amber-300', '⏳ طلبك قيد المراجعة من إدارة التطبيق.')); return; }
    if (p.status === 'rejected') { box.appendChild(el('p', 'text-[11px] text-rose-300', '❌ لم تتم الموافقة على طلبك. تواصل مع الإدارة.')); return; }
    const revs = PV.meReviews;
    const avg = revs.length ? (revs.reduce((a, b) => a + b.stars, 0) / revs.length).toFixed(1) : '—';
    const reqs = PV.meReqs.slice().sort((a, b) => b.createdAt - a.createdAt);
    const stats = el('div', 'grid grid-cols-3 gap-2 text-center text-[10px]');
    [['الطلبات', reqs.length], ['مقبولة', reqs.filter(r => r.status === 'accepted' || r.status === 'done').length], ['التقييم', avg + (revs.length ? ' ★' : '')]].forEach(([l, v]) => {
        const s = el('div', 'bg-black/30 rounded-lg py-1.5'); s.appendChild(el('span', 'block font-black text-sm', String(v))); s.appendChild(el('span', 'opacity-60', l)); stats.appendChild(s);
    });
    box.appendChild(stats);
    box.appendChild(el('p', 'text-[11px] font-bold opacity-80 pt-1', '📥 الطلبات الواردة'));
    if (!reqs.length) box.appendChild(el('p', 'text-[11px] opacity-50', 'لا توجد طلبات بعد. ستظهر هنا فور وصولها.'));
    reqs.forEach(r => {
        const c = el('div', 'bg-black/30 border border-white/10 rounded-xl p-2.5 space-y-1.5 text-[11px]');
        const top = el('div', 'flex justify-between gap-2');
        top.appendChild(el('span', 'font-bold text-amber-300', '👤 ' + (r.userName || 'مستخدم')));
        top.appendChild(el('span', 'text-[10px] opacity-50', fmtTime(r.createdAt)));
        c.appendChild(top);
        if (r.userPhone) {
            const row = el('div', 'flex gap-3 text-[11px]');
            const a = el('a', 'font-mono text-blue-300 underline', '📞 ' + r.userPhone); a.href = 'tel:' + cleanPhone(r.userPhone); a.dir = 'ltr';
            const w = el('a', 'text-green-400 underline', '💬 واتساب'); w.href = waLink(r.country, r.userPhone, 'مرحباً ' + (r.userName || '') + '، بخصوص طلبك في تطبيق الفاحص الذكي.'); w.target = '_blank'; w.rel = 'noopener';
            row.append(a, w); c.appendChild(row);
        }
        const pre = el('pre', 'whitespace-pre-wrap leading-relaxed opacity-90', r.report); pre.style.fontFamily = 'inherit';
        c.appendChild(pre);
        if (r.note) c.appendChild(el('p', 'text-amber-100', '📝 ' + r.note));
        if (r.status === 'sent' || r.status === 'replied') {
            const q = el('input', 'w-full bg-slate-800 border border-slate-600 rounded-lg p-2 text-[11px] font-mono');
            q.type = 'number'; q.inputMode = 'decimal'; q.placeholder = 'السعر الإجمالي (' + (r.cur || '') + ')'; if (r.quote) q.value = r.quote;
            c.appendChild(q);
            let av = null;
            if (agent) { av = el('select', 'w-full bg-slate-800 border border-slate-600 rounded-lg p-2 text-[11px]'); AVAIL.forEach(a => av.appendChild(el('option', null, a))); if (r.availability) av.value = r.availability; c.appendChild(av); }
            const ta = el('textarea', 'w-full bg-slate-800 border border-slate-600 rounded-lg p-2 text-[11px] resize-none');
            ta.rows = 2; ta.maxLength = 500; ta.placeholder = agent ? 'تفاصيل (الماركة، الضمان، مدة التوفير…)' : 'الموعد المقترح وتفاصيل الإصلاح والضمان'; ta.value = r.reply || '';
            c.appendChild(ta);
            const b = el('button', 'w-full bg-amber-500 text-slate-950 font-black py-2 rounded-lg', r.status === 'replied' ? 'تحديث العرض' : 'إرسال العرض');
            b.onclick = async () => {
                const quote = parseFloat(q.value) || 0, text = ta.value.trim();
                if (!text && !quote) { alert('اكتب السعر أو رسالة للعميل.'); return; }
                b.disabled = true;
                try { await Store.reply(r.id, { reply: text.slice(0, 500), quote: Math.max(0, Math.min(quote, 1e6)), availability: av ? av.value : '' }); alert('تم إرسال العرض للعميل ✓'); }
                catch (e) { alert('تعذر الإرسال.'); b.disabled = false; }
            };
            c.appendChild(b);
        } else {
            if (r.quote) c.appendChild(el('p', 'font-bold', '💰 عرضك: ' + quoteText(r)));
            c.appendChild(el('p', 'font-black text-blue-300', r.status === 'accepted' ? '✅ العميل قبل عرضك — تواصل معه لتحديد الموعد' : '🏁 مكتمل'));
            const rv = PV.meReviews.find(x => x.reqId === r.id);
            if (rv) c.appendChild(el('p', 'text-amber-300', '★'.repeat(rv.stars) + (rv.text ? ' — ' + rv.text : '')));
        }
        box.appendChild(c);
    });
}

// ---------- الإرسال ----------
let sendTarget = null;
function buildReport(type) {
    const r = lastDiag; if (!r || !r.title) return null;
    const lines = ['🚗 السيارة: ' + carLabel() + ($('car-km').value ? ' • ' + $('car-km').value : ''), '📍 ' + C().name + ' - ' + cityName(), '🔧 التشخيص: ' + r.title, '⚠️ الحالة: ' + (SEV[r.sev] ? SEV[r.sev][2] : '')];
    if (r.code) lines.push('📟 الكود: ' + r.code);
    if (r.kb) {
        const parts = r.kb.parts.map(p => p[0]).join('، ');
        lines.push((type === 'agent' ? '🧩 القطع المطلوب تسعيرها: ' : '🧩 القطع المتوقعة: ') + parts);
        if (type !== 'agent') lines.push('💰 التكلفة العادلة المتوقعة: ' + fmtSar(r.totalSar));
    }
    if (r.text && r.text !== r.code) lines.push('📝 وصف العميل: ' + r.text);
    if (lastMeta && lastMeta.structured) lines.push('📋 ' + lastMeta.structured);
    followups.forEach(f => lines.push('❓ ' + f.q + ' ← ' + f.a));
    if (r.soundSummary) lines.push(r.soundSummary);
    return lines.join('\n').slice(0, 2000);
}
function openSend(p) {
    if (lastDiag && lastDiag.title && !diagUnlocked()) { requirePaid(() => openSend(p)); return; }
    const report = buildReport(p.type);
    if (!report) { alert('افحص سيارتك أولاً (بالوصف أو الصوت أو الكود)، ثم أرسل التقرير.'); switchTab('diagnose'); return; }
    sendTarget = p;
    $('send-title').textContent = TYPE[p.type].sendTitle;
    $('send-to').textContent = p.name;
    $('send-preview').textContent = report;
    $('send-name').value = store.get('sd_user_name', '');
    $('send-phone').value = store.get('sd_user_phone', '');
    sendTarget.report = report;
    $('send-issues').classList.add('hidden'); $('send-status').textContent = '⏳ نصوغ الرسالة ونراجعها…';
    openModal('send-modal');
    const target = sendTarget;
    polishReport(p.type === 'agent' ? 'agent' : 'workshop').then(j => {
        if (sendTarget !== target) return;
        if (j && j.body) { target.report = j.body.slice(0, 2000); $('send-preview').textContent = target.report; $('send-status').textContent = '✓ رُوجعت الرسالة'; }
        else $('send-status').textContent = '';
        if (j && j.issues && j.issues.length) { const si = $('send-issues'); si.textContent = '⚠️ قبل الإرسال: ' + j.issues.join(' • '); si.classList.remove('hidden'); }
    });
}
async function submitRequest() {
    if (!sendTarget) return;
    const name = $('send-name').value.trim(), phone = cleanPhone($('send-phone').value), note = $('send-note').value.trim();
    if (name.length < 2) { alert('اكتب اسمك.'); return; }
    const digits = phone.replace(/\D/g, '');
    if (phone && (digits.length < 9 || digits.length > 15)) { alert('رقم الجوال غير صحيح. اكتبه كاملاً، مثل 05xxxxxxxx، أو اتركه فارغاً.'); return; }
    const report = (sendTarget.report || buildReport(sendTarget.type) || '').slice(0, 2000);
    if (report.length < 40) { alert('التقرير غير مكتمل. افحص سيارتك أولاً ثم أرسل.'); return; }
    // منع الإرسال المكرر لنفس الجهة عن نفس الفحص خلال 10 دقائق
    const sent = store.get('sd_sent', {}), sk = (sendTarget.id || sendTarget.name) + '|' + diagId();
    if (sent[sk] && Date.now() - sent[sk] < 10 * 60e3 && !confirm('أرسلت هذا التقرير لنفس الجهة قبل قليل. إرسال مرة أخرى؟')) return;
    store.set('sd_user_name', name); store.set('sd_user_phone', phone);
    const b = $('send-submit'); b.disabled = true;
    try {
        await Store.sendRequest(sendTarget, { userName: name.slice(0, 40), userPhone: phone, note: note.slice(0, 300), report });
        sent[sk] = Date.now(); store.set('sd_sent', Object.fromEntries(Object.entries(sent).filter(([, t]) => Date.now() - t < 864e5)));
        closeModal('send-modal'); $('send-note').value = '';
        alert('تم الإرسال إلى ' + sendTarget.name + ' ✓ سيظهر الرد في بطاقتهم وفي "سجلي".');
    } catch (e) { alert('تعذر الإرسال، حاول مرة أخرى.'); }
    b.disabled = false;
}
function scrollToProviders(type) {
    if (!lastDiag) { alert('افحص سيارتك أولاً.'); return; }
    $(TYPE[type].section).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- التقييم ----------
let rateReq = null, rateStars = 5;
function openRate(r) {
    rateReq = r; rateStars = 5;
    $('rate-to').textContent = r.providerName || '';
    $('rate-text').value = '';
    drawStars(); openModal('rate-modal');
}
function drawStars() {
    const box = $('rate-stars'); box.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
        const s = el('button', i <= rateStars ? 'text-amber-400' : 'text-slate-300', '★');
        s.onclick = () => { rateStars = i; drawStars(); };
        box.appendChild(s);
    }
}
async function submitRating() {
    if (!rateReq) return;
    const b = $('rate-submit'); b.disabled = true;
    try {
        await Store.setUserStatus(rateReq.id, 'done');
        await Store.addReview(rateReq, rateStars, $('rate-text').value.trim().slice(0, 300));
        closeModal('rate-modal'); alert('شكراً لتقييمك ✓');
    } catch (e) { alert('تعذر إرسال التقييم.'); }
    b.disabled = false;
}

// ---------- التسجيل والدخول ----------
function openJoinModal(type) {
    if (PV.me) { alert('أنت مسجّل الدخول بالفعل. تجد لوحتك أعلى قسم الورش.'); $('provider-panel').scrollIntoView({ behavior: 'smooth' }); return; }
    $('join-type').value = type;
    $('join-title').textContent = type === 'agent' ? '🏪 تسجيل وكيل أو محل قطع غيار' : '🏢 تسجيل ورشة';
    $('join-agent-kind-box').classList.toggle('hidden', type !== 'agent');
    $('join-spec').placeholder = type === 'agent' ? 'الماركات التي تخدمها (تويوتا، هيونداي…)' : 'التخصص (ميكانيكا، كهرباء، مكيفات…)';
    fillCountrySelect('join-country', LOC ? LOC.country : 'SA');
    fillCitySelect('join-city', $('join-country').value, cityName());
    openModal('join-modal');
}
async function submitJoin() {
    const d = { type: $('join-type').value, name: $('join-name').value.trim(), country: $('join-country').value, city: $('join-city').value,
                phone: cleanPhone($('join-phone').value), spec: $('join-spec').value.trim().slice(0, 80), kind: $('join-type').value === 'agent' ? $('join-kind').value : '' };
    const pass = $('join-pass').value, pass2 = $('join-pass2').value;
    if (d.name.length < 2) { alert('اكتب الاسم التجاري.'); return; }
    if (localDigits(d.country, d.phone).length < 7) { alert('اكتب رقم جوال صحيح.'); return; }
    if (pass.length < 6) { alert('كلمة المرور يجب أن تكون 6 أحرف أو أكثر.'); return; }
    if (pass !== pass2) { alert('كلمتا المرور غير متطابقتين.'); return; }
    if (!$('join-terms').checked) { alert('يجب الموافقة على شروط الاستخدام.'); return; }
    d.name = d.name.slice(0, 60);
    const b = $('join-submit'); b.disabled = true;
    try {
        await Store.apply(d, pass);
        closeModal('join-modal'); $('join-pass').value = ''; $('join-pass2').value = '';
        alert('تم إرسال طلبك ✓ ستظهر للمستخدمين في ' + d.city + ' بعد موافقة الإدارة.\nللدخول من أي جهاز: رقم الجوال + كلمة المرور.');
    } catch (e) {
        alert(e.message === 'exists' ? 'هذا الرقم مسجّل بالفعل. استخدم "دخول الورش والوكلاء".' : 'تعذر إرسال الطلب، تحقق من الإنترنت.');
    }
    b.disabled = false;
}
async function providerLogin() {
    const country = $('login-country').value, phone = $('login-phone').value, pass = $('login-pass').value;
    if (localDigits(country, phone).length < 7 || !pass) { alert('اكتب رقم الجوال وكلمة المرور.'); return; }
    const b = $('login-submit'); b.disabled = true;
    try {
        await Store.login(country, phone, pass);
        closeModal('login-modal'); $('login-pass').value = '';
        setTimeout(() => $('provider-panel').scrollIntoView({ behavior: 'smooth' }), 300);
    } catch (e) { alert('رقم الجوال أو كلمة المرور غير صحيحة.'); }
    b.disabled = false;
}


// =====================================================================
