// الفاحص الذكي · السجل ودقة التشخيص
// جزء من index.html، يُحمَّل بالترتيب: كل الملفات تشترك في نفس النطاق العام

// 📋 السجل
// =====================================================================
function addHistory(r) {
    if (!r || !r.title) return;
    const h = store.get('sd_history', []);
    h.unshift({ t: Date.now(), title: r.title, car: carLabel(), city: cityName(), sev: r.sev, totalSar: (diagUnlocked() || freeView()) ? (r.totalSar || 0) : 0, code: r.code || '', ai: !!r.ai, did: diagId() });
    store.set('sd_history', h.slice(0, 30));
}
// ---------- دقة التشخيص: نسأل المستخدم بعد يومين "وش طلع العطل فعلاً؟" ----------
// التقييم للمشتركين فقط (من اشترى فعلاً)، حتى تكون النسبة المعلنة موثوقة
const isSubscriber = () => !!(Wallet.state && !Wallet.state.offline && (passActive() || Wallet.state.paid));
function pendingFeedback() {
    const now = Date.now();
    if (!isSubscriber()) return null;
    return store.get('sd_history', []).find(h => h.did && h.ai && !h.fb && now - h.t > 2 * 864e5 && now - h.t < 45 * 864e5 && !(h.snooze > now));
}
function renderFeedbackCard() {
    const h = pendingFeedback(), c = $('fb-card'); if (!c) return;
    c.classList.toggle('hidden', !h);
    if (h) $('fb-title').textContent = h.title + (h.car ? ' (' + h.car + ')' : '');
}
function sendFeedback(result) {
    const h = pendingFeedback(); if (!h) return;
    const hist = store.get('sd_history', []), it = hist.find(x => x.did === h.did && x.t === h.t);
    if (result === 'later') { it.snooze = Date.now() + 3 * 864e5; store.set('sd_history', hist); renderFeedbackCard(); return; }
    // الفئات: a = 90–100% ، b = 80–90% ، c = أقل من 80% (تُحوَّل لقيم الخادم yes / partial / no)
    result = { a: 'yes', b: 'partial', c: 'no' }[result] || result;
    let actual = '';
    if (result === 'no') actual = noPii(prompt('وش كان العطل الفعلي؟ (اختياري، يساعدنا نتحسن)') || '').slice(0, 200);
    it.fb = result; store.set('sd_history', hist);
    payApi({ mode: 'feedback', did: h.did, result, title: h.title, car: h.car, actual, src: confirm('هل تأكدت من النتيجة عند فني؟\n(موافق = نعم، إلغاء = لا)') ? 'mechanic' : 'user' });
    renderFeedbackCard();
    alert('شكراً لك! إجابتك تحسّن دقة التشخيص للجميع.');
}
function clearHistory() { if (confirm('مسح كل الفحوصات السابقة؟')) { store.del('sd_history'); renderMine(); } }
function renderMine() {
    const box = $('my-history'); box.innerHTML = '';
    const h = store.get('sd_history', []);
    if (!h.length) box.appendChild(el('p', 'text-[11px] text-slate-400', 'لا توجد فحوصات بعد.'));
    h.forEach(x => {
        const row = el('div', 'flex justify-between items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2 text-[11px]');
        const l = el('div', 'min-w-0');
        l.appendChild(el('span', 'font-bold block truncate', (SEV[x.sev] ? SEV[x.sev][0].slice(-2) + ' ' : '') + x.title));
        l.appendChild(el('span', 'text-[10px] text-slate-400', x.car + ' • ' + fmtTime(x.t)));
        row.appendChild(l);
        if (x.totalSar) { const v = el('span', 'font-mono font-bold shrink-0'); v.dataset.sar = x.totalSar; v.dir = 'ltr'; row.appendChild(v); }
        box.appendChild(row);
    });
    if (typeof Providers !== 'undefined') Providers.renderMyRequests();
    renderMoney();
}

// =====================================================================
