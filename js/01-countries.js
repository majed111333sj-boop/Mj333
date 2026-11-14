// الفاحص الذكي · الدول والمدن والعملات
// جزء من index.html، يُحمَّل بالترتيب: كل الملفات تشترك في نفس النطاق العام

// 🌍 الدول والمدن
// idx = مستوى الأسعار مقارنة بالسعودية، rate = سعر الصرف من الريال السعودي
// =====================================================================
const COUNTRIES = {
    SA: { name: 'السعودية', flag: '🇸🇦', cur: 'ر.س', code: 'SAR', rate: 1, idx: 1.0, dial: '966', dec: 0,
          emergency: [['الطوارئ الموحد', '911'], ['الهلال الأحمر', '997'], ['نجم (حوادث المرور)', '920000560']],
          cities: ['الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'الأحساء', 'الطائف', 'تبوك', 'بريدة', 'أبها', 'خميس مشيط', 'حائل', 'جازان', 'نجران', 'ينبع', 'الجبيل'] },
    AE: { name: 'الإمارات', flag: '🇦🇪', cur: 'د.إ', code: 'AED', rate: 0.9793, idx: 1.1, dial: '971', dec: 0,
          emergency: [['الشرطة', '999'], ['الإسعاف', '998'], ['الدفاع المدني', '997']],
          cities: ['دبي', 'أبوظبي', 'الشارقة', 'عجمان', 'العين', 'رأس الخيمة', 'الفجيرة', 'أم القيوين'] },
    KW: { name: 'الكويت', flag: '🇰🇼', cur: 'د.ك', code: 'KWD', rate: 0.0819, idx: 1.1, dial: '965', dec: 1,
          emergency: [['الطوارئ', '112']],
          cities: ['مدينة الكويت', 'حولي', 'الفروانية', 'الجهراء', 'الأحمدي', 'مبارك الكبير'] },
    QA: { name: 'قطر', flag: '🇶🇦', cur: 'ر.ق', code: 'QAR', rate: 0.9707, idx: 1.15, dial: '974', dec: 0,
          emergency: [['الطوارئ', '999']],
          cities: ['الدوحة', 'الريان', 'الوكرة', 'الخور', 'أم صلال'] },
    BH: { name: 'البحرين', flag: '🇧🇭', cur: 'د.ب', code: 'BHD', rate: 0.1003, idx: 1.0, dial: '973', dec: 1,
          emergency: [['الطوارئ', '999']],
          cities: ['المنامة', 'المحرق', 'الرفاع', 'مدينة حمد', 'مدينة عيسى'] },
    OM: { name: 'عُمان', flag: '🇴🇲', cur: 'ر.ع', code: 'OMR', rate: 0.1025, idx: 0.95, dial: '968', dec: 1,
          emergency: [['الطوارئ', '9999']],
          cities: ['مسقط', 'صلالة', 'صحار', 'نزوى', 'صور', 'البريمي'] },
    // ===== المناطق الأخرى: المدن بلغتها، والتكلفة فيها نطاق تقديري من الخادم بعملة الدولة =====
    // rate و idx هنا تقدير أولي يُستخدم فقط إن تعذّر الاتصال بالذكاء الاصطناعي
    US: { region: 'us', name: 'الولايات المتحدة', flag: '🇺🇸', cur: '$', code: 'USD', rate: 0.2667, idx: 2.0, dial: '1', dec: 0, emergency: [['الطوارئ', '911']],
          cities: ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'Miami', 'Atlanta', 'Seattle', 'Other'] },
    DE: { region: 'eu', name: 'ألمانيا', flag: '🇩🇪', cur: '€', code: 'EUR', rate: 0.245, idx: 2.2, dial: '49', dec: 0, emergency: [['الطوارئ', '112']], cities: ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt', 'Stuttgart', 'Andere'] },
    FR: { region: 'eu', name: 'فرنسا', flag: '🇫🇷', cur: '€', code: 'EUR', rate: 0.245, idx: 2.0, dial: '33', dec: 0, emergency: [['الطوارئ', '112']], cities: ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Lille', 'Autre'] },
    GB: { region: 'eu', name: 'المملكة المتحدة', flag: '🇬🇧', cur: '£', code: 'GBP', rate: 0.21, idx: 2.0, dial: '44', dec: 0, emergency: [['الطوارئ', '999']], cities: ['London', 'Birmingham', 'Manchester', 'Glasgow', 'Leeds', 'Liverpool', 'Other'] },
    IT: { region: 'eu', name: 'إيطاليا', flag: '🇮🇹', cur: '€', code: 'EUR', rate: 0.245, idx: 1.8, dial: '39', dec: 0, emergency: [['الطوارئ', '112']], cities: ['Roma', 'Milano', 'Napoli', 'Torino', 'Bologna', 'Firenze', 'Altro'] },
    ES: { region: 'eu', name: 'إسبانيا', flag: '🇪🇸', cur: '€', code: 'EUR', rate: 0.245, idx: 1.6, dial: '34', dec: 0, emergency: [['الطوارئ', '112']], cities: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Málaga', 'Otra'] },
    NL: { region: 'eu', name: 'هولندا', flag: '🇳🇱', cur: '€', code: 'EUR', rate: 0.245, idx: 2.1, dial: '31', dec: 0, emergency: [['الطوارئ', '112']], cities: ['Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht', 'Eindhoven', 'Other'] },
    BE: { region: 'eu', name: 'بلجيكا', flag: '🇧🇪', cur: '€', code: 'EUR', rate: 0.245, idx: 2.0, dial: '32', dec: 0, emergency: [['الطوارئ', '112']], cities: ['Bruxelles', 'Antwerpen', 'Gent', 'Liège', 'Autre'] },
    AT: { region: 'eu', name: 'النمسا', flag: '🇦🇹', cur: '€', code: 'EUR', rate: 0.245, idx: 2.1, dial: '43', dec: 0, emergency: [['الطوارئ', '112']], cities: ['Wien', 'Graz', 'Linz', 'Salzburg', 'Andere'] },
    CH: { region: 'eu', name: 'سويسرا', flag: '🇨🇭', cur: 'CHF', code: 'CHF', rate: 0.235, idx: 2.8, dial: '41', dec: 0, emergency: [['الطوارئ', '112'], ['الإسعاف', '144']], cities: ['Zürich', 'Genève', 'Basel', 'Bern', 'Lausanne', 'Andere'] },
    IE: { region: 'eu', name: 'أيرلندا', flag: '🇮🇪', cur: '€', code: 'EUR', rate: 0.245, idx: 2.0, dial: '353', dec: 0, emergency: [['الطوارئ', '112']], cities: ['Dublin', 'Cork', 'Galway', 'Limerick', 'Other'] },
    PL: { region: 'eu', name: 'بولندا', flag: '🇵🇱', cur: 'zł', code: 'PLN', rate: 1.05, idx: 1.1, dial: '48', dec: 0, emergency: [['الطوارئ', '112']], cities: ['Warszawa', 'Kraków', 'Wrocław', 'Łódź', 'Poznań', 'Gdańsk', 'Inne'] },
    BR: { region: 'latam', name: 'البرازيل', flag: '🇧🇷', cur: 'R$', code: 'BRL', rate: 1.45, idx: 0.9, dial: '55', dec: 0, emergency: [['الشرطة', '190'], ['الإسعاف', '192'], ['الإطفاء', '193']], cities: ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza', 'Belo Horizonte', 'Curitiba', 'Outra'] },
    MX: { region: 'latam', name: 'المكسيك', flag: '🇲🇽', cur: 'MX$', code: 'MXN', rate: 4.9, idx: 0.8, dial: '52', dec: 0, emergency: [['الطوارئ', '911']], cities: ['Ciudad de México', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'Otra'] },
    AR: { region: 'latam', name: 'الأرجنتين', flag: '🇦🇷', cur: 'US$', code: 'USD', rate: 0.2667, idx: 0.7, dial: '54', dec: 0, emergency: [['الطوارئ', '911']], cities: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'Otra'] },
    CO: { region: 'latam', name: 'كولومبيا', flag: '🇨🇴', cur: 'US$', code: 'USD', rate: 0.2667, idx: 0.7, dial: '57', dec: 0, emergency: [['الطوارئ', '123']], cities: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Otra'] },
    CL: { region: 'latam', name: 'تشيلي', flag: '🇨🇱', cur: 'US$', code: 'USD', rate: 0.2667, idx: 0.9, dial: '56', dec: 0, emergency: [['الشرطة', '133'], ['الإسعاف', '131'], ['الإطفاء', '132']], cities: ['Santiago', 'Valparaíso', 'Concepción', 'Otra'] },
    PE: { region: 'latam', name: 'بيرو', flag: '🇵🇪', cur: 'US$', code: 'USD', rate: 0.2667, idx: 0.7, dial: '51', dec: 0, emergency: [['الشرطة', '105'], ['الإسعاف', '106'], ['الإطفاء', '116']], cities: ['Lima', 'Arequipa', 'Trujillo', 'Otra'] }
};
const REGION_NAMES = { mena: 'الشرق الأوسط', eu: 'أوروبا', us: 'أمريكا الشمالية', latam: 'أمريكا اللاتينية' };
const regionOf = k => (COUNTRIES[k] && COUNTRIES[k].region) || 'mena';
const BIG_CITIES = ['الرياض', 'جدة', 'الدمام', 'دبي', 'أبوظبي', 'الدوحة', 'مدينة الكويت', 'المنامة', 'مسقط'];

let LOC = store.get('sd_loc', null);
function C() { return COUNTRIES[(LOC && COUNTRIES[LOC.country]) ? LOC.country : 'SA']; }
function cityName() { return (LOC && LOC.city) || C().cities[0]; }
function cityFactor() { return BIG_CITIES.includes(cityName()) ? 1.05 : 1.0; }
// سعر مرجعي بالريال السعودي → سعر محلي تقديري للدولة والمدينة الحالية
function localPrice(sar) { return sar * C().idx * cityFactor() * C().rate; }
function fmtLocal(v) {
    const c = C();
    return Number(v).toLocaleString('en', { maximumFractionDigits: c.dec, minimumFractionDigits: 0 }) + ' ' + c.cur;
}
function fmtSar(sar) { return fmtLocal(localPrice(sar)); }

function fillCountrySelect(id, selected) {
    const s = $(id); s.innerHTML = '';
    // مجموعة لكل منطقة: الشرق الأوسط، أوروبا، أمريكا الشمالية، أمريكا اللاتينية
    Object.keys(REGION_NAMES).forEach(r => {
        const g = document.createElement('optgroup'); g.label = REGION_NAMES[r];
        Object.entries(COUNTRIES).filter(([k]) => regionOf(k) === r).forEach(([k, c]) => { const o = el('option', null, c.flag + ' ' + c.name); o.value = k; g.appendChild(o); });
        s.appendChild(g);
    });
    s.value = selected || (LOC ? LOC.country : 'SA');
}
function fillLangSelect(cc) {
    const s = $('loc-lang'); if (!s || !window.SD) return;
    s.innerHTML = ''; Object.entries(SD.LANGS).forEach(([k, n]) => { const o = el('option', null, n); o.value = k; o.setAttribute('data-noi18n', ''); s.appendChild(o); });
    s.value = store.get('sd_lang', null) || SD.defaultLang(cc);
}
function onCountryPicked(cc) { fillCitySelect('loc-city', cc); const s = $('loc-lang'); if (s && window.SD) s.value = SD.defaultLang(cc); }
function fillCitySelect(id, country, selected) {
    const s = $(id); s.innerHTML = '';
    COUNTRIES[country].cities.forEach(ct => s.appendChild(el('option', null, ct)));
    if (selected && COUNTRIES[country].cities.includes(selected)) s.value = selected;
}
function openLocationModal(suggest) {
    const cc = (LOC && LOC.country) || (suggest && COUNTRIES[suggest] ? suggest : 'SA');
    fillCountrySelect('loc-country', cc);
    fillCitySelect('loc-city', $('loc-country').value, LOC && LOC.city);
    fillLangSelect(cc);
    if (!LOC && suggest && COUNTRIES[suggest] && $('loc-lang') && window.SD) $('loc-lang').value = SD.defaultLang(suggest);
    openModal('location-modal');
}
function saveLocationFromModal() {
    const prev = LOC ? LOC.country : null, prevLang = (window.SD && SD.lang) || 'ar';
    LOC = { country: $('loc-country').value, city: $('loc-city').value };
    store.set('sd_loc', LOC);
    const lang = ($('loc-lang') && $('loc-lang').value) || prevLang;
    store.set('sd_lang', lang);
    closeModal('location-modal');
    // تغيير الدولة أو اللغة يبدّل النسخة (العملة، والأسعار، واللغة، والخصوصية): نعيد التحميل لتُطبَّق كاملة
    if (window.SD && (LOC.country !== SD.cc || lang !== prevLang) && location.protocol !== 'file:') { location.reload(); return; }
    onLocationChanged();
}
// أول زيارة: نقترح الدولة من موقع المستخدم (من الشبكة، بلا إذن GPS)، وهو يؤكد أو يغيّر
async function suggestLocation() {
    let cc = null;
    try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 2500);
        const r = await fetch(AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify({ mode: 'geo' }) });
        clearTimeout(t); const j = r.ok ? await r.json() : null; if (j && j.supported) cc = j.country;
    } catch (e) {}
    openLocationModal(cc);
}
function onLocationChanged() {
    const c = C();
    $('loc-chip').textContent = c.flag + ' ' + cityName();
    document.querySelectorAll('.city-name').forEach(e => e.textContent = cityName());
    document.querySelectorAll('.country-name').forEach(e => e.textContent = c.name);
    const em = $('emergency-numbers'); em.innerHTML = '';
    c.emergency.forEach(([label, num]) => {
        const a = el('a', 'bg-red-600/90 rounded-xl p-2.5 text-center block');
        a.href = 'tel:' + num;
        a.appendChild(el('span', 'block text-[10px] text-red-100', label));
        a.appendChild(el('span', 'block font-black font-mono text-lg', num));
        em.appendChild(a);
    });
    renderMoney();
    if (lastDiag) renderNegotiator();
    if (typeof renderPriceLookup === 'function') { refreshPrices(); }
    if (typeof Providers !== 'undefined') Providers.onLocation();
}
function renderMoney() {
    document.querySelectorAll('[data-sar]').forEach(e => { e.textContent = fmtSar(parseFloat(e.dataset.sar)); });
}

// ---------- التبويبات ----------
const TABS = ['diagnose', 'prices', 'emergency', 'mine'];
function switchTab(t) {
    TABS.forEach(id => {
        $('tab-' + id).classList.toggle('hidden', id !== t);
        $('nav-' + id).classList.toggle('active', id === t);
    });
    if (t === 'mine') { renderMine(); $('mine-dot').classList.add('hidden'); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =====================================================================
