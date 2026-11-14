// الفاحص الذكي · المقابلة الذكية والكلام
// جزء من index.html، يُحمَّل بالترتيب: كل الملفات تشترك في نفس النطاق العام

// 🎯 المقابلة الذكية: أسئلة متتابعة قبل التشخيص لرفع الدقة
// =====================================================================
const QBANK = {
    _when: { q: 'متى تظهر المشكلة غالباً؟', type: 'choice', options: [['والسيارة واقفة', 'واقفه'], ['أثناء المشي', 'وانا ماشي'], ['عند الدعسة', 'الدعسه'], ['عند الفرملة', 'فرمله'], ['عند لف الدركسون', 'عند اللف'], ['عند التشغيل', 'عند التشغيل']] },
    _light: { q: 'هل توجد لمبة مضاءة في الطبلون؟', type: 'choice', options: [['لا يوجد', ''], ['لمبة المكينة', 'لمبه المكينه'], ['لمبة الزيت', 'لمبه الزيت'], ['لمبة الحرارة', 'ساعه الحراره'], ['لمبة البطارية', 'بطاريه']] },
    misfire: { q: 'هل لمبة المكينة تومض (تطفي وتشتغل)؟', type: 'yesno', kw: 'تومض' },
    balance: { q: 'وين تحس الرجة أكثر؟', type: 'choice', options: [['في الدركسون', 'رجه في الدركسون'], ['في جسم السيارة كامل', 'رجه'], ['في دواسة الفرامل', 'فرامل']] },
    bearing: { q: 'هل الصوت يتغير لما تميل يمين أو يسار؟', type: 'yesno', kw: 'رمان بلي' },
    brakes: { q: 'وش نوع صوت الفرامل؟', type: 'choice', options: [['صفير خفيف', 'صفير'], ['خشخشة حديد قوية', 'حكه احتكاك'], ['طقة', 'طقه']] },
    ac: { q: 'هل الهواء يطلع بارد شوي ثم يحمى؟', type: 'yesno', kw: 'فريون' },
    overheat: { q: 'هل ينقص ماء الرديتر أو تشوف بخار؟', type: 'yesno', kw: 'رديتر بخار' },
    battery: { q: 'هل الأنوار والطبلون تضعف عند التشغيل؟', type: 'yesno', kw: 'بطاريه' },
    trans: { q: 'متى تحس النتعة؟', type: 'choice', options: [['عند الانطلاق من الوقوف', 'نتعه'], ['عند التبديل أثناء المشي', 'يتاخر في التبديل'], ['عند الرجوع للخلف', 'قير']] },
    suspension: { q: 'هل الصوت يظهر فقط في المطبات؟', type: 'yesno', kw: 'مطبات' },
    steer: { q: 'هل الصوت يزيد كل ما لفيت الدركسون أكثر؟', type: 'yesno', kw: 'ونين' },
    cv: { q: 'هل الطقطقة تظهر عند اللف الكامل وأنت ماشي؟', type: 'yesno', kw: 'جوزه عكس' },
    power: { q: 'هل لمبة المكينة مضاءة مع الضعف؟', type: 'yesno', kw: 'لمبه المكينه' },
    knock: { q: 'هل الطقة تزيد مع الدعسة؟', type: 'yesno', kw: 'نوك دق' },
    oil: { q: 'وش لون الدخان؟', type: 'choice', options: [['أزرق', 'دخان ازرق'], ['أبيض كثيف', 'بخار رديتر'], ['أسود', 'بنزين'], ['ما فيه دخان', '']] },
    exhaust: { q: 'هل الصوت أعلى عند التشغيل البارد؟', type: 'yesno', kw: 'شكمان' },
    belt: { q: 'هل الصياح يخف بعد ما يحمى المحرك؟', type: 'yesno', kw: 'سير' },
    cat: { q: 'هل تشم ريحة بيض أو كبريت؟', type: 'yesno', kw: 'ريحه بيض' },
    lean: { q: 'هل استهلاك البنزين زاد؟', type: 'yesno', kw: 'يصرف بنزين' }
};
function localQuestions(scores, meta) {
    const qs = [];
    const toQ = b => ({ q: b.q, type: b.type, options: b.type === 'choice' ? b.options.map(o => o[0]) : null, kws: b.type === 'choice' ? b.options.map(o => o[1]) : null, kw: b.kw || '' });
    if (!/متى/.test(meta.structured || '')) qs.push(toQ(QBANK._when));
    if (!/لمبات/.test(meta.structured || '')) qs.push(toQ(QBANK._light));
    Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([id]) => {
        const k = kbById(id);
        if (k && k.remote && k.questions && k.questions.length) {
            k.questions.slice(0, 2).forEach(q => { if (qs.length < 4) qs.push(q.type === 'yesno' ? { q: q.q, type: 'yesno', kw: q.kw || '' } : { q: q.q, type: 'choice', options: q.options.map(o => o.l), kws: q.options.map(o => o.kw || o.l) }); });
        } else if (QBANK[id] && qs.length < 4) qs.push(toQ(QBANK[id]));
    });
    return qs;
}
async function aiQuestions(meta) {
    if (!aiUsable() || location.protocol === 'file:') return null;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 14000);
    try {
        const res = await fetch(AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
            body: JSON.stringify({ mode: 'questions', wid: walletId(), did: diagIdFor(meta), car: carLabel(), mileage: $('car-km').value || '', description: meta.text, structured: meta.structured || '' }) });
        if (res.status === 402) return { paywall: true };
        if (res.status === 503 || res.status === 404) { aiOff(); return null; }
        if (!res.ok) return null;
        const j = await res.json();
        const qs = (j.questions || []).filter(q => q && q.q && (q.type === 'yesno' || (Array.isArray(q.options) && q.options.length >= 2))).slice(0, 4)
            .map(q => ({ q: String(q.q).slice(0, 140), type: q.type === 'yesno' ? 'yesno' : 'choice', options: q.type === 'yesno' ? null : q.options.slice(0, 5).map(o => String(o).slice(0, 40)), ai: true }));
        return qs.length ? qs : null;
    } catch (e) { return null; }
    finally { clearTimeout(t); }
}

