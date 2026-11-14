// الفاحص الذكي · المناطق واللغات (ملف مستقل يُحمَّل في كل الصفحات قبل أي كود آخر)
// نسخة واحدة من التطبيق، وكل منطقة بإعداداتها: اللغة، والعملة، والوحدات، والأسعار، والخصوصية.
// الشرق الأوسط (mena) يعمل كما هو بقاعدة الأعطال والأسعار المحلية. المناطق الأخرى: الخادم يشخّص بلغة
// المستخدم ويقدّر التكلفة بعملته، والواجهة تُترجم آلياً (كل عبارة تُترجم مرة واحدة وتُحفظ للجميع).
(function () {
    const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
    const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

    // الدولة ← [المنطقة، رمز العملة، شكلها، الوحدة، اللغة الافتراضية]
    const CC = {
        SA: ['mena', 'SAR', 'ر.س', 'km', 'ar'], AE: ['mena', 'AED', 'د.إ', 'km', 'ar'], KW: ['mena', 'KWD', 'د.ك', 'km', 'ar'], QA: ['mena', 'QAR', 'ر.ق', 'km', 'ar'], BH: ['mena', 'BHD', 'د.ب', 'km', 'ar'], OM: ['mena', 'OMR', 'ر.ع', 'km', 'ar'],
        DE: ['eu', 'EUR', '€', 'km', 'de'], FR: ['eu', 'EUR', '€', 'km', 'fr'], GB: ['eu', 'GBP', '£', 'mi', 'en'], IT: ['eu', 'EUR', '€', 'km', 'it'], ES: ['eu', 'EUR', '€', 'km', 'es'], NL: ['eu', 'EUR', '€', 'km', 'en'],
        BE: ['eu', 'EUR', '€', 'km', 'fr'], AT: ['eu', 'EUR', '€', 'km', 'de'], CH: ['eu', 'CHF', 'CHF', 'km', 'de'], IE: ['eu', 'EUR', '€', 'km', 'en'], PL: ['eu', 'PLN', 'zł', 'km', 'en'],
        US: ['us', 'USD', '$', 'mi', 'en'],
        BR: ['latam', 'BRL', 'R$', 'km', 'pt'], MX: ['latam', 'MXN', 'MX$', 'km', 'es'], AR: ['latam', 'USD', 'US$', 'km', 'es'], CO: ['latam', 'USD', 'US$', 'km', 'es'], CL: ['latam', 'USD', 'US$', 'km', 'es'], PE: ['latam', 'USD', 'US$', 'km', 'es']
    };
    const LANGS = { ar: 'العربية', en: 'English', de: 'Deutsch', fr: 'Français', it: 'Italiano', es: 'Español', pt: 'Português' };
    // أسعار الخدمات خارج الشرق الأوسط: بالدولار دائماً (متجر Lemon بالدولار)، والمبلغ الفعلي يحدده رابط الدفع لتلك المنطقة. mena تبقى بالريال من PRODUCTS.
    const P = (full, diag, upgrade, prices, toolmain, toolsub, report, report5) => ({ full, diag, upgrade, prices, toolmain, toolsub, report, report5 });
    const PRICES = {
        us: P(8.99, 4.99, 5.99, 1.99, 4.99, 1.99, 19.99, 46.99), eu: P(8.99, 4.99, 5.99, 1.99, 4.99, 1.99, 19.99, 46.99),
        latam: P(3.99, 2.49, 2.99, 1.99, 1.99, 1.99, 7.99, 18.99)
    };

    // اجعلها true لطلب الموافقة على إرسال البيانات من مستخدمي الشرق الأوسط أيضاً (قرار قانوني: راجع نظام حماية البيانات)
    const CONSENT_ALL = false;

    const loc = get('sd_loc', null), known = !!(loc && CC[loc.country]), cc = known ? loc.country : 'SA', c = CC[cc];
    // [إصلاح 1] اللغة: المحفوظة أولاً، ثم لغة الدولة المعروفة، ثم العربية
    const saved = get('sd_lang', null);
    const lang = LANGS[saved] ? saved : (known ? c[4] : 'ar');
    const after = c[2] === 'zł' || /[\u0600-\u06FF]/.test(c[2]);
    // [إصلاح 7] تنسيق الأرقام حسب لغة المستخدم ودولته (1.234,50 للألمانية والبرتغالية...). mena والعربية تبقيان كما كانتا
    const NUMLOC = c[0] !== 'mena' && lang !== 'ar' ? lang + '-' + cc : 'en';
    const fmt = (n, o) => { try { return Number(n).toLocaleString(NUMLOC, o); } catch (e) { return Number(n).toLocaleString('en', o); } };
    const SD = window.SD = {
        CC, LANGS, cc, region: c[0], currency: c[1], cur: c[2], unit: c[3], lang, intl: c[0] !== 'mena',
        defaultLang: k => (CC[k] ? CC[k][4] : 'en'),
        setLang(l) { if (LANGS[l]) { set('sd_lang', l); location.reload(); } },
        // سعر الباقة بعملة المنطقة، أو null للشرق الأوسط (يُحسب هناك من الريال)
        // الرمز قبل المبلغ ($9.99، R$ 9.90)، إلا العملات التي تُكتب بعده (zł والعملات العربية)
        price(k) { if (c[0] === 'mena') return null; const t = PRICES[c[0]]; return !t || t[k] == null ? null : '$' + t[k].toFixed(t[k] % 1 ? 2 : 0); },
        money(n) { n = Number(n) || 0; const s = fmt(n, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); return after ? s + ' ' + c[2] : c[2] + (c[2].length > 1 ? ' ' : '') + s; },
        range(lo, hi) { if (lo === hi) return SD.money(lo); const f = v => fmt(v); return after ? f(lo) + '–' + f(hi) + ' ' + c[2] : c[2] + (c[2].length > 1 ? ' ' : '') + f(lo) + '–' + f(hi); },
        t: s => s,
        // تسجيل نصوص النوافذ المنبثقة مسبقاً لتُترجم في الخلفية: SD.preload(['هل أنت متأكد؟', ...])
        preload() {}
    };

    // ---------- كل طلب للخادم يحمل الدولة، ولغة الرد للمناطق غير العربية، وبعد موافقة المستخدم ----------
    const AI_MODES = ['diagnose', 'questions', 'vision', 'measure', 'inspect2', 'invoice', 'partcheck', 'report_write', 'inspect'];
    const CONSENT = {
        en: 'To analyse your car, the description, sounds or photos you provide are sent to our AI provider (Google) and deleted after analysis. We do not sell your data. Continue?',
        de: 'Zur Analyse werden Ihre Beschreibung, Geräusche oder Fotos an unseren KI-Anbieter (Google) gesendet und danach gelöscht. Wir verkaufen Ihre Daten nicht. Fortfahren?',
        fr: 'Pour analyser votre voiture, la description, les sons ou les photos sont envoyés à notre fournisseur d’IA (Google) puis supprimés. Nous ne vendons pas vos données. Continuer ?',
        it: 'Per analizzare l’auto, descrizione, suoni o foto vengono inviati al nostro fornitore di IA (Google) e poi eliminati. Non vendiamo i tuoi dati. Continuare?',
        es: 'Para analizar tu coche, la descripción, los sonidos o las fotos se envían a nuestro proveedor de IA (Google) y se eliminan después. No vendemos tus datos. ¿Continuar?',
        pt: 'Para analisar o seu carro, a descrição, os sons ou as fotos são enviados ao nosso fornecedor de IA (Google) e apagados depois. Não vendemos os seus dados. Continuar?',
        ar: 'لتحليل سيارتك نرسل الوصف أو الصوت أو الصور إلى مزود الذكاء الاصطناعي (Google) ثم تُحذف. لا نبيع بياناتك. متابعة؟'
    };
    const nativeFetch = window.fetch.bind(window), nativeConfirm = window.confirm.bind(window);
    // [إصلاح 3] نتعرف على /api/ai سواء جاء كمسار نسبي أو رابط كامل أو كائن URL أو Request
    const isAI = u => { try { return new URL(u, location.href).pathname.indexOf('/api/ai') === 0; } catch (e) { return false; } };
    const blocked = () => Promise.resolve(new Response('{"error":"consent_required"}', { status: 451, headers: { 'content-type': 'application/json' } }));
    // يعيد الجسم الجديد، أو null إن لم يتغير شيء، أو false إن رفض المستخدم الموافقة
    function patch(body) {
        const b = JSON.parse(body);
        if (!b || typeof b !== 'object' || !b.mode) return null;
        if ((SD.intl || CONSENT_ALL) && AI_MODES.includes(b.mode) && !get('sd_consent', false)) {
            if (!nativeConfirm(CONSENT[lang] || CONSENT.en)) return false;
            set('sd_consent', Date.now());
        }
        if (b.cc == null) b.cc = cc;
        if (SD.intl && b.lang == null) b.lang = lang === 'ar' ? 'en' : lang;
        return JSON.stringify(b);
    }
    window.fetch = function (input, opts) {
        try {
            const isReq = typeof Request !== 'undefined' && input instanceof Request;
            if (isAI(isReq ? input.url : String(input))) {
                if (opts && typeof opts.body === 'string') {
                    const nb = patch(opts.body);
                    if (nb === false) return blocked();
                    if (nb) opts = Object.assign({}, opts, { body: nb });
                } else if (isReq && !(opts && opts.body != null) && input.method !== 'GET' && input.method !== 'HEAD') {
                    // جسم Request لا يُقرأ إلا بشكل غير متزامن: نقرأ نسخة منه ثم نعيد بناء الطلب
                    return input.clone().text().then(txt => {
                        let nb = null; try { nb = patch(txt); } catch (e) {}
                        if (nb === false) return blocked();
                        return nativeFetch(nb ? new Request(input, { body: nb }) : input, opts);
                    }, () => nativeFetch(input, opts));
                }
            }
        } catch (e) {}
        return nativeFetch(input, opts);
    };

    if (lang === 'ar') return;   // العربية هي لغة المصدر: لا ترجمة

    // =====================================================================
    // ترجمة الواجهة: نراقب الصفحة، وكل نص عربي يُستبدل بترجمته المحفوظة،
    // وما لم يُترجم بعد يُطلب من الخادم دفعة واحدة (ويُحفظ هناك لكل المستخدمين)
    // =====================================================================
    document.documentElement.lang = lang; document.documentElement.dir = 'ltr';
    // [إصلاح 6] الأرقام تشمل العربية الهندية (٠-٩) والفارسية (۰-۹) وتُحوَّل إلى لاتينية عند التعبئة
    const D = '[\\d\\u0660-\\u0669\\u06F0-\\u06F9]';
    const AR = /[\u0600-\u06FF]/, NUM = new RegExp(D + '+(?:[.,:\\u066B\\u066C]' + D + '+)*', 'g'), SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1 };
    const latin = m => m.replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x660).replace(/[\u06F0-\u06F9]/g, d => d.charCodeAt(0) - 0x6F0).replace(/\u066B/g, '.').replace(/\u066C/g, ',');
    const dictKey = 'sd_i18n_' + lang, dict = get(dictKey, {}) || {};
    const pending = new Map();   // المفتاح ← العناصر المنتظرة
    const tries = new Map();     // المفتاح ← عدد محاولات الترجمة الفاشلة
    const MAX_TRIES = 2, RETRY_MS = 4000;
    let dirty = false, timer = null, busy = false;
    function norm(s) { const nums = []; const k = s.replace(/\s+/g, ' ').trim().replace(NUM, m => { nums.push(latin(m)); return '{' + (nums.length - 1) + '}'; }); return [k, nums]; }
    const fill = (t, nums) => t.replace(/\{(\d+)\}/g, (m, i) => (nums[i] != null ? nums[i] : m));
    // يعيد الترجمة، أو النص نفسه إن لم يكن فيه ما يُترجم، أو null إن لم تُحفظ ترجمته بعد
    function lookup(s) { if (!s || !AR.test(s)) return s; const [k, nums] = norm(s); if (!AR.test(k)) return s; return dict[k] ? fill(dict[k], nums) : null; }
    SD.t = s => { const r = lookup(s); return r == null ? s : r; };
    function want(k, slot) { if (!AR.test(k)) return; if (!pending.has(k)) pending.set(k, []); pending.get(k).push(slot); clearTimeout(timer); timer = setTimeout(flush, 250); }
    SD.preload = list => { (list || []).forEach(s => { s = String(s); if (lookup(s) == null) want(norm(s)[0], {}); }); };
    // [إصلاح 2] لا نكتب في الصفحة إلا إذا تغيّرت القيمة فعلاً، حتى لا يدور المراقب في حلقة
    // عندما تحتوي الترجمة نفسها على حروف عربية (اسم علم مثلاً)
    function doText(n) {
        const s = n.nodeValue; if (!s || !AR.test(s)) return;
        const p = n.parentNode; if (!p || SKIP[p.nodeName] || (p.closest && p.closest('[data-noi18n]'))) return;
        if (p.nodeName === 'OPTION' && !p.hasAttribute('value')) p.setAttribute('value', p.textContent);   // القيمة تبقى بالعربية للمنطق الداخلي
        const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], r = lookup(s);
        if (r != null) { const v = lead + r + trail; if (v !== s && r !== s) n.nodeValue = v; }
        else want(norm(s)[0], { n, lead, trail });
    }
    function doAttrs(e) {
        ['placeholder', 'title', 'aria-label'].forEach(a => { const v = e.getAttribute && e.getAttribute(a); if (v && AR.test(v)) { const r = lookup(v); if (r != null) { if (r !== v) e.setAttribute(a, r); } else want(norm(v)[0], { e, a }); } });
    }
    function walk(root) {
        if (!root) return;
        if (root.nodeType === 3) return doText(root);
        if (root.nodeType !== 1 || SKIP[root.nodeName]) return;
        doAttrs(root);
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
        let n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
    }
    function applyPending() {
        pending.forEach((slots, k) => {
            if (!dict[k]) return;
            slots.forEach(sl => {
                if (sl.n) { const cur = sl.n.nodeValue; if (cur && AR.test(cur) && norm(cur)[0] === k) { const v = sl.lead + fill(dict[k], norm(cur)[1]) + sl.trail; if (v !== cur) sl.n.nodeValue = v; } }
                else if (sl.e) { const cur = sl.e.getAttribute(sl.a); if (cur && AR.test(cur) && norm(cur)[0] === k) { const v = fill(dict[k], norm(cur)[1]); if (v !== cur) sl.e.setAttribute(sl.a, v); } }
            });
            pending.delete(k);
        });
    }
    async function flush() {
        if (busy) return;   // طلب واحد في كل مرة؛ ما يصل أثناءه يُرسل بعد انتهائه
        const keys = [...pending.keys()].filter(k => !dict[k]).slice(0, 40); if (!keys.length) return applyPending();
        busy = true;
        try {
            const r = await nativeFetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'i18n', lang, strings: keys }) });
            const j = r.ok ? await r.json() : null;
            if (j && j.map) { Object.assign(dict, j.map); dirty = true; }
        } catch (e) {}
        busy = false;
        // [إصلاح 5] ما فشل يُعاد مرة واحدة بعد مهلة، ثم يُترك حتى يظهر النص مرة أخرى
        keys.forEach(k => { if (!dict[k]) { const t = (tries.get(k) || 0) + 1; tries.set(k, t); if (t >= MAX_TRIES) pending.delete(k); } });
        applyPending();
        if (dirty) { dirty = false; try { set(dictKey, dict); } catch (e) {} }
        const left = [...pending.keys()].filter(k => !dict[k]);
        if (left.length) { clearTimeout(timer); timer = setTimeout(flush, left.some(k => !tries.get(k)) ? 250 : RETRY_MS); }
    }
    // النوافذ المنبثقة (alert/confirm/prompt) متزامنة: نترجمها من المخزن.
    // [إصلاح 4] سجّل نصوصها مسبقاً بـ SD.preload([...]) لتُترجم في الخلفية. الطلب المتزامن أدناه يبقى
    // ملاذاً أخيراً فقط لنص لم يُسجَّل ولم يترجمه أحد من قبل (يجمّد الصفحة حتى يرد الخادم).
    function trSync(s) {
        const r = lookup(String(s)); if (r != null) return r;
        try {
            const [k, nums] = norm(String(s)), x = new XMLHttpRequest();
            x.open('POST', '/api/ai', false); x.setRequestHeader('Content-Type', 'application/json');
            x.send(JSON.stringify({ mode: 'i18n', lang, strings: [k] }));
            const j = JSON.parse(x.responseText || '{}');
            if (j.map && j.map[k]) { dict[k] = j.map[k]; set(dictKey, dict); return fill(dict[k], nums); }
        } catch (e) {}
        return String(s);
    }
    const nAlert = window.alert.bind(window), nPrompt = window.prompt.bind(window);
    window.alert = m => nAlert(trSync(m));
    window.confirm = m => nativeConfirm(trSync(m));
    window.prompt = (m, d) => nPrompt(trSync(m), d);

    function start() {
        if (document.title && AR.test(document.title)) { const r = lookup(document.title); if (r != null) { if (r !== document.title) document.title = r; } else want(norm(document.title)[0], { e: { getAttribute: () => document.title, setAttribute: (a, v) => { document.title = v; } }, a: 'title' }); }
        walk(document.body);
        new MutationObserver(ms => ms.forEach(m => {
            if (m.type === 'characterData') doText(m.target);
            else if (m.type === 'attributes') doAttrs(m.target);
            else m.addedNodes.forEach(walk);
        })).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
    }
    // نحمّل قاموس اللغة الكامل مرة يومياً حتى لا يرى المستخدم العربية ثم تتبدل
    const fresh = get(dictKey + '_at', 0);
    const boot = () => (document.body ? start() : document.addEventListener('DOMContentLoaded', start));
    if (Date.now() - fresh > 864e5) {
        nativeFetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'i18n_pack', lang }) })
            .then(r => (r.ok ? r.json() : null)).then(j => { if (j && j.map) { Object.assign(dict, j.map); set(dictKey, dict); set(dictKey + '_at', Date.now()); applyPending(); if (document.body) walk(document.body); } }).catch(() => {});
    }
    boot();
})();
