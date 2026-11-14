// نسخ ملفات الموقع إلى dist بعد بناء التنسيق، وتوليد صفحات الأعطال الثابتة (للبحث في جوجل) من قاعدة الأعطال
import fs from 'node:fs';
import vm from 'node:vm';

const SITE_URL = 'https://alfahis.pages.dev';
const PRICES_AS_OF = 'نوفمبر 2026';
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

fs.mkdirSync('dist/js', { recursive: true });
let n = 0;
for (const f of fs.readdirSync('.')) if (/\.(html|png|ico|webmanifest)$/.test(f)) { fs.copyFileSync(f, 'dist/' + f); n++; }
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
  const code = fs.readFileSync('js/00-core.js', 'utf8') + '\n' + fs.readFileSync('js/02-diagnosis.js', 'utf8') + '\n;globalThis.__KB = CAR_KB;';
  vm.runInContext(code, sandbox, { filename: 'kb-load' });
  return sandbox.__KB;
}
const KB = loadKb();
if (!Array.isArray(KB) || KB.length < 10) { console.error('قاعدة الأعطال فارغة أو غير مقروءة'); process.exit(1); }

const SEV = { safe: ['آمن للسير', 'التشخيص المبدئي يشير إلى عطل لا يمنع القيادة، لكن لا تؤجل الفحص طويلاً.'], caution: ['أصلحه قريباً', 'يُنصح بفحصه وإصلاحه قريباً حتى لا يتحول إلى عطل أكبر.'], stop: ['توقف فوراً', 'هذا العطل قد يكون خطراً. لا تواصل القيادة قبل فحصه عند فني.'] };
const round10 = x => Math.max(10, Math.round(x / 10) * 10);
function priceRange(k) {
  if (k.noPrice) return null;
  const base = (k.parts || []).filter(p => !String(p[0]).includes('عند الحاجة')).reduce((a, p) => a + (+p[1] || 0), 0) + (+k.labor || 0);
  if (!(base > 0)) return null;
  return [round10(base * 0.8), round10(base * 1.4)];   // نطاق تقريبي فقط، لا سعر دقيق
}
const css = '<link rel="stylesheet" href="/style.css">';
const head = (title, desc, url) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}">${css}<style>body{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;background:#F8FAFC;color:#0F172A;margin:0}main{max-width:640px;margin:0 auto;padding:16px}h1{font-size:22px;margin:8px 0}h2{font-size:16px;margin:18px 0 6px}p,li{line-height:1.8;font-size:15px}a.btn{display:block;text-align:center;background:#1D4ED8;color:#fff;font-weight:800;border-radius:12px;padding:12px;text-decoration:none;margin:16px 0}.box{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:12px;margin:10px 0}.stop{background:#FEF2F2;border-color:#FECACA}small{color:#64748B}</style></head><body><main>`;
const foot = `<p><small>معلومات مبدئية للتوعية ولا تغني عن فحص الفني. الأسعار تقديرية.</small></p><p><a href="/">الفاحص الذكي</a> · <a href="/faults/index.html">دليل الأعطال</a></p></main></body></html>`;

fs.mkdirSync('dist/faults', { recursive: true });
const ids = new Set(); const rows = [];
for (const k of KB) {
  if (!k || !k.id || !/^[a-z0-9_-]+$/i.test(k.id) || ids.has(k.id)) { console.error('معرّف عطل غير صالح أو مكرر:', k && k.id); process.exit(1); }
  ids.add(k.id);
  const url = `${SITE_URL}/faults/${k.id}.html`, sev = SEV[k.sev] || SEV.caution, pr = priceRange(k);
  const desc = `${k.title}: الأعراض والخطورة والتكلفة التقريبية في السعودية والخليج. ${sev[0]}.`;
  const parts = (k.parts || []).map(p => `<li>${esc(String(p[0]))}</li>`).join('');
  const html = head(k.title + ' | الفاحص الذكي', desc, url)
    + `<h1>${esc(k.title)}</h1><div class="box ${k.sev === 'stop' ? 'stop' : ''}"><b>الخطورة: ${esc(sev[0])}</b><p>${esc(sev[1])}</p></div>`
    + (k.advice ? `<h2>نصيحة</h2><p>${esc(k.advice)}</p>` : '')
    + (parts ? `<h2>القطع المرتبطة عادة</h2><ul>${parts}</ul>` : '')
    + (pr ? `<h2>التكلفة التقريبية</h2><p>من ${pr[0]} إلى ${pr[1]} ريال سعودي تقريباً شاملة القطع وأجرة اليد، وتختلف حسب السيارة والمدينة. (تقدير ${PRICES_AS_OF})</p>` : '')
    + `<a class="btn" href="/?q=${encodeURIComponent(k.title)}">شخّص سيارتك مجاناً</a>` + foot;
  fs.writeFileSync(`dist/faults/${k.id}.html`, html);
  rows.push([k.id, k.title]);
}
fs.writeFileSync('dist/faults/index.html', head('دليل أعطال السيارات | الفاحص الذكي', 'قائمة بأشهر أعطال السيارات وأعراضها وخطورتها وتكلفتها التقريبية.', SITE_URL + '/faults/index.html')
  + `<h1>دليل أعطال السيارات</h1><ul>${rows.map(([id, t]) => `<li><a href="/faults/${id}.html">${esc(t)}</a></li>`).join('')}</ul>` + foot);
const urls = [SITE_URL + '/', SITE_URL + '/faults/index.html'].concat(rows.map(([id]) => `${SITE_URL}/faults/${id}.html`));
fs.writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`);

// فحص تطابق العدد: صفحة لكل عطل بالضبط
const made = fs.readdirSync('dist/faults').filter(f => f.endsWith('.html') && f !== 'index.html').length;
if (made !== KB.length) { console.error(`عدد الصفحات (${made}) لا يطابق عدد الأعطال (${KB.length})`); process.exit(1); }
console.log(`build: نُسخ ${n} ملفاً، وولّدت ${made} صفحة عطل + الفهرس + sitemap + robots`);
