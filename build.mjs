// نسخ ملفات الموقع إلى dist بعد بناء التنسيق، وتوليد صفحات الأعطال الثابتة (للبحث في جوجل) من قاعدة الأعطال
import fs from 'node:fs';
import vm from 'node:vm';

const SITE_URL = 'https://afhasnow.com';
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

fs.mkdirSync('dist/js', { recursive: true });
let n = 0;
for (const f of fs.readdirSync('.')) if (/\.(html|png|ico|webmanifest)$|^sw\.js$/.test(f)) { fs.copyFileSync(f, 'dist/' + f); n++; }
for (const f of fs.readdirSync('js')) if (f.endsWith('.js')) { fs.copyFileSync('js/' + f, 'dist/js/' + f); n++; }

// كل ملف js مذكور في الصفحات موجود فعلاً
for (const page of ['index.html', 'tools.html']) {
  if (!fs.existsSync(page)) continue;
  const html = fs.readFileSync(page, 'utf8');
  const missing = [...html.matchAll(/src="(js\/[^"?]+)/g)].map(m => m[1]).filter(p => !fs.existsSync(p));
  if (missing.length) { console.error('ملفات مفقودة في ' + page + ':', missing.join(', ')); process.exit(1); }
}

// ---------- قاعدة الأعطال: نقرأ CAR_KB من الكود نفسه بدون تشغيل الصفحة ----------
function loadKb() {
  const noop = () => {};
  const el = () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop }, appendChild: noop, addEventListener: noop, setAttribute: noop });
  const sandbox = { console, document: { addEventListener: noop, createElement: el, querySelector: () => null, getElementById: () => null, body: el(), documentElement: el() },
    location: { protocol: 'https:', pathname: '/', search: '' }, navigator: { userAgent: 'build' }, localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    fetch: () => Promise.reject(new Error('no net')), setTimeout, clearTimeout, URLSearchParams, Intl, Date, Math, JSON };
  sandbox.window = sandbox; sandbox.addEventListener = noop;
  vm.createContext(sandbox);
  const code = fs.readFileSync('js/00-core.js', 'utf8') + '\n' + fs.readFileSync('js/01-countries.js', 'utf8') + '\n' + fs.readFileSync('js/02-diagnosis.js', 'utf8') + '\n;globalThis.__KB = CAR_KB; globalThis.__C = COUNTRIES;';
  vm.runInContext(code, sandbox, { filename: 'kb-load' });
  CTRY = sandbox.__C;
  return sandbox.__KB;
}
let CTRY = null;
const KB = loadKb();
if (!Array.isArray(KB) || KB.length < 10) { console.error('قاعدة الأعطال فارغة أو غير مقروءة'); process.exit(1); }

