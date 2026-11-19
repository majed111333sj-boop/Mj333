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
    // الروابط القصيرة (?go=diag أو ?go=lights): ننزل مباشرة لنموذج التشخيص أو لمبات الطبلون
    let go = '';
    try { go = new URLSearchParams(location.search).get('go') || ''; } catch (e) {}
    if (go) setTimeout(() => goSection(go), 500);
    Providers.init();
    if (!LOC) suggestLocation();
    // فتح التطبيق المثبّت من الأيقونة: نافذة «ابدأ» تأخذ المستخدم للفحص مباشرة (مرة لكل تشغيل)
    else if (!go) { try { if ((matchMedia('(display-mode: standalone)').matches || navigator.standalone) && !sessionStorage.getItem('launch_seen')) { sessionStorage.setItem('launch_seen', '1'); setTimeout(showLaunchSheet, 300); } } catch (e) {} }
});

// النزول لقسم معيّن وإبرازه: diag (نموذج التشخيص مع فتح خانة الوصف) أو lights (لمبات الطبلون)
function goSection(go) {
    const target = go === 'diag' ? $('diag-form') : go === 'lights' ? $('chips-light') : null;
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: go === 'diag' ? 'start' : 'center' });
    if (go === 'diag') { try { $('car-desc').focus({ preventScroll: true }); } catch (e) {} }
    target.style.transition = 'box-shadow .3s'; target.style.boxShadow = '0 0 0 3px #F59E0B'; target.style.borderRadius = '12px';
    setTimeout(() => { target.style.boxShadow = ''; }, 2600);
}

function showLaunchSheet() {
    if ($('launch-sheet')) return;
    const wrap = el('div'); wrap.id = 'launch-sheet'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'ابدأ');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:70;background:rgba(15,23,42,.55);display:flex;align-items:flex-end;justify-content:center';
    const box = el('div'); box.style.cssText = 'width:100%;max-width:28rem;background:#fff;border-radius:20px 20px 0 0;padding:18px 16px 22px;box-shadow:0 -8px 30px rgba(0,0,0,.25)';
    const h = el('p', '', 'ابدأ'); h.style.cssText = 'font-size:18px;font-weight:800;color:#0F172A;margin:0 0 4px';
    const sub = el('p', '', 'اختر ما تريد فحصه الآن'); sub.style.cssText = 'font-size:13px;color:#475569;margin:0 0 14px';
    box.append(h, sub);
    const close = () => wrap.remove();
    const opt = (label, hint, primary, fn) => {
        const b = el('button'); b.type = 'button';
        b.style.cssText = 'display:block;width:100%;text-align:start;min-height:56px;margin-top:8px;padding:10px 14px;border-radius:14px;font:inherit;cursor:pointer;' + (primary ? 'background:#1D4ED8;color:#fff;border:0' : 'background:#F8FAFC;color:#0F172A;border:1px solid #E2E8F0');
        const t = el('b', '', label); t.style.cssText = 'display:block;font-size:15px';
        const s = el('span', '', hint); s.style.cssText = 'display:block;font-size:12px;opacity:.8;margin-top:2px';
        b.append(t, s); b.onclick = () => { close(); fn(); }; box.appendChild(b);
    };
    opt('فحص سريع', 'صف العطل واعرف السبب والخطورة', true, () => goSection('diag'));
    opt('لمبات الطبلون', 'اختر اللمبة الظاهرة واعرف معناها', false, () => goSection('lights'));
    opt('فحص سيارة مستعملة', 'قبل الشراء، بنفسك أو عن بعد', false, () => { location.href = 'inspect.html'; });
    const skip = el('button', '', 'تصفّح التطبيق'); skip.type = 'button';
    skip.style.cssText = 'display:block;margin:12px auto 0;min-height:44px;padding:0 16px;background:none;border:0;color:#475569;font:inherit;font-size:13px;text-decoration:underline;cursor:pointer';
    skip.onclick = close; box.appendChild(skip);
    wrap.onclick = e => { if (e.target === wrap) close(); };
    wrap.appendChild(box); document.body.appendChild(wrap);
}
