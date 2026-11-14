// الفاحص الذكي · التشغيل
// جزء من index.html، يُحمَّل بالترتيب: كل الملفات تشترك في نفس النطاق العام

// 🚀 التشغيل
// =====================================================================
window.addEventListener('DOMContentLoaded', () => {
    kbApplyCache(); kbLoadAuto(); walletRefresh().then(watchPayment).then(() => { if (store.get('sd_tam_pending', null)) watchTam(); });
    try { if (!sessionStorage.getItem('sd_v')) { sessionStorage.setItem('sd_v', '1'); track('visit'); } } catch (e) {}
    renderFeedbackCard();
    const mk = $('car-make'); CAR_MAKES.forEach(m => mk.appendChild(el('option', null, m)));
    const yr = $('car-year'), nowY = new Date().getFullYear(); for (let y = nowY + 1; y >= 2005; y--) yr.appendChild(el('option', null, String(y))); yr.appendChild(el('option', null, 'أقدم من 2005')); yr.value = String(nowY - 3);
    ['car-make', 'car-year', 'car-model', 'car-km'].forEach(id => {
        const v = store.get('sd_' + id, null); if (v) $(id).value = v;
        $(id).addEventListener('change', () => store.set('sd_' + id, $(id).value));
    });
    $('car-make').addEventListener('change', () => { $('car-model').value = ''; store.set('sd_car-model', ''); fillModelList(); });
    fillModelList();
    buildChips();
    $('followup-input').addEventListener('keydown', e => { if (e.key === 'Enter') answerFollowup(); });
    $('pc-part-r').addEventListener('keydown', e => { if (e.key === 'Enter') checkPart('r'); });
    $('car-desc').addEventListener('input', onDescInput);
    fillPartSelects();
    fillCountrySelect('login-country');
    $('code-input').addEventListener('keydown', e => { if (e.key === 'Enter') runCodeDiagnosis(); });
    onLocationChanged();
    // رابط دليل الأعطال (?q=وصف العطل): نملأ الوصف ليبدأ المستخدم فوراً
    try { const q = new URLSearchParams(location.search).get('q'); if (q) { $('car-desc').value = q.slice(0, 300); onDescInput(); } } catch (e) {}
    Providers.init();
    if (!LOC) suggestLocation();
});