let iv = null, ivSeq = 0, ivTimer = null, ivLastText = null, postAsks = 0;
// زر التأكيد ✓ داخل خانة الوصف: يتفعّل عند كتابة وصف، والفحص يبدأ فقط عند الضغط عليه
function onDescInput() {
    const ready = $('car-desc').value.trim().length >= 3;
    const b = $('desc-confirm');
    b.disabled = !ready;
    b.className = 'absolute left-2 bottom-3 w-8 h-8 rounded-lg text-sm font-black transition-all ' + (ready ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 text-slate-400');
}
async function startInterview(auto) {
    const meta = descMeta();
    if (meta.text.length < 3 && !meta.structured) { if (!auto) { alert('اكتب وصفاً للمشكلة، أو اختر من الخيارات، أو اضغط 🎤 وتحدث.'); $('car-desc').focus(); } return; }
    if (!canStart(diagIdFor(meta))) return blockService();
    clearTimeout(ivTimer);
    ivLastText = meta.text; followups = []; postAsks = 0;
    const seq = ++ivSeq;
    iv = null;
    $('car-results').classList.add('hidden');
    $('interview').classList.remove('hidden');
    $('iv-title').textContent = '🤖 جاري التحليل…'; $('iv-step').textContent = ''; $('iv-q').textContent = 'أجهّز لك أسئلة سريعة ترفع دقة التشخيص…';
    $('iv-opts').innerHTML = ''; $('iv-nav').classList.add('hidden'); $('iv-bar').style.width = '8%';
    if (!auto) $('interview').scrollIntoView({ behavior: 'smooth', block: 'center' });
    const scores = scoreDescription(meta.text + ' ' + meta.kw);
    let qs = await aiQuestions(meta);
    if (seq !== ivSeq) return;
    if (qs && qs.paywall) { $('interview').classList.add('hidden'); blockService(); return; }
    if (!qs) qs = localQuestions(scores, meta);
    if (!qs.length) { ivFinishWith(meta, []); return; }
    iv = { meta, qs, i: 0, answers: [] };
    renderIvQ();
}
function renderIvQ() {
    const { qs, i } = iv, q = qs[i];
    $('iv-title').textContent = '🎯 أسئلة سريعة لدقة أعلى';
    $('iv-step').textContent = 'سؤال ' + (i + 1) + ' من ' + qs.length;
    $('iv-bar').style.width = Math.round((i + 1) / (qs.length + 1) * 100) + '%';
    $('iv-q').textContent = q.q;
    const box = $('iv-opts'); box.innerHTML = '';
    const opts = q.type === 'yesno' ? ['نعم', 'لا'] : q.options.slice();
    opts.push('لا أعرف');
    const long = opts.some(o => o.length > 16);
    box.className = 'grid gap-1.5 ' + (long ? 'grid-cols-1' : 'grid-cols-2');
    opts.forEach((o, k) => {
        const b = el('button', 'bg-white border border-indigo-200 rounded-lg py-2 px-2 text-[11px] font-bold text-slate-800 active:bg-indigo-600 active:text-white', o);
        b.onclick = () => {
            let kw = '';
            if (o !== 'لا أعرف') {
                if (q.type === 'yesno') kw = o === 'نعم' ? (q.kw || (q.ai ? q.q : '')) : '';
                else kw = q.kws ? (q.kws[k] || '') : o;
            }
            iv.answers[iv.i] = { q: q.q, a: o, kw };
            iv.i++;
            if (iv.i < iv.qs.length) renderIvQ(); else ivFinish();
        };
        box.appendChild(b);
    });
    $('iv-nav').classList.remove('hidden');
    $('iv-back').classList.toggle('invisible', i === 0);
}
function ivBack() { if (!iv || iv.i === 0) return; iv.i--; iv.answers.length = iv.i; renderIvQ(); }
function ivFinish() {
    if (!iv) { runDescriptionDiagnosis(); return; }
    ivFinishWith(iv.meta, iv.answers.filter(Boolean));
}
function ivFinishWith(meta, answers) {
    $('interview').classList.add('hidden');
    followups = answers.filter(x => x.a !== 'لا أعرف').map(x => ({ q: x.q, a: x.a }));
    const extra = answers.map(x => x.kw).filter(Boolean).join(' ');
    iv = null;
    runDiagnosis(scoreDescription([meta.text, meta.kw, extra].filter(Boolean).join(' ')), meta);
}

function answerFollowup() {
    if (lastMeta && !canStart(diagIdFor(lastMeta))) return blockService();
    const a = $('followup-input').value.trim();
    if (!a) { alert('اكتب إجابتك أولاً، أو اضغط 🎤.'); $('followup-input').focus(); return; }
    if (!lastDiag || !lastMeta) return;
    followups.push({ q: lastDiag.question, a: a.slice(0, 200) }); postAsks++;
    const meta = Object.assign({}, lastMeta);
    const extra = followups.map(f => f.a).join(' ');
    runDiagnosis(scoreDescription([meta.text, meta.kw, extra].filter(Boolean).join(' ')), meta);
}

// ---------- تحويل الكلام إلى نص ----------
let recognizer = null;
function startDictation(targetId) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('متصفحك لا يدعم تحويل الكلام لنص. استخدم زر الميكروفون في لوحة مفاتيح الجوال.'); $(targetId).focus(); return; }
    if (recognizer) { recognizer.stop(); return; }
    const target = $(targetId), status = $('dictate-status');
    const base = target.value ? target.value.trim() + ' ' : '';
    recognizer = new SR();
    recognizer.lang = 'ar-SA'; recognizer.interimResults = true; recognizer.continuous = false;
    recognizer.onresult = e => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; target.value = base + t; if (targetId === 'car-desc') onDescInput(); };
    recognizer.onerror = e => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') alert('لم يُسمح باستخدام المايكروفون. فعّل الإذن من إعدادات المتصفح.');
        else if (e.error === 'no-speech') alert('لم أسمع شيئاً، حاول مرة أخرى.');
    };
    recognizer.onend = () => { recognizer = null; status.classList.add('hidden'); };
    status.classList.remove('hidden');
    recognizer.start();
}

// =====================================================================