const SEV = { safe: ['آمن للسير', 'التشخيص المبدئي يشير إلى عطل لا يمنع القيادة، لكن لا تؤجل الفحص طويلاً.'], caution: ['أصلحه قريباً', 'يُنصح بفحصه وإصلاحه قريباً حتى لا يتحول إلى عطل أكبر.'], stop: ['توقف فوراً', 'هذا العطل قد يكون خطراً. لا تواصل القيادة قبل فحصه عند فني.'] };
const css = '<link rel="stylesheet" href="/style.css">';
const head = (title, desc, url) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}">${css}<style>body{font-family:"IBM Plex Sans Arabic",system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;background:#F8FAFC;color:#0F172A;margin:0}main{max-width:640px;margin:0 auto;padding:16px}h1{font-size:22px;margin:8px 0}h2{font-size:16px;margin:18px 0 6px}p,li{line-height:1.8;font-size:15px}a.btn{display:block;text-align:center;background:#1D4ED8;color:#fff;font-weight:800;border-radius:12px;padding:12px;text-decoration:none;margin:16px 0}.box{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:12px;margin:10px 0}.stop{background:#FEF2F2;border-color:#FECACA}small{color:#64748B}ul{list-style:disc;padding-inline-start:22px}ol{list-style:decimal;padding-inline-start:22px}main a:not(.btn){color:#1D4ED8;text-decoration:underline}h2{font-weight:700}</style><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;700&display=swap" rel="stylesheet"></head><body><main>`;
const nav = `<p><a href="/">افحص الآن</a> · <a href="/faults/">دليل الأعطال</a> · ` + 'sa,ae,kw,qa,bh,om'.split(',').map(c => `<a href="/${c}">${{ sa: 'السعودية', ae: 'الإمارات', kw: 'الكويت', qa: 'قطر', bh: 'البحرين', om: 'عُمان' }[c]}</a>`).join(' · ') + `</p>`;
const foot = `<p><small>معلومات مبدئية للتوعية ولا تغني عن فحص الفني.</small></p>${nav}</main></body></html>`;
const ld = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const crumbs = list => ld({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) });
const faq = qa => ld({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
// هل يمكن القيادة؟ إرشاد سلامة عام حسب الخطورة (تحذيرات السلامة مجانية دائماً)
const DRIVE = {
  stop: 'لا. أوقف السيارة في مكان آمن وأطفئ المحرك، ولا تكمل القيادة قبل فحصها عند فني. الاستمرار قد يسبب حادثاً أو تلفاً كبيراً ومكلفاً.',
  caution: 'لمسافات قصيرة وبحذر فقط حتى تفحصها. راقب المؤشرات والأصوات، وإن ساءت الأعراض أو ظهرت لمبة حمراء فتوقف فوراً.',
  safe: 'غالباً نعم، فالعطل لا يمنع القيادة عادة. لكن لا تؤجل الفحص طويلاً حتى لا يتحول إلى عطل أكبر وأغلى.'
};

fs.mkdirSync('dist/faults', { recursive: true });
const ids = new Set(); const rows = [];
for (const k of KB) {
  if (!k || !k.id || !/^[a-z0-9_-]+$/i.test(k.id) || ids.has(k.id)) { console.error('معرّف عطل غير صالح أو مكرر:', k && k.id); process.exit(1); }
  ids.add(k.id);
}
for (const k of KB) {
  // الصفحة العلنية: الاسم والخطورة وإرشاد السلامة والأكواد فقط. القطع والأسعار والنصيحة والتفاوض ضمن الخدمات المدفوعة ولا تُنشر هنا
  const url = `${SITE_URL}/faults/${k.id}`, sev = SEV[k.sev] || SEV.caution, drive = DRIVE[k.sev] || DRIVE.caution;
  const codes = (k.codes || []).filter(c => /^[PBCU]\d{4}$/.test(c));
  const words = Object.entries(k.kw || {}).filter(([w, v]) => v >= 3 && w.length > 2).map(([w]) => w).slice(0, 6);
  const related = KB.filter(o => o.id !== k.id && ((o.codes || []).some(c => codes.includes(c)) || o.sev === k.sev)).slice(0, 5);
  const desc = `${k.title}: هل القيادة آمنة؟ درجة الخطورة ${sev[0]}${codes.length ? '، وأكواد العطل ' + codes.slice(0, 3).join(' و') : ''}. شخّص سيارتك مجاناً قبل الورشة.`;
  const qa = [[`هل أستطيع القيادة مع ${k.title}؟`, drive], [`ما درجة خطورة ${k.title}؟`, `${sev[0]}. ${sev[1]}`]];
  if (codes.length) qa.push([`ما أكواد الكمبيوتر المرتبطة بهذا العطل؟`, `قد يظهر عند قراءة كمبيوتر السيارة (OBD) أحد الأكواد: ${codes.join('، ')}. الكود وحده لا يكفي، والتشخيص يربطه بالأعراض.`]);
  qa.push([`كيف أتأكد أن هذا عطل سيارتي؟`, 'اكتب الأعراض في منصة افحص الآن كما تسمعها أو تراها، أو سجّل صوت المحرك، وستعرف التشخيص الأقرب ودرجة الخطورة مجاناً.']);
  const html = head(`${k.title}: هل القيادة آمنة؟ | افحص الآن`, desc, url)
    + crumbs([['افحص الآن', SITE_URL + '/'], ['دليل الأعطال', SITE_URL + '/faults/'], [k.title, url]]) + faq(qa)
    + `<p><small><a href="/faults/">دليل الأعطال</a> ‹ ${esc(k.title)}</small></p><h1>${esc(k.title)}</h1>`
    + `<div class="box ${k.sev === 'stop' ? 'stop' : ''}"><b>الخطورة: ${esc(sev[0])}</b><p>${esc(sev[1])}</p></div>`
    + `<h2>هل أستطيع القيادة؟</h2><p>${esc(drive)}</p>`
    + (words.length ? `<h2>كيف يصفه الناس؟</h2><p>كلمات شائعة يستخدمها أصحاب السيارات عند هذا العطل: ${words.map(w => '«' + esc(w) + '»').join('، ')}.</p>` : '')
    + (codes.length ? `<h2>أكواد العطل المرتبطة</h2><p>قد يظهر عند قراءة كمبيوتر السيارة (OBD) أحد الأكواد: <b dir="ltr">${codes.join(' · ')}</b>. الكود وحده لا يحدد القطعة التالفة، والتشخيص يربطه بالأعراض.</p>` : '')
    + `<h2>ماذا تفعل الآن؟</h2><ol><li>صف الأعراض في المنصة كما تسمعها أو تراها.</li><li>اعرف التشخيص الأقرب ودرجة الخطورة مجاناً.</li><li>قبل الورشة، اعرف القطع المطلوبة والسعر العادل لتتجنب الاستغلال.</li></ol>`
    + `<a class="btn" href="/?q=${encodeURIComponent(k.title)}">شخّص سيارتك مجاناً</a>`
    + (related.length ? `<h2>أعطال قريبة</h2><ul>${related.map(o => `<li><a href="/faults/${o.id}">${esc(o.title)}</a></li>`).join('')}</ul>` : '')
    + foot;
  fs.writeFileSync(`dist/faults/${k.id}.html`, html);
  rows.push([k.id, k.title, k.sev]);
}
const group = s => rows.filter(r => (SEV[r[2]] ? r[2] : 'caution') === s);
fs.writeFileSync('dist/faults/index.html', head('دليل أعطال السيارات ودرجة خطورتها | افحص الآن', 'دليل بأشهر أعطال السيارات، ودرجة خطورة كل عطل، وهل يمكنك القيادة معه. شخّص سيارتك مجاناً قبل الورشة.', SITE_URL + '/faults/')
  + crumbs([['افحص الآن', SITE_URL + '/'], ['دليل الأعطال', SITE_URL + '/faults/']])
  + `<h1>دليل أعطال السيارات</h1><p>اختر العطل لتعرف درجة خطورته وهل يمكنك القيادة معه.</p>`
  + ['stop', 'caution', 'safe'].map(s => group(s).length ? `<h2>${SEV[s][0]}</h2><ul>${group(s).map(([id, t]) => `<li><a href="/faults/${id}">${esc(t)}</a></li>`).join('')}</ul>` : '').join('')
  + foot);

// ---------- صفحة لكل دولة خليجية (/sa ...) ----------
const GCC = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM'];
const countryUrls = [];
for (const cc of GCC) {
  const c = CTRY[cc]; if (!c || !c.name) { console.error('دولة ناقصة في js/01-countries.js:', cc); process.exit(1); }
  const slug = cc.toLowerCase(), url = `${SITE_URL}/${slug}`, cities = (c.cities || []).slice(0, 12);
  const desc = `منصة فحص السيارات في ${c.name}: شخّص عطل سيارتك واعرف السعر العادل للصيانة بعملة ${c.cur}، وافحص السيارة المستعملة قبل الشراء. أول تشخيصين مجاناً.`;
  const html = head(`فحص السيارات في ${c.name}: شخّص العطل واعرف السعر العادل | افحص الآن`, desc, url)
    + crumbs([['افحص الآن', SITE_URL + '/'], [c.name, url]])
    + `<h1>منصة فحص السيارات في ${esc(c.name)}</h1>`
    + `<p>منصة إلكترونية لفحص السيارات وتقديم الاستشارات قبل التوجه للورش أو مراكز الفحص المعتمدة في ${esc(c.name)}، لتعرف العطل والسعر العادل وتتجنب الاستغلال في الصيانة.</p>`
    + `<a class="btn" href="/">ابدأ فحصاً مجانياً</a>`
    + `<h2>ماذا تقدم المنصة؟</h2><ul><li>تشخيص العطل من وصفك أو صوت المحرك أو كود الكمبيوتر، مع درجة الخطورة.</li><li>القطع المطلوبة والسعر العادل وأجرة اليد بعملة ${esc(c.cur)}.</li><li>فحص السيارة المستعملة قبل الشراء بنفسك أو عن بعد، مع تقرير وحجة للتفاوض.</li><li>أول تشخيصين مجاناً، وتحذيرات السلامة مجانية دائماً.</li></ul>`
    + (cities.length ? `<h2>المدن</h2><p>تعمل المنصة في كل مدن ${esc(c.name)}، ومنها: ${cities.map(esc).join('، ')}.</p>` : '')
    + ((c.emergency || []).length ? `<h2>أرقام الطوارئ في ${esc(c.name)}</h2><ul>${c.emergency.map(([n, t]) => `<li>${esc(n)}: <b dir="ltr">${esc(t)}</b></li>`).join('')}</ul>` : '')
    + `<h2>أشهر الأعطال</h2><ul>${rows.slice(0, 8).map(([id, t]) => `<li><a href="/faults/${id}">${esc(t)}</a></li>`).join('')}</ul>`
    + foot;
  fs.writeFileSync(`dist/${slug}.html`, html);
  countryUrls.push(url);
}

const urls = [SITE_URL + '/', SITE_URL + '/inspect', SITE_URL + '/tools', SITE_URL + '/faults/'].concat(countryUrls, rows.map(([id]) => `${SITE_URL}/faults/${id}`));
fs.writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`);

// فحص تطابق العدد: صفحة لكل عطل بالضبط
const made = fs.readdirSync('dist/faults').filter(f => f.endsWith('.html') && f !== 'index.html').length;
if (made !== KB.length) { console.error(`عدد الصفحات (${made}) لا يطابق عدد الأعطال (${KB.length})`); process.exit(1); }
console.log(`build: نُسخ ${n} ملفاً، وولّدت ${made} صفحة عطل + الفهرس + sitemap + robots`);
