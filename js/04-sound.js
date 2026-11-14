// الفاحص الذكي · الفحص الصوتي
// جزء من index.html، يُحمَّل بالترتيب: كل الملفات تشترك في نفس النطاق العام

// 🎙️ الفحص الصوتي
// =====================================================================
let soundBusy = false;
async function startSoundDiagnosis() {
    if (soundBusy) return;
    if (!isUnlocked() && Wallet.state && !Wallet.state.freeAvailable) return blockService();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alert('المتصفح لا يدعم المايكروفون. افتح الموقع عبر https في Chrome أو Safari.'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
    catch (e) { alert('لم يُسمح بالمايكروفون. فعّل الإذن من إعدادات المتصفح ثم أعد المحاولة.'); return; }
    soundBusy = true;
    const btn = $('rec-btn'); btn.disabled = true; btn.classList.add('opacity-60');
    $('rec-box').classList.remove('hidden'); $('rec-label').textContent = '🔴 جاري التسجيل…';
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const an = ctx.createAnalyser(); an.fftSize = 4096; an.smoothingTimeConstant = 0;
    ctx.createMediaStreamSource(stream).connect(an);
    const freqDb = new Float32Array(an.frequencyBinCount), timeBuf = new Float32Array(an.fftSize);
    const power = new Float64Array(an.frequencyBinCount), binHz = ctx.sampleRate / an.fftSize;
    const env = []; let frames = 0;
    const DURATION = 8000, t0 = performance.now();
    await new Promise(resolve => {
        const tick = () => {
            const elp = performance.now() - t0;
            an.getFloatTimeDomainData(timeBuf);
            let sq = 0; for (let i = 0; i < timeBuf.length; i++) sq += timeBuf[i] * timeBuf[i];
            const rms = Math.sqrt(sq / timeBuf.length); env.push(rms);
            an.getFloatFrequencyData(freqDb);
            for (let i = 0; i < freqDb.length; i++) power[i] += Math.pow(10, freqDb[i] / 10);
            frames++;
            $('rec-level').style.width = Math.min(100, rms * 400) + '%';
            $('rec-timer').textContent = Math.max(0, Math.ceil((DURATION - elp) / 1000));
            if (elp < DURATION) requestAnimationFrame(tick); else resolve();
        };
        tick();
    });
    const elapsed = (performance.now() - t0) / 1000;
    stream.getTracks().forEach(t => t.stop()); ctx.close().catch(() => {});
    $('rec-box').classList.add('hidden'); btn.disabled = false; btn.classList.remove('opacity-60'); soundBusy = false;

    const f = analyzeSound(power, frames, binHz, env, frames / elapsed);
    const context = $('sound-context').value;
    const scores = scoreSound(f, context);
    const descText = $('car-desc').value.trim();
    if (descText) for (const [k, v] of Object.entries(scoreDescription(descText))) scores[k] = (scores[k] || 0) + v;
    const ctxLabel = $('sound-context').selectedOptions[0].textContent;
    runDiagnosis(scores, {
        source: descText ? 'both' : 'sound', text: descText, context: ctxLabel, structured: contextText(), lightIds: selectedChips().lightIds || [],
        soundSummary: f.quiet ? '🔈 الصوت المسجّل ضعيف جداً — قرّب الجوال من مصدر الصوت.' : describeSound(f) + ' • ' + ctxLabel
    });
}

function analyzeSound(power, frames, binHz, env, fps) {
    const n = power.length;
    const avg = Array.from(power, p => p / Math.max(1, frames));
    const band = (lo, hi) => { let s = 0; for (let i = Math.floor(lo / binHz); i < Math.min(n, Math.ceil(hi / binHz)); i++) s += avg[i]; return s; };
    const low = band(40, 300), mid = band(300, 1500), high = band(1500, 6000), vhigh = band(6000, 12000);
    const tot = low + mid + high + vhigh || 1e-12;
    const start = Math.ceil(60 / binHz), stop = Math.min(n, Math.floor(10000 / binHz));
    let peakI = start; for (let i = start; i < stop; i++) if (avg[i] > avg[peakI]) peakI = i;
    const slice = avg.slice(start, stop).sort((a, b) => a - b);
    const median = slice[Math.floor(slice.length / 2)] || 1e-12;
    const tonality = 10 * Math.log10(avg[peakI] / median);
    const mean = env.reduce((a, b) => a + b, 0) / env.length;
    const sd = Math.sqrt(env.reduce((a, b) => a + (b - mean) ** 2, 0) / env.length);
    const cv = mean > 0 ? sd / mean : 0;
    const e = env.map(v => v - mean);
    const e0 = e.reduce((a, b) => a + b * b, 0) || 1e-12;
    const ac = [], maxLag = Math.min(Math.floor(fps * 1.2), Math.floor(e.length / 2));
    for (let lag = 0; lag <= maxLag; lag++) { let s = 0; for (let i = 0; i + lag < e.length; i++) s += e[i] * e[i + lag]; ac.push(s / e0); }
    let bestR = 0, bestLag = 0, dipped = false;
    const minLag = Math.max(2, Math.floor(fps / 10));
    for (let lag = 1; lag < ac.length - 1; lag++) {
        if (ac[lag] < 0.1) dipped = true;
        if (lag >= minLag && dipped && ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] > bestR) { bestR = ac[lag]; bestLag = lag; }
    }
    return { quiet: mean < 0.004, lowR: low / tot, midR: mid / tot, highR: (high + vhigh) / tot,
             peakHz: Math.round(peakI * binHz), tonality, cv, rhythm: bestR, rhythmHz: bestLag ? fps / bestLag : 0 };
}
function scoreSound(f, ctx) {
    const s = {}; const add = (id, v) => { s[id] = (s[id] || 0) + v; };
    if (f.quiet) return s;
    const tonal = f.tonality > 18;
    const rhythmic = f.rhythm > 0.35 && f.cv > 0.15;
    const irregular = f.cv > 0.35 && !rhythmic;
    const squeal = tonal && f.peakHz >= 1800;
    const whine = tonal && f.peakHz >= 250 && f.peakHz < 1800;
    const rumble = f.lowR > 0.6 && !tonal;
    const harsh = f.highR > 0.35 && !tonal;
    if (ctx === 'brake') add('brakes', squeal || harsh ? 7 : 3);
    if (ctx === 'steer') { if (whine) add('steer', 7); else if (rhythmic) add('suspension', 3); else add('steer', 3); }
    if (ctx === 'bump') add('suspension', rhythmic || f.cv > 0.3 ? 7 : 4);
    if (ctx === 'speed') { if (rumble || whine) add('bearing', 6); if (harsh) add('exhaust', 3); add('balance', 1); }
    if (ctx === 'start') { if (squeal) add('belt', 7); else if (rhythmic && f.rhythmHz > 5) add('battery', 6); else add('battery', 2); }
    if (ctx === 'idle' || ctx === 'accel') {
        if (squeal) add('belt', 6);
        if (rhythmic && f.lowR > 0.4) add('knock', ctx === 'accel' ? 6 : 4); else if (rhythmic) add('knock', 2);
        if (irregular) add('misfire', 6);
        if (harsh && ctx === 'accel') add('exhaust', 4);
        if (rumble && !rhythmic && !irregular) add('exhaust', 2);
    }
    return s;
}
function describeSound(f) {
    const p = ['🎧 أقوى تردد: ' + f.peakHz.toLocaleString('en') + ' Hz'];
    const tonal = f.tonality > 18;
    if (tonal && f.peakHz >= 1800) p.push('صوت حاد بنغمة واحدة (صفير/زيقة)');
    else if (tonal && f.peakHz >= 250) p.push('صوت نغمي متصل (ونين)');
    if (f.rhythm > 0.35 && f.cv > 0.15) p.push('طقطقة منتظمة بمعدل ~' + f.rhythmHz.toFixed(1) + ' مرة/ثانية');
    else if (f.cv > 0.35) p.push('صوت غير منتظم (تقطّع)');
    if (f.lowR > 0.6) p.push('هدير منخفض التردد');
    else if (f.highR > 0.35 && !tonal) p.push('ترددات عالية قوية (خشخشة/احتكاك)');
    return p.join(' • ');
}

// =====================================================================
