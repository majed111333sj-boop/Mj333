// الفاحص الذكي · أكواد الأعطال (تعمل بدون إنترنت) وقارئ OBD2 عبر البلوتوث
// جزء من index.html، يُحمَّل بالترتيب: كل الملفات تشترك في نفس النطاق العام

// =====================================================================
// 🔌 أكواد الأعطال (بدون إنترنت) + قارئ OBD
// =====================================================================
const DTC_INFO = {
    P0171: ['خليط الوقود فقير (هواء زائد) - البنك 1', 'caution', 'غالباً تهريب هواء أو حساس هواء (MAF) متسخ أو ضعف طرمبة البنزين.'],
    P0172: ['خليط الوقود غني (بنزين زائد) - البنك 1', 'caution', 'قد يكون بخاخ يسرّب أو حساس هواء أو ضغط وقود مرتفع.'],
    P0174: ['خليط الوقود فقير - البنك 2', 'caution', 'غالباً تهريب هواء أو حساس هواء متسخ.'],
    P0101: ['قراءة حساس كمية الهواء (MAF) غير منطقية', 'caution', 'نظّف الحساس بمنظف مخصص وافحص فلتر الهواء والخراطيم.'],
    P0117: ['دائرة حساس حرارة الماء - إشارة منخفضة', 'caution', 'عطل في الحساس أو أسلاكه غالباً. راقب ساعة الحرارة؛ إن كانت طبيعية فالمشكلة في الحساس.'],
    P0118: ['دائرة حساس حرارة الماء - إشارة مرتفعة', 'caution', 'عطل في الحساس أو أسلاكه غالباً. راقب ساعة الحرارة.'],
    P0128: ['المحرك لا يصل لحرارة التشغيل (الثرموستات)', 'safe', 'غالباً ثرموستات عالق مفتوح. القيادة ممكنة لكن الاستهلاك يزيد والتدفئة تضعف.'],
    P0217: ['ارتفاع حرارة المحرك', 'stop', 'أوقف المحرك فوراً ولا تفتح غطاء الرديتر وهو حار.'],
    P0300: ['تقطيع احتراق عشوائي في عدة سلندرات', 'caution', 'إذا كانت لمبة المحرك تومض فلا تقُد لمسافات طويلة.'],
    P0335: ['دائرة حساس عمود الكرنك', 'stop', 'قد ينطفئ المحرك فجأة أو لا يشتغل. افحصه قريباً.'],
    P0340: ['دائرة حساس عمود الكامات', 'caution', 'قد يسبب صعوبة تشغيل أو ضعف أداء.'],
    P0420: ['كفاءة دبة التلوث منخفضة - البنك 1', 'safe', 'ابدأ بفحص حساس الأكسجين الخلفي قبل تبديل الدبة.'],
    P0430: ['كفاءة دبة التلوث منخفضة - البنك 2', 'safe', 'ابدأ بفحص حساس الأكسجين قبل تبديل الدبة.'],
    P0442: ['تسريب صغير في نظام أبخرة الوقود (EVAP)', 'safe', 'تأكد أولاً أن غطاء البنزين مغلق جيداً وسليم.'],
    P0455: ['تسريب كبير في نظام أبخرة الوقود (EVAP)', 'safe', 'غالباً غطاء البنزين مفتوح أو تالف، أو خرطوم مفصول.'],
    P0500: ['عطل حساس سرعة السيارة', 'caution', 'قد يؤثر على عداد السرعة وتبديل القير.'],
    P0562: ['جهد كهرباء السيارة منخفض', 'caution', 'افحص البطارية والدينمو.'],
    P0700: ['يوجد عطل في نظام القير', 'caution', 'اطلب قراءة كمبيوتر القير لمعرفة الكود التفصيلي.'],
    P0730: ['نسبة تعشيق القير غير صحيحة', 'caution', 'افحص مستوى زيت القير وحالته.']
};
function decodeDTC(code) {
    const m = /^([PCBU])([0-3])([0-9A-F])([0-9A-F]{2})$/.exec(code);
    if (!m) return null;
    const sys = { P: 'المحرك وناقل الحركة', C: 'الشاصي (فرامل، تعليق، توجيه)', B: 'الهيكل والمقصورة (وسائد، تكييف، كهرباء)', U: 'شبكة اتصال كمبيوترات السيارة' }[m[1]];
    const type = (m[2] === '0' || m[2] === '2') ? 'كود عام موحد' : 'كود خاص بالشركة المصنعة';
    let sub = '';
    if (m[1] === 'P') sub = { '0': 'الوقود والهواء والانبعاثات', '1': 'قياس الوقود والهواء', '2': 'قياس الوقود والهواء (البخاخات)', '3': 'الإشعال أو تقطيع الاحتراق', '4': 'أنظمة التحكم بالانبعاثات', '5': 'سرعة السيارة والتحكم بالسكون', '6': 'كمبيوتر السيارة ودوائره', '7': 'ناقل الحركة', '8': 'ناقل الحركة', '9': 'ناقل الحركة', 'A': 'نظام الدفع الهجين', 'B': 'نظام الدفع الهجين', 'C': 'نظام الدفع الهجين' }[m[3]] || '';
    return { sys, type, sub };
}
function dtcInfo(code) {
    if (DTC_INFO[code]) return DTC_INFO[code];
    const cyl = /^P030([1-8])$/.exec(code);
    if (cyl) return ['تقطيع احتراق في السلندر رقم ' + cyl[1], 'caution', 'غالباً كويل أو بوجي هذا السلندر. بدّل الكويل مع سلندر آخر لتأكيد العطل.'];
    return null;
}
function codeSummary(code) {
    const info = dtcInfo(code), dec = decodeDTC(code);
    const lines = [];
    if (info) lines.push(code + ': ' + info[0] + '. ' + info[2]);
    if (dec) lines.push('النظام: ' + dec.sys + (dec.sub ? ' — ' + dec.sub : '') + ' (' + dec.type + ')');
    return lines.join('\n');
}
function runCodeDiagnosis(codeArg) {
    const code = String(codeArg || $('code-input').value).trim().toUpperCase();
    $('code-input').value = code;
    if (!decodeDTC(code)) { alert('اكتب كوداً صحيحاً مثل P0300 (حرف ثم 4 خانات).'); return; }
    const scores = {};
    CAR_KB.forEach(k => { if (k.codes.includes(code)) scores[k.id] = (k.codeW || 10); });
    const info = dtcInfo(code);
    const meta = { source: 'code', code, text: code, codeInfo: codeSummary(code), structured: contextText(), lightIds: selectedChips().lightIds || [] };
    if (!canStart(diagIdFor(meta))) return blockService();
    followups = [];
    runDiagnosis(scores, meta).then(() => {
        if (!lastDiag && info) {
            // كود معروف بلا قطع مرتبطة: نعرض معناه كنتيجة
            renderDiagnosis(Object.assign(buildLocalResult({}, meta), { title: info[0], sev: info[1], conf: 'عالية', advice: info[2] }), false);
            addHistory(lastDiag);
        }
    });
}
function checkOfflineCode() {
    const v = $('offline-code-input').value.trim().toUpperCase();
    const box = $('offline-result');
    if (v.length < 5) { box.classList.add('hidden'); return; }
    box.innerHTML = '';
    const dec = decodeDTC(v);
    if (!dec) { box.className = 'rounded-xl p-3 text-[11px] border bg-slate-50 border-slate-200'; box.textContent = 'صيغة الكود غير صحيحة. مثال: P0300'; return; }
    const info = dtcInfo(v);
    const sev = info ? SEV[info[1]] : null;
    box.className = 'rounded-xl p-3 text-[11px] leading-relaxed border space-y-1 ' + (info && info[1] === 'stop' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200');
    box.appendChild(el('p', 'font-black', v + (info ? ' — ' + info[0] : '')));
    if (sev) box.appendChild(el('p', 'font-bold', sev[0]));
    if (info) box.appendChild(el('p', null, info[2]));
    box.appendChild(el('p', 'text-slate-500', 'النظام: ' + dec.sys + (dec.sub ? ' — ' + dec.sub : '') + ' (' + dec.type + ')'));
    const b = el('button', 'mt-1 bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg text-[11px]', 'تشخيص كامل وتكلفة');
    b.onclick = () => { switchTab('diagnose'); setDiagMode('code'); runCodeDiagnosis(v); };
    box.appendChild(b);
}

// --- OBD2 عبر Bluetooth (ELM327 BLE) ---
async function connectOBD() {
    const status = $('obd-status'), codesBox = $('obd-codes');
    if (!navigator.bluetooth) { status.textContent = 'هذا المتصفح لا يدعم البلوتوث. استخدم Chrome على أندرويد أو كمبيوتر، أو اكتب الكود يدوياً.'; return; }
    const SERVICES = [0xfff0, 0xffe0, 0x18f0, 'e7810a71-73ae-499d-8c15-faa9aef0c3f2'];
    let device;
    try { device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES }); }
    catch (e) { status.textContent = 'لم يتم اختيار جهاز.'; return; }
    const btn = $('obd-btn'); btn.disabled = true;
    try {
        status.textContent = '⏳ جاري الاتصال بـ ' + (device.name || 'القارئ') + '…';
        const server = await device.gatt.connect();
        let writeC = null, notifyC = null;
        for (const sv of await server.getPrimaryServices()) {
            let chars = []; try { chars = await sv.getCharacteristics(); } catch (e) {}
            for (const ch of chars) {
                if (!writeC && (ch.properties.write || ch.properties.writeWithoutResponse)) writeC = ch;
                if (!notifyC && (ch.properties.notify || ch.properties.indicate)) notifyC = ch;
            }
            if (writeC && notifyC) break;
        }
        if (!writeC || !notifyC) throw new Error('القارئ غير مدعوم');
        let buf = '', waiter = null;
        await notifyC.startNotifications();
        notifyC.addEventListener('characteristicvaluechanged', ev => {
            buf += new TextDecoder().decode(ev.target.value);
            if (buf.includes('>') && waiter) { const w = waiter; waiter = null; w(buf); }
        });
        const send = (cmd, ms = 4000) => new Promise(async res => {
            buf = '';
            const to = setTimeout(() => { waiter = null; res(buf); }, ms);
            waiter = out => { clearTimeout(to); res(out); };
            const data = new TextEncoder().encode(cmd + '\r');
            if (writeC.properties.writeWithoutResponse && writeC.writeValueWithoutResponse) await writeC.writeValueWithoutResponse(data);
            else await writeC.writeValue(data);
        });
        status.textContent = '⏳ تهيئة القارئ…';
        await send('ATZ', 3000);
        for (const c of ['ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0']) await send(c, 2000);
        status.textContent = '⏳ قراءة أكواد الأعطال…';
        const raw = await send('03', 8000);
        const codes = parseDTCResponse(raw);
        codesBox.innerHTML = '';
        if (/UNABLE|NO DATA|ERROR/i.test(raw) && !codes.length) status.textContent = 'لم يستجب كمبيوتر السيارة. تأكد أن المفتاح على وضع التشغيل ثم أعد المحاولة.';
        else if (!codes.length) status.textContent = '✅ لا توجد أكواد أعطال مخزنة في كمبيوتر المحرك.';
        else {
            status.textContent = 'تم العثور على ' + codes.length + ' كود. اضغط على الكود لتشخيصه:';
            codes.forEach(c => {
                const b = el('button', 'bg-amber-400 text-slate-950 font-mono font-black px-2.5 py-1 rounded-lg text-xs', c);
                b.onclick = () => runCodeDiagnosis(c);
                codesBox.appendChild(b);
            });
            runCodeDiagnosis(codes[0]);
        }
        try { device.gatt.disconnect(); } catch (e) {}
    } catch (e) {
        status.textContent = 'تعذر القراءة: ' + (e.message || 'خطأ في الاتصال') + '. جرّب إعادة تشغيل القارئ.';
    }
    btn.disabled = false;
}
function parseDTCResponse(raw) {
    const out = new Set();
    String(raw).replace(/SEARCHING\.\.\./gi, '').split(/[\r\n>]+/).forEach(line => {
        let h = line.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
        const i = h.indexOf('43');
        if (i < 0 || i > 5) return;                                       // قد تسبقها ترويسة CAN وبايت الطول
        let p = h.slice(i + 2);
        if (p.length % 4 === 2) p = p.slice(2);                          // بايت العدد في بروتوكول CAN
        for (let k = 0; k + 4 <= p.length; k += 4) {
            const c = p.slice(k, k + 4);
            if (c === '0000') continue;
            const n = parseInt(c[0], 16);
            out.add('PCBU'[n >> 2] + (n & 3) + c.slice(1));
        }
    });
    return [...out];
}
