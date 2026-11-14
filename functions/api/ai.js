// نسخة Cloudflare Pages Functions من دالة الذكاء الاصطناعي (المسار: /api/ai)
// تعمل بنفس منطق نسخة Vercel، مع واجهات الويب القياسية (Request/Response و Web Crypto)
// دالة الذكاء الاصطناعي على Vercel: تشخيص الأعطال + قراءة الفواتير
// 1) سلسلة احتياطية عند الفشل: الرئيسية ← الخفيفة ← Gemma ← Claude
// 2) ترقية حسب الصعوبة: إذا جاء التشخيص بثقة "منخفضة" يُعاد على نماذج أقوى بالترتيب
// المتغيرات في Vercel (كلها اختيارية ما عدا مفتاح واحد على الأقل):
//   GEMINI_API_KEY / ANTHROPIC_API_KEY
//   GEMINI_MAIN_MODELS     مثال: gemini-3.5-flash-lite
//   GEMINI_LIGHT_MODELS    مثال: gemini-3.1-flash-lite,gemini-flash-lite-latest
//   GEMINI_GEMMA_MODELS    مثال: gemma-4-31b-it
//   GEMINI_ESCALATE_MODELS مثال: gemini-3.6-flash,gemini-3.8-flash
//   AI_PROVIDER = claude   لجعل Claude أولاً
// 3) تخزين مؤقت (اختياري): إذا ربطت Upstash Redis من Vercel يُحفظ التشخيص المتكرر 30 يوماً ويُجاب فوراً بدون ذكاء اصطناعي
//   KV_REST_API_URL + KV_REST_API_TOKEN  (أو UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)

let CLAUDE_MODEL; // يُضبط في initEnv
const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
let MAIN; // يُضبط في initEnv
let LIGHT; // يُضبط في initEnv
let GEMMA; // يُضبط في initEnv
let ESCALATE; // يُضبط في initEnv
const RANK = { low: 0, medium: 1, high: 2 };
// المراجعة الأسبوعية بأقوى نموذج متاح، والتنظيم التلقائي بنموذج ذي حد يومي كبير
let REVIEW_MODELS; // يُضبط في initEnv
let CURATE_MIN_USERS; // يُضبط في initEnv
// النموذج أحياناً يكتب "null" كنص بدل القيمة الفارغة
const realQuestion = q => typeof q === 'string' && q.trim().length > 3 && !/^(null|none|n\/a|undefined|لا يوجد|لا شيء)$/i.test(q.trim());
// ---------- Web Crypto بدل وحدة crypto في Node ----------
const _enc = new TextEncoder();
async function sha256hex(s) { const b = await crypto.subtle.digest('SHA-256', _enc.encode(String(s))); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }

// ---------- التخزين المؤقت (Upstash Redis عبر REST) ----------
let KV_URL; // يُضبط في initEnv
let KV_TOKEN; // يُضبط في initEnv
const CACHE_TTL = 30 * 24 * 3600;   // 30 يوماً

let KV_ERR = false;
async function kv(cmd) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(KV_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + KV_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(cmd), signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) { KV_ERR = true; return null; }
    return (await r.json()).result;
  } catch (e) { KV_ERR = true; return null; }
}

// توحيد النص العربي حتى تتطابق الأوصاف المتشابهة: "السيارة تفتف وترجّ" = "السياره ترج وتفتف"
const STOP = new Set(['و', 'في', 'من', 'على', 'الى', 'عن', 'مع', 'انا', 'وانا', 'هي', 'وهي', 'هو', 'السياره', 'سيارتي', 'سياره', 'فيها', 'فيه', 'لما', 'اذا', 'كذا', 'شوي', 'جدا', 'مره', 'يا', 'ان', 'ما']);
function normKey(t) {
  return String(t || '').toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[^\u0600-\u06FFa-z0-9 ]/g, ' ').split(/\s+/)
    .map(w => w.replace(/^و(?=..)/, '')).filter(w => w && !STOP.has(w))
    .filter((w, i, a) => a.indexOf(w) === i).sort().join(' ');
}
async function cacheKey(body) {
  const make = String(body.car || '').split(' ').slice(0, -1).join(' ');   // الشركة والموديل بدون السنة
  const raw = [normKey(make), normKey(body.description), normKey(body.structured), String(body.code || '').toUpperCase()].join('|');
  return 'diag:v1:' + (await sha256hex(raw)).slice(0, 40);
}

function buildChain(task) {
  const g = ENV.GEMINI_API_KEY, a = ENV.ANTHROPIC_API_KEY;
  const order = (task === 'light' ? LIGHT.concat(MAIN) : MAIN.concat(LIGHT)).concat(GEMMA);
  const gem = g ? [...new Set(order)].map(m => ({ name: 'gemini', key: g, model: m })) : [];
  const cla = a ? [{ name: 'claude', key: a, model: CLAUDE_MODEL }] : [];
  return String(ENV.AI_PROVIDER || '').toLowerCase() === 'claude' ? cla.concat(gem) : gem.concat(cla);
}

// حد بسيط لعدد الطلبات لكل IP (تقريبي، يعمل داخل نفس النسخة من الدالة)
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), windowMs = 10 * 60 * 1000, max = 30;
  const arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
// إزالة أرقام الهوية والجوال السعودية من أي نص يعود للمستخدم أو يُخزَّن
const noPii = t => String(t || '').replace(/\b[12]\d{9}\b/g, '••••').replace(/\b(?:\+?966|0)5\d{8}\b/g, '••••');

function extractJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { return null; }
}

async function post(url, headers, body, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    if (!r.ok) throw new Error(r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200));
    return await r.json();
  } finally { clearTimeout(t); }
}

async function callClaude(s, system, content, maxTokens, ms) {
  const data = await post('https://api.anthropic.com/v1/messages',
    { 'x-api-key': s.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    { model: s.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }, ms);
  return (data.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
}

async function callGemini(s, system, content, maxTokens, ms) {
  const isGemma = s.model.toLowerCase().startsWith('gemma');
  let parts = (Array.isArray(content) ? content : [{ type: 'text', text: content }]).map(c =>
    c.type === 'image' ? { inline_data: { mime_type: c.source.media_type, data: c.source.data } } : { text: c.text });
  const body = { contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: maxTokens + 2048, temperature: 0.3 } };
  if (isGemma) {
    // Gemma لا يدعم تعليمات النظام المنفصلة ولا وضع JSON الإجباري: ندمج التعليمات في الرسالة
    body.contents[0].parts = [{ text: system + '\n\n---\n' }].concat(parts);
  } else {
    body.systemInstruction = { parts: [{ text: system }] };
    body.generationConfig.responseMimeType = 'application/json';
  }
  const data = await post('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(s.model) + ':generateContent',
    { 'x-goog-api-key': s.key, 'content-type': 'application/json' }, body, ms);
  const c = (data.candidates || [])[0];
  return ((c && c.content && c.content.parts) || []).filter(x => x.text && !x.thought).map(x => x.text).join('\n');
}

const callOne = (s, system, content, maxTokens, ms) =>
  s.name === 'gemini' ? callGemini(s, system, content, maxTokens, ms) : callClaude(s, system, content, maxTokens, ms);

// يجرب السلسلة بالترتيب حتى يعطي أحدهم رداً صالحاً، ضمن المهلة الإجمالية
async function callAI(chain, system, content, maxTokens, ctx, valid) {
  let lastErr = new Error('no provider');
  const hasClaude = chain.some(x => x.name === 'claude');
  for (const s of chain) {
    // نحجز 9 ثوانٍ لـ Claude حتى يأخذ فرصته دائماً إن وُجد
    const left = ctx.left() - (s.name === 'gemini' && hasClaude ? 9000 : 0);
    if (left < 2500) continue;
    try {
      const text = await callOne(s, system, content, maxTokens, Math.min(s.name === 'gemini' ? 7000 : 9000, left));
      const data = extractJson(text || '');
      if (data && valid(data)) { console.log('ai ok:', s.name, s.model); return { data, model: s.model }; }
      lastErr = new Error('bad output');
      console.error('ai fail:', s.name, s.model, 'bad output');
    } catch (e) {
      lastErr = e;
      console.error('ai fail:', s.name, s.model, String(e.message || e).slice(0, 200));
    }
  }
  throw lastErr;
}

// التشخيص: السلسلة العادية، ثم الترقية لنماذج أقوى إذا كانت الثقة منخفضة
async function diagnose(prompt, ctx) {
  const valid = j => j && typeof j.title === 'string' && j.title.trim();
  let best = await callAI(buildChain('main'), DIAG_SYSTEM, prompt, 700, ctx, valid);
  const key = ENV.GEMINI_API_KEY;
  for (const m of ESCALATE) {
    if (!key || RANK[best.data.confidence] !== 0) break;      // نترقى فقط إذا كانت الثقة منخفضة
    if (m === best.model) continue;
    if (ctx.left() < 6000) break;
    try {
      const text = await callGemini({ name: 'gemini', key, model: m }, DIAG_SYSTEM, prompt, 700, Math.min(7000, ctx.left() - 1000));
      const data = extractJson(text || '');
      if (valid(data) && (RANK[data.confidence] ?? 0) >= (RANK[best.data.confidence] ?? 0)) {
        console.log('ai escalate ok:', m, data.confidence);
        best = { data, model: m };
      }
    } catch (e) {
      console.error('ai escalate fail:', m, String(e.message || e).slice(0, 200));
    }
  }
  return best;
}

const DIAG_SYSTEM = `أنت فني سيارات خبير في دول الخليج، تساعد مالك السيارة على فهم العطل قبل الذهاب للورشة.
- اكتب بالعربية الواضحة، ويمكنك استخدام مصطلحات الورش الخليجية (كويل، بواجي، دركسون، قير، رديتر…).
- كن صادقاً: إذا كانت المعلومات غير كافية فاجعل الثقة "low" واسأل سؤالاً واحداً يوضح المشكلة.
- السلامة أولاً: إذا كان هناك خطر (حرارة، فرامل، زيت، توجيه، رائحة بنزين) فاجعل severity = "stop" أو "caution" بوضوح.
- لا تخترع أسعاراً.
- اختر kb_id من القائمة المعطاة فقط إذا كان العطل مطابقاً لها فعلاً، وإلا اجعله null.
- استفد من الموديل والسنة والممشى: اذكر الأعطال الشائعة المعروفة لهذا الموديل إن كانت مرتبطة بالأعراض.
- "المعلومات المحددة" اختارها المالك بنفسه، فاعتبرها موثوقة. لمبة الزيت أو الحرارة تعني severity = "stop".
- إذا وُجدت أسئلة سابقة مع إجابات المالك فاستخدمها لتضييق التشخيص، ولا تكرر سؤالاً سبق طرحه؛ اسأل سؤالاً جديداً فقط إذا بقيت الثقة منخفضة.
أجب بكائن JSON فقط بدون أي نص آخر، بهذا الشكل:
{"kb_id": string|null, "title": "اسم العطل المرجّح باختصار", "severity": "safe"|"caution"|"stop", "confidence": "high"|"medium"|"low",
 "explanation": "شرح مبسط في جملتين لسبب ترجيح هذا العطل", "advice": "نصيحة عملية للمالك في جملة أو جملتين",
 "checks": ["فحص محدد يطلبه من الفني", "..."], "question": "سؤال واحد للمالك إذا كانت الثقة منخفضة، وإلا null"}`;


// =====================================================================
// 📷 الفحص بالكاميرا + 📳 تفسير القياسات + 🧾 تقرير الفحص الكامل قبل الشراء
// =====================================================================
const VISION_BASE = `أنت فاحص سيارات محترف في السعودية والخليج، تحلل صوراً التقطها مالك أو مشترٍ بجواله.
قواعد صارمة:
- اذكر فقط ما تراه فعلاً في الصور. إذا كانت الصورة غير واضحة أو لا تُظهر الجزء فقل ذلك وأضف رقمها إلى retake، ولا تخمّن.
- كل ملاحظة: عنوان قصير، ومكانها على السيارة، والخطورة (ok سليم / attention يحتاج انتباه / problem مشكلة)، والثقة (high / medium / low)، ونصيحة عملية للتأكد أو الإصلاح، ورقم الصورة frame (يبدأ من 0).
- لا تصف الوجوه، ولا تقرأ لوحات السيارات، ولا تذكر أي اسم شخص أو رقم هوية أو جوال إن ظهر في الصورة.
- الكاميرا لا تقيس سماكة الدهان ولا ترى الشاصيه من الداخل؛ لا تدّعِ ذلك.
- التاريخ الحالي 2026.
أجب بكائن JSON فقط:
{"verdict":"good|attention|problem","summary":"جملتان","findings":[{"title":"","location":"","severity":"ok|attention|problem","confidence":"high|medium|low","advice":"","frame":0}],"ok":["عناصر سليمة ظاهرة"],"extracted":{"vin":"","dot":[""],"odometer":"","lights":[""],"battery":"","dates":["القطعة: السنة"],"oil":""},"retake":[]}`;
const VISION_KINDS = {
  exterior: `المطلوب: الهيكل الخارجي. افحص: فروق اللون واللمعان بين الألواح المتجاورة (علامة رش)، والفراغات غير المتساوية بين الأبواب والكبوت والرفارف (علامة فك أو حادث)، والطعجات والخدوش، والصدأ خاصة أسفل الأبواب وحول العجلات، وآثار رش على المطاط والزجاج، وتشققات الزجاج، واصفرار أو رطوبة المصابيح، واختلاف علامة أو سنة زجاج عن البقية.`,
  tires: `المطلوب: الكفرات. اقرأ رمز DOT (آخر 4 أرقام: الأسبوع ثم السنة، مثل 2319 = الأسبوع 23 من 2019) واحسب العمر؛ الكفر الأقدم من 5-6 سنوات يحتاج تبديلاً ولو كانت نقشته جيدة. قدّر عمق النقشة. حلّل نمط التآكل: الحافتان معاً = هواء ناقص، الوسط = هواء زائد، حافة واحدة = ميزانية، بقع متقطعة = مساعدات أو اتزان. ابحث عن تشققات جانبية أو انتفاخ، واختلاف الماركات بين الكفرات.`,
  engine: `المطلوب: حجرة المحرك. ابحث عن: تسريبات زيت أو ماء (رطوبة، تراكمات سوداء، بقع)، ولون ومستوى ماء الرديتر إن ظهر، وتشقق السيور والخراطيم، وصدأ أقطاب البطارية، وآثار لحام أو إصلاح في الهيكل الأمامي، وأسلاك معدّلة، ونظافة مفرطة غير طبيعية قد تخفي تسريباً.`,
  interior: `المطلوب: المقصورة. قارن تآكل الدركسون والمقعد والدواسات وعصا القير بالممشى المعلن (تآكل كبير مع ممشى قليل = احتمال تلاعب بالعداد)، واقرأ العداد إن ظهر، وابحث عن رطوبة أو عفن أو صدأ تحت المقاعد (علامة غرق)، وحالة الأزرار والشاشة.`,
  lights: `المطلوب: لمبات الطبلون. حدد كل لمبة مضيئة واسمها ومعناها وخطورتها (أحمر = توقف غالباً، كهرماني = افحص قريباً). إذا كانت الصورة عند تشغيل المفتاح قبل تشغيل المحرك، فالطبيعي أن تضيء معظم اللمبات؛ إن لم تضئ لمبة المحرك أو الوسادة الهوائية فاذكر احتمال فصلها لإخفاء عطل.`,
  vin: `المطلوب: رقم الهيكل من السيارة نفسها (أسفل الزجاج الأمامي أو إطار الباب). اقرأ VIN كاملاً (17 خانة) وضعه في extracted.vin. نبّه لآثار كشط أو لصق أو اختلاف بين الموضعين إن صُوّرا معاً. إن ظهرت ورقة أو بطاقة فيها أسماء فتجاهلها تماماً.`,
  battery: `المطلوب: البطارية. اقرأ تاريخ الصنع من الملصق أو الختم (شهر/سنة أو رمز) وضعه في extracted.battery، واحسب العمر. في حرارة الخليج تعيش البطارية غالباً سنتين إلى ثلاث. افحص صدأ الأقطاب وانتفاخ جسم البطارية وتسرب الحمض.`,
  glass: `المطلوب: تواريخ الزجاج وأحزمة الأمان لكشف القطع المستبدلة. اقرأ سنة الصنع من رمز كل زجاج (رقم السنة أو آخر رقم منها مع نقاط تشير للشهر) ومن ملصق كل حزام أمان، وضعها في extracted.dates بصيغة "القطعة: السنة". قارن بسنة السيارة المعلنة: قطعة أحدث من السيارة بسنة أو أكثر تعني غالباً أنها استُبدلت، وهذا مؤشر حادث محتمل (attention). اختلاف ماركة زجاج عن البقية مؤشر كذلك. إن لم تستطع قراءة الرمز فقل ذلك ولا تخمّن.`,
  oil: `المطلوب: ملصق تغيير الزيت. اقرأ التاريخ، والممشى عند التغيير، والممشى القادم، ونوع الزيت، وضعها في extracted.oil. إذا كان ممشى الملصق أكبر من الممشى المعلن للسيارة فهذا مؤشر قوي على تلاعب بالعداد (problem). ملصق قديم جداً يعني صيانة غير منتظمة.`,
  smoke: `المطلوب: دخان العادم عند التشغيل البارد. لون الدخان: أزرق = حرق زيت، أبيض كثيف مستمر = ماء في الاحتراق (احتمال وجه رأس)، أسود = وقود زائد، بخار خفيف يختفي بعد دقيقة = طبيعي في البرد. ابحث أيضاً عن تسرب أو صدأ في الشكمان.`,
  under: `المطلوب: أسفل السيارة والأرض تحتها. ابحث عن بقع تسريب على الأرض ولونها (أسود/بني زيت، أخضر/وردي ماء رديتر، أحمر زيت قير)، وصدأ الشاصيه الظاهر، وتلف الشكمان، وتمزق جلود العكوس.`,
  general: `المطلوب: فحص عام لما يظهر في الصور من السيارة، بنفس الدقة.`
};
const MEASURE_SYSTEM = `أنت فني سيارات محترف. يصلك قياس من حساسات جوال (ميكروفون أو مستشعر حركة) مع وصف رقمي. فسّره بحذر:
- القياس بالجوال مؤشر وليس جهازاً احترافياً؛ لا تجزم.
- أعطِ الحكم (good/attention/problem)، وعنواناً، وشرحاً مبسطاً، وأرجح الأسباب مرتبة، وما يجب فعله للتأكد.
أجب بكائن JSON فقط: {"verdict":"good|attention|problem","title":"","explanation":"","causes":[""],"advice":""}`;
const INSPECT2_SYSTEM = `أنت فاحص سيارات محترف في السعودية تكتب تقرير فحص قبل الشراء من نتائج مراحل فحص أجراها المشتري بجواله (صور، وقياس صوت واهتزاز، وأكواد، وملاحظات).
- قيّم السيارة من 100: الهيكل والحوادث 30، والمحرك 25، والقير والقيادة 20، والكهرباء والمقصورة 10، والأوراق والصيانة 15. المراحل التي لم تُفحص لا تعاقب عليها لكن اخفض الثقة.
- علامات الخطر: الأهم أولاً، مع المرحلة التي ظهرت فيها.
- العيوب الشائعة لهذا الموديل والسنة والممشى: اذكر فقط ما تعرفه بثقة.
- قدّر تكلفة الإصلاحات بالريال السعودي (قطع تجاري جيد + يد)، واقترح سعر تفاوض واقعياً من السعر المطلوب.
- جملة جاهزة يقولها المشتري للبائع، مهذبة ومبنية على الملاحظات.
- أوزان الأدلة: سماكة الدهان وتواريخ الزجاج والأحزمة أقوى من صور الكاميرا في كشف الحوادث. عدم مطابقة رقم الهيكل للاستمارة أو اختلاف سنة الصنع علامة خطر كبرى. الجاهزية غير المكتملة تعني غالباً أكواداً ممسوحة قبل البيع. ممشى ملصق الزيت الأكبر من العداد يعني تلاعباً محتملاً.
أجب بكائن JSON فقط: {"score":0,"verdict":"good|attention|problem","verdict_label":"","confidence":"high|medium|low","summary":"","red_flags":[{"title":"","stage":"","advice":""}],"common_issues":[""],"repair_cost_sar":0,"offer_price_sar":0,"seller_line":""}`;

const INVOICE_SYSTEM = `أنت تقرأ صور فواتير ورش السيارات وقطع الغيار في دول الخليج.
استخرج بنود القطع وأسعارها كما هي في الفاتورة (السعر النهائي لكل بند بعد الكمية إن وجد)، وأجرة اليد إن وجدت.
أجب بكائن JSON فقط: {"items":[{"name":"اسم القطعة بالعربية","price":number}], "labor": number|null, "total": number|null, "currency": "رمز العملة إن ظهر"|null}
إذا لم تكن الصورة فاتورة واضحة فأرجع {"items":[]}.`;

const PARTS_SHEET_SYSTEM = `أنت خبير قطع غيار سيارات. ستصلك صورة ورقة قطع (عرض سعر أو قائمة قطع أو فاتورة أو رقم قطعة مكتوب).
استخرج كل قطعة: اسمها بالعربية، ورقم القطعة إن ظهر، والكمية، والسعر المكتوب على الورقة إن وجد.
ثم قدّر نطاق السعر العادل للقطعة (أدنى وأعلى) في السوق المحلي بعملة المستخدم للسيارة المذكورة، كتقدير تقريبي لا سعراً مؤكداً. إن لم تستطع التقدير بثقة فاجعله null.
لا تخترع قطعاً غير موجودة في الصورة. أجب بكائن JSON فقط:
{"items":[{"name":"...","part_no":"..."|null,"qty":number,"listed_price":number|null,"fair_min":number|null,"fair_max":number|null}],"currency":"رمز العملة"|null,"note":"ملاحظة قصيرة"|null}
إذا لم تكن الصورة ورقة قطع واضحة فأرجع {"items":[]}.`;

const QUESTIONS_SYSTEM = `أنت فني سيارات خبير في دول الخليج. قبل أن تشخّص، اطرح على المالك أسئلة قصيرة تضيّق الاحتمالات.
- اكتب من 3 إلى 4 أسئلة فقط، بالعربية البسيطة القريبة من اللهجة الخليجية.
- اختر الأسئلة الأكثر تمييزاً بين الأعطال المحتملة لهذا الوصف (مكان الإحساس، متى يظهر، هل يتغير مع السرعة/اللف/الحرارة، لمبات، روائح، ألوان دخان…).
- لا تسأل عن شيء ذكره المالك أو اختاره مسبقاً.
- كل سؤال إما نعم/لا (type = "yesno") أو اختيار (type = "choice") مع 2 إلى 5 خيارات قصيرة جداً (كلمة إلى أربع كلمات).
- اجعل أول سؤال عن أهم معلومة ناقصة، وإذا كان هناك خطر محتمل (حرارة، زيت، فرامل) فاسأل عنه.
أجب بكائن JSON فقط: {"questions":[{"q":"...","type":"yesno"|"choice","options":["..."]}]}`;

// =====================================================================
// 💳 نظام الدفع: خدمة واحدة مجانية لكل مستخدم، ثم "تذكرة وصول كامل" لمدة يوم (أو أيام/سنة)
// =====================================================================
const PAY_MODES = new Set(['wallet', 'use_free', 'redeem', 'codes_create', 'pay_stats', 'pay_webhook', 'tamclaim', 'tam_list', 'tam_decide', 'set_free_choice', 'upgrade', 'use_prices']);
// uses = فحوصات (باقة 3)، days = وصول زمني، rc = فحص مستعملة، tu = استخدامات أدوات. day3 و annual قديمتان: نحترمهما لمن اشتراهما ولا تُباعان
// نموذج 3.2.0: رصيد لكل خدمة (cr). full = الفحص الوافي حتى التقرير، diag = فحص السيارة + قطع الأعطال، upgrade = ترقية فحص إلى الوافي،
// prices = أسعار القطع، toolmain = أداة أساسية (كاميرا/صوت/اهتزاز)، toolsub = أداة فرعية، report = فحص مستعملة، report5 = 5 فحوصات مستعملة (صالحة 6 أشهر)
// المنتجات القديمة (pack3, day, week, tools, day3, annual) لا تُباع لكن تُحترم لمن اشتراها أو لاسترجاعها
const PRODUCTS = {
  full: { cr: { full: 1 } }, diag: { cr: { diag: 1 } }, upgrade: { cr: { upg: 1 } }, prices: { cr: { prices: 1 } },
  toolmain: { cr: { tm: 1 } }, toolsub: { cr: { ts: 1 } }, report: { rc: 1 }, report5: { rc: 5, rcDays: 183 },
  pack3: { uses: 3 }, day: { days: 1 }, week: { days: 7 }, tools: { tu: 5 }, day3: { days: 3 }, annual: { days: 365 }
};
const SELLABLE = ['full', 'diag', 'upgrade', 'prices', 'toolmain', 'toolsub', 'report', 'report5'];
const MAIN_TOOLS = new Set(['camera', 'sound', 'vibration']);   // باقي الأدوات فرعية
const FREE_CHOICES = new Set(['diag_only', 'parts_prices', 'single_tool']);
// المنطقة من رمز الدولة: لروابط الدفع الخاصة بكل منطقة (LEMON_CHECKOUT_<PRODUCT>_<REGION>)
const REGION_OF = (() => {
  const m = {};
  'US CA'.split(' ').forEach(c => m[c] = 'US');
  'GB IE DE FR ES IT NL BE AT PT SE NO DK FI PL CH GR CZ RO HU BG HR SK SI LT LV EE LU MT CY IS'.split(' ').forEach(c => m[c] = 'EU');
  'MX BR AR CL CO PE UY EC BO PY VE CR PA DO GT HN SV NI CU'.split(' ').forEach(c => m[c] = 'LATAM');
  return m;
})();
const regionOf = cc => REGION_OF[String(cc || '').toUpperCase()] || '';
const GATED_FREE = new Set(['diagnose', 'questions', 'inspect', 'vision', 'measure']);   // يُسمح بها ضمن الخدمة المجانية الأولى
const GATED_PAID = new Set(['partcheck', 'invoice', 'parts_sheet']);                // تحتاج وصولاً مدفوعاً دائماً
const validWid = w => typeof w === 'string' && /^w_[a-z0-9]{12,24}$/.test(w);
const validDid = d => typeof d === 'string' && /^[a-z0-9]{4,40}$/.test(d);
// الشبكات في الخليج يتشارك فيها كثيرون نفس العنوان، لذلك نحدّ الهدايا لكل عنوان بـ 3 يومياً بدلاً من منعها
const ipKey = async ip => 'freeipn:' + (await sha256hex(ip)).slice(0, 16);
let FREE_PER_IP_DAY; // يُضبط في initEnv

async function getWallet(wid) { try { return JSON.parse((await kv(['GET', 'w:' + wid])) || '{}'); } catch (e) { return {}; } }
async function setWallet(wid, w) { await kv(['SET', 'w:' + wid, JSON.stringify(w), 'EX', 3 * 365 * 24 * 3600]); }
const passActive = w => (w.pass || 0) > Date.now();
async function freeState(wid, ip, w) {
  if (w.freeDid) return { used: true, did: w.freeDid };
  const n = Number(await kv(['GET', (await ipKey(ip))])) || 0;
  return { used: n >= FREE_PER_IP_DAY, did: null };
}
async function walletView(wid, ip, w, cc) {
  const f = await freeState(wid, ip, w);
  let acc = null;
  try { const a = (await kv(['MGET', 'stat:fb:yes', 'stat:fb:no', 'stat:fb:partial'])) || []; const y = +a[0] || 0, t = y + (+a[1] || 0) + (+a[2] || 0); if (t >= 20) acc = { yes: y, total: t }; } catch (e) {}
  return { passUntil: passActive(w) ? w.pass : 0, freeAvailable: !f.used, freeDid: f.did, freeChoice: w.fc || null, paid: !!w.paid, uses: w.uses || 0, toolUses: w.tu || 0, cr: Object.assign({ full: 0, diag: 0, upg: 0, prices: 0, tm: 0, ts: 0 }, w.cr || {}), unlocked: (w.unl || []).slice(-100), fullUnlocked: (w.ful || []).slice(-100), reports: rcValid(w) ? (w.rc || 0) : 0, links: checkoutLinks(cc), tam: tamLinks(), cfg: appConfig(), accuracy: acc };
}
// حدود القياس قابلة للضبط من متغير VIB_LIMITS بدون تعديل الكود، مثل: {"idle":[0.02,0.05],"drive":[0.04,0.1],"brake":[1.6,2.5]}
// حدود الاهتزاز من بيانات حقيقية: الحد الأول أعلى من 90% من السيارات السليمة المؤكدة،
// والثاني عند أدنى ربع السيارات المؤكد أن فيها مشكلة. لا اقتراح قبل 15 سليمة و 8 فيها مشكلة.
function vibSuggest(rows, current) {
  const q = (arr, p) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))]; };
  const normal = rows.filter(r => r.ok === 'normal').map(r => r.n), problem = rows.filter(r => r.ok === 'problem').map(r => r.n);
  const out = { normal: normal.length, problem: problem.length, current, suggested: null };
  if (normal.length >= 15 && problem.length >= 8) {
    const l1 = q(normal, 0.9), l2 = Math.max(l1 * 1.25, q(problem, 0.25));
    out.suggested = [Math.round(l1 * 1000) / 1000, Math.round(l2 * 1000) / 1000];
    out.overlap = q(problem, 0.25) <= l1;   // تداخل كبير = الجوال لا يميز جيداً في هذا القياس
  }
  return out;
}
function appConfig() {
  const def = { idle: [0.02, 0.05], drive: [0.04, 0.10], brake: [1.6, 2.5] };
  try { const j = JSON.parse(ENV.VIB_LIMITS || '{}'); ['idle', 'drive', 'brake'].forEach(k => { if (Array.isArray(j[k]) && j[k].length === 2 && j[k].every(x => x > 0)) def[k] = j[k].map(Number); }); } catch (e) {}
  return { vib: def };
}
// روابط TamPay (مدى و Apple Pay). لا توجد واجهة برمجية معلنة لـ TamPay، فالتفعيل
// يتم بطلب من العميل برقم العملية، ثم موافقة المالك بضغطة من لوحة الإدارة.
function tamLinks() {
  const l = {};
  SELLABLE.forEach(k => {
    const v = String(ENV['TAMPAY_LINK_' + k.toUpperCase()] || '').trim();
    if (/^https:\/\/tampay\.io\/pay\/[A-Za-z0-9]{4,32}$/.test(v)) l[k] = v;
  });
  return l;
}
// روابط صفحات الدفع (تُضبط من متغيرات البيئة بدون تعديل الكود). Lemon Squeezy افتراضياً، وWhop متى أُضيف لاحقاً.
// الرابط الخاص بالمنطقة LEMON_CHECKOUT_<PRODUCT>_<US|EU|LATAM> يُفضَّل على العام
function checkoutLinks(cc) {
  const l = {}, reg = regionOf(cc);
  const ok = v => /^https:\/\/([a-z0-9-]+\.)*(lemonsqueezy\.com|whop\.com)\//i.test(v);
  SELLABLE.forEach(k => {
    const base = 'LEMON_CHECKOUT_' + k.toUpperCase();
    const v = String((reg && ENV[base + '_' + reg]) || ENV[base] || '').trim();
    if (ok(v)) l[k] = v;
  });
  return l;
}

// =====================================================================
// 🍋 Lemon Squeezy: تفعيل تلقائي فور الدفع عبر Webhook موقّع
// المنتج يُحدَّد من رقم النسخة (variant) القادم من Lemon نفسه، وليس من الرابط، فلا يمكن التلاعب به
// =====================================================================
async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', _enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, _enc.encode(text));
  return [...new Uint8Array(sig)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length || !a.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function variantMap() {   // LEMON_VARIANTS = "123456:day,123457:day3,123458:annual"
  const m = {};
  String(ENV.LEMON_VARIANTS || '').split(',').forEach(x => { const [v, p] = x.split(':').map(y => (y || '').trim()); if (v && PRODUCTS[p]) m[v] = p; });
  return m;
}
// المنتج من اسمه في Lemon (احتياطاً إن لم يُضبط LEMON_VARIANTS): الأخص أولاً
function productFromName(n) {
  n = String(n || '').toLowerCase().replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));   // أرقام عربية ← لاتينية
  if (/(report|used|مستعمل|تقرير)/.test(n)) return /(5|خمس)/.test(n) ? 'report5' : 'report';
  if (/ترقية|ترقيه|upgrade/.test(n)) return 'upgrade';
  if (/أساس|اساس|رئيس|main|basic/.test(n)) return 'toolmain';
  if (/فرعي|فرعى|sub|secondary/.test(n)) return 'toolsub';
  if (/أسعار|اسعار|prices?/.test(n)) return 'prices';
  if (/وافي|وافى|full|شامل/.test(n)) return 'full';
  if (/قطع|عطل|diag/.test(n)) return 'diag';
  if (/tool|أدوات|ادوات/.test(n)) return 'tools';
  if (/pack|باقة\s*3|3\s*فحوص|ثلاث\s*فحوص|three/.test(n)) return 'pack3';
  if (/annual|year|سنة|سنوي/.test(n)) return 'annual';
  if (/week|أسبوع|اسبوع/.test(n)) return 'week';
  if (/3 days|3-day|day3|ثلاثة أيام|3 أيام/.test(n)) return 'day3';
  if (/day|يوم/.test(n)) return 'day';
  return null;
}
async function lemonWebhook(rawBody, signature) {
  const secret = ENV.LEMON_SIGNING_SECRET;
  if (!secret || !KV_URL) return [503, { error: 'not_configured' }];
  if (!safeEqual(await hmacHex(secret, rawBody), String(signature || '').toLowerCase())) return [401, { error: 'bad_signature' }];
  let ev; try { ev = JSON.parse(rawBody); } catch (e) { return [400, { error: 'bad_json' }]; }
  const name = ev.meta && ev.meta.event_name;
  const wid = ev.meta && ev.meta.custom_data && ev.meta.custom_data.wid;
  const a = (ev.data && ev.data.attributes) || {};
  const orderId = String((ev.data && ev.data.id) || '');
  const item = a.first_order_item || {};
  // المنتج: من رقم النسخة إن ضُبط LEMON_VARIANTS، وإلا من اسم المنتج في Lemon (موقّع وموثوق)
  const pname = String((item.product_name || '') + ' ' + (item.variant_name || '')).toLowerCase();
  const product = variantMap()[String(item.variant_id || '')] || productFromName(pname);
  if (!['order_created', 'order_refunded'].includes(name)) return [200, { ok: true, ignored: name }];
  if (!product) { await kv(['SET', 'lemon:unmapped:' + orderId, rawBody.slice(0, 4000), 'EX', 90 * 864e2]); return [200, { ok: true, unmapped: true }]; }
  if (!validWid(wid)) { await kv(['SET', 'lemon:nowallet:' + orderId, JSON.stringify({ product, email: a.user_email || '' }), 'EX', 365 * 864e2]); return [200, { ok: true, no_wallet: true }]; }
  const w = await getWallet(wid);
  if (name === 'order_created') {
    if (a.status && a.status !== 'paid') return [200, { ok: true, pending: a.status }];
    const oid = 'order:lemon:' + orderId;
    if (await kv(['EXISTS', oid])) return [200, { ok: true, duplicate: true }];
    applyProduct(w, product); await setWallet(wid, w);
    await kv(['SET', oid, JSON.stringify({ wid, product, at: Date.now(), test: !!a.test_mode }), 'EX', 2 * 365 * 864e2]);
    await kv(['INCR', 'stat:paid:' + product]);
    return [200, { ok: true }];
  }
  // استرجاع: نخصم ما مُنح بالشراء من المحفظة
  const rid = 'refund:lemon:' + orderId;
  if (await kv(['EXISTS', rid])) return [200, { ok: true, duplicate: true }];
  revertProduct(w, product); await setWallet(wid, w);
  await kv(['SET', rid, '1', 'EX', 2 * 365 * 864e2]); await kv(['INCR', 'stat:refund:' + product]);
  return [200, { ok: true, refunded: true }];
}
function applyProduct(w, product) {
  const p = PRODUCTS[product]; if (!p) return false;
  if (p.days) w.pass = Math.max(w.pass || 0, Date.now()) + p.days * 864e5;
  if (p.rc) { w.rc = (w.rc || 0) + p.rc; w.rcx = Math.max(w.rcx || 0, Date.now() + (p.rcDays || 30) * 864e5); }
  if (p.uses) w.uses = (w.uses || 0) + p.uses;
  if (p.tu) w.tu = (w.tu || 0) + p.tu;
  if (p.cr) { w.cr = w.cr || {}; Object.keys(p.cr).forEach(k => { w.cr[k] = (w.cr[k] || 0) + p.cr[k]; }); }
  w.paid = 1;   // مشترك: يحق له تقييم دقة التشخيص
  return true;
}
// رصيد فحوصات المستعملة صالح خلال مدته (30 يوماً للفحص الواحد، 6 أشهر للحزمة)؛ بلا تاريخ = قديم صالح
const rcValid = w => (w.rc || 0) > 0 && (!w.rcx || w.rcx > Date.now());
// استرجاع المبلغ: نخصم ما مُنح بالشراء (لا ينزل شيء عن الصفر)
function revertProduct(w, product) {
  const p = PRODUCTS[product]; if (!p) return;
  if (p.days) w.pass = Math.max(Date.now(), (w.pass || 0) - p.days * 864e5);
  if (p.rc) w.rc = Math.max(0, (w.rc || 0) - p.rc);
  if (p.uses) w.uses = Math.max(0, (w.uses || 0) - p.uses);
  if (p.tu) w.tu = Math.max(0, (w.tu || 0) - p.tu);
  if (p.cr && w.cr) Object.keys(p.cr).forEach(k => { w.cr[k] = Math.max(0, (w.cr[k] || 0) - p.cr[k]); });
}
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = 'SD-';
  const b = crypto.getRandomValues(new Uint8Array(8)); for (let i = 0; i < 8; i++) c += A[b[i] % A.length];
  return c;
}
// يقرر هل يُسمح بالخدمة: وصول مدفوع فعّال، أو أنها نفس الخدمة المجانية الأولى (نفس المعرف did)
async function accessGate(body, ip) {
  if (!KV_URL || !KV_TOKEN) return { ok: true };                 // نظام الدفع غير مفعّل: لا نعطل المستخدم
  if (!validWid(body.wid)) return { ok: false };
  KV_ERR = false;
  const w = await getWallet(body.wid);
  if (KV_ERR) return { ok: false, busy: true };                  // التخزين متعطل: لا نمنح خدمة مجانية بالخطأ
  if (passActive(w)) return { ok: true };
  const did = validDid(body.did) ? body.did : null;
  const unl = Array.isArray(w.unl) ? w.unl : [];
  const ful = Array.isArray(w.ful) ? w.ful : [];
  if (body.mode === 'partcheck') return { ok: !!(did && ful.includes(did)) };   // قطع الأعطال: فحص وافٍ فقط
  if (body.mode === 'invoice' || body.mode === 'parts_sheet') return pricesAccess(body, w);                     // الأسعار: رصيد أسعار أو مرة مجانية
  if (did && (unl.includes(did) || ful.includes(did))) return { ok: true };      // خدمة سبق خصمها من رصيده أو فُتحت له
  const tool = typeof body.tool === 'string' && /^[a-z_]{2,24}$/.test(body.tool) ? body.tool : null;
  const f = await freeState(body.wid, ip, w);
  if (f.used && f.did === did && did) return { ok: true };         // نفس الخدمة المجانية
  if (!f.used) {                                                    // الخدمة المجانية الواحدة لم تُستخدم بعد
    if (!did) return { ok: false };
    if (body.mode === 'questions') return { ok: true };            // الأسئلة تسبق التشخيص في نفس الخدمة
    w.freeDid = did; await setWallet(body.wid, w);
    await kv(['INCR', (await ipKey(ip))]); await kv(['EXPIRE', (await ipKey(ip)), 24 * 3600]);
    await kv(['INCR', 'stat:free']);
    return { ok: true };
  }
  // انتهت الخدمة المجانية: نخصم من الرصيد المدفوع (فحوصات للتشخيص، واستخدامات الأدوات للأدوات)
  if (!did) return { ok: false };
  const cr = w.cr = w.cr || {};
  if (body.mode === 'questions') return { ok: (cr.full || 0) + (cr.diag || 0) + (w.uses || 0) > 0 };
  if (tool) {   // أداة مستقلة: أساسية (كاميرا/صوت/اهتزاز) أو فرعية، ثم الرصيد القديم
    const key = MAIN_TOOLS.has(tool) ? 'tm' : 'ts';
    if ((cr[key] || 0) > 0) cr[key] -= 1;
    else if ((w.tu || 0) > 0) w.tu -= 1;
    else return { ok: false };
    w.unl = unl.concat(did).slice(-100);
    await setWallet(body.wid, w);
    return { ok: true };
  }
  // تشخيص: الوافي (full) يفتح كل شيء، وفحص السيارة + قطع الأعطال (diag) يكفي للتشخيص؛ والرصيد القديم يعامل كوافٍ
  const wantFull = body.level === 'full';
  let full = false;
  if (wantFull && (cr.full || 0) > 0) { cr.full -= 1; full = true; }
  else if (!wantFull && (cr.diag || 0) > 0) cr.diag -= 1;
  else if ((cr.full || 0) > 0) { cr.full -= 1; full = true; }
  else if ((cr.diag || 0) > 0) cr.diag -= 1;
  else if ((w.uses || 0) > 0) { w.uses -= 1; full = true; }
  else return { ok: false };
  w.unl = unl.concat(did).slice(-100);
  if (full) w.ful = ful.concat(did).slice(-100);
  await setWallet(body.wid, w);
  return { ok: true };
}
// الأسعار (قراءة الفاتورة والمقارنة): رصيد أسعار، أو رصيد قديم، أو مرة مجانية لمن اختارها؛ نفس did لا يخصم مرتين
async function pricesAccess(body, w) {
  const did = validDid(body.did) ? body.did : null;
  const pu = Array.isArray(w.pu) ? w.pu : [];
  if (did && pu.includes(did)) return { ok: true };
  w.cr = w.cr || {};
  if ((w.cr.prices || 0) > 0) w.cr.prices -= 1;
  else if ((w.uses || 0) > 0) w.uses -= 1;
  else if (w.fc === 'parts_prices' && w.freeDid && !w.fpu) w.fpu = 1;
  else return { ok: false };
  w.pu = did ? pu.concat(did).slice(-50) : pu;
  await setWallet(body.wid, w);
  return { ok: true };
}

async function payHandler(body, ip, res) {
  if (!KV_URL || !KV_TOKEN) return res.status(503).json({ error: 'not_configured' });
  const wid = body.wid;

  if (body.mode === 'wallet') {
    if (!validWid(wid)) return res.status(400).json({ error: 'bad_wallet' });
    return res.status(200).json(await walletView(wid, ip, await getWallet(wid), body.cc));
  }

  // اختيار الخدمة المجانية الواحدة: يُحفظ مرة واحدة ولا يتغير بعد استخدام الخدمة المجانية
  if (body.mode === 'set_free_choice') {
    if (!validWid(wid) || !FREE_CHOICES.has(body.choice)) return res.status(400).json({ error: 'bad_request' });
    const w = await getWallet(wid);
    if (w.fc) return res.status(200).json({ ok: true, freeChoice: w.fc, kept: true });
    w.fc = body.choice; await setWallet(wid, w);
    await kv(['INCR', 'stat:fc:' + body.choice]);
    return res.status(200).json({ ok: true, freeChoice: w.fc });
  }

  if (body.mode === 'use_free') {   // لخدمات بدون ذكاء اصطناعي (مثل نتيجة الفحص قبل الشراء)
    if (!validWid(wid) || !validDid(body.did)) return res.status(400).json({ error: 'bad_request' });
    const g = await accessGate(Object.assign({}, body, { mode: 'inspect' }), ip);
    return res.status(g.ok ? 200 : 402).json(Object.assign({ ok: g.ok }, await walletView(wid, ip, await getWallet(wid), body.cc)));
  }

  // ترقية فحص سيارة (مفتوح عند صاحبه) إلى الفحص الوافي: تخصم رصيد ترقية، ولا تخصم مرتين لنفس الفحص
  if (body.mode === 'upgrade') {
    if (!validWid(wid) || !validDid(body.did)) return res.status(400).json({ error: 'bad_request' });
    const w = await getWallet(wid);
    const ful = Array.isArray(w.ful) ? w.ful : [], unl = Array.isArray(w.unl) ? w.unl : [];
    if (passActive(w) || ful.includes(body.did)) return res.status(200).json(Object.assign({ ok: true, kept: true }, await walletView(wid, ip, w, body.cc)));
    if (!unl.includes(body.did) && w.freeDid !== body.did) return res.status(404).json({ error: 'unknown_check' });
    w.cr = w.cr || {};
    if ((w.cr.upg || 0) < 1) return res.status(402).json({ error: 'payment_required', product: 'upgrade' });
    w.cr.upg -= 1; w.ful = ful.concat(body.did).slice(-100);
    await setWallet(wid, w);
    return res.status(200).json(Object.assign({ ok: true }, await walletView(wid, ip, w, body.cc)));
  }
  // استخدام الأسعار (مقارنة بند فاتورة أو سعر قطعة): did واحد = خصم واحد
  if (body.mode === 'use_prices') {
    if (!validWid(wid) || !validDid(body.did)) return res.status(400).json({ error: 'bad_request' });
    const w = await getWallet(wid);
    const g = passActive(w) ? { ok: true } : await pricesAccess(body, w);
    return res.status(g.ok ? 200 : 402).json(Object.assign({ ok: g.ok }, await walletView(wid, ip, await getWallet(wid), body.cc)));
  }

  if (body.mode === 'redeem') {
    if (!validWid(wid)) return res.status(400).json({ error: 'bad_wallet' });
    const code = String(body.code || '').toUpperCase().replace(/\s/g, '');
    if (!/^SD-[A-Z0-9]{8}$/.test(code)) return res.status(400).json({ error: 'bad_code' });
    const raw = await kv(['GET', 'code:' + code]);
    if (!raw) return res.status(404).json({ error: 'not_found' });
    const c = JSON.parse(raw);
    if (c.u) return res.status(409).json({ error: 'used' });
    const w = await getWallet(wid);
    if (!applyProduct(w, c.t)) return res.status(400).json({ error: 'bad_code' });
    c.u = 1; c.by = wid; c.usedAt = Date.now();
    await kv(['SET', 'code:' + code, JSON.stringify(c), 'EX', 2 * 365 * 24 * 3600]);
    await setWallet(wid, w);
    await kv(['INCR', 'stat:redeem:' + c.t]);
    return res.status(200).json(Object.assign({ ok: true, product: c.t }, await walletView(wid, ip, w, body.cc)));
  }

  // ---------- TamPay: طلب تفعيل برقم العملية، ثم موافقة المالك ----------
  if (body.mode === 'tamclaim') {
    if (!validWid(body.wid) || !PRODUCTS[body.product]) return res.status(400).json({ error: 'bad_request' });
    const ref = String(body.ref || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (ref.length < 4 || ref.length > 40) return res.status(400).json({ error: 'bad_ref' });
    const dk = 'tcd:' + body.wid + ':' + dayKey(), n = Number(await kv(['INCR', dk])) || 0;
    if (n === 1) await kv(['EXPIRE', dk, 2 * 864e2]);
    if (n > 5) return res.status(429).json({ error: 'too_many' });
    if (!(await kv(['SET', 'tcref:' + ref, '1', 'NX', 'EX', 400 * 864e2]))) return res.status(409).json({ error: 'ref_used' });
    const id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await kv(['SET', 'tc:' + id, JSON.stringify({ id, wid: body.wid, product: body.product, ref, contact: clip(body.contact, 80), at: Date.now(), status: 'pending' }), 'EX', 90 * 864e2]);
    await kv(['SADD', 'tc:pending', id]);
    BG(kv(['INCR', 'stat:tam:claims']));
    return res.status(200).json({ ok: true, id });
  }
  if (body.mode === 'tam_list') {
    if (!(await verifyOwner(body.token))) return res.status(403).json({ error: 'forbidden' });
    const ids = ((await kv(['SMEMBERS', 'tc:pending'])) || []).slice(0, 50);
    const rows = [];
    for (const id of ids) { const x = await kv(['GET', 'tc:' + id]); if (x) { try { rows.push(JSON.parse(x)); } catch (e) {} } else await kv(['SREM', 'tc:pending', id]); }
    rows.sort((a, b) => a.at - b.at);
    return res.status(200).json({ claims: rows.map(c => Object.assign({}, c, { wid: c.wid.slice(0, 6) + '…' })) });
  }
  if (body.mode === 'tam_decide') {
    if (!(await verifyOwner(body.token))) return res.status(403).json({ error: 'forbidden' });
    const id = String(body.id || '').replace(/[^a-z0-9]/g, '').slice(0, 20);
    const raw = await kv(['GET', 'tc:' + id]); if (!raw) return res.status(404).json({ error: 'not_found' });
    const c = JSON.parse(raw); if (c.status !== 'pending') return res.status(409).json({ error: 'already_decided', status: c.status });
    c.status = body.approve ? 'approved' : 'rejected'; c.decidedAt = Date.now();
    if (body.approve) {
      const w = await getWallet(c.wid); applyProduct(w, c.product); await setWallet(c.wid, w);
      await kv(['INCR', 'stat:paid:' + c.product]); await kv(['INCR', 'stat:tam:approved']);
    } else await kv(['DEL', 'tcref:' + c.ref]);   // الرفض يحرر رقم العملية إن كان خطأ كتابة
    await kv(['SET', 'tc:' + id, JSON.stringify(c), 'EX', 90 * 864e2]); await kv(['SREM', 'tc:pending', id]);
    return res.status(200).json({ ok: true, status: c.status });
  }

  if (body.mode === 'codes_create') {
    if (!(await verifyOwner(body.token))) return res.status(403).json({ error: 'forbidden' });
    const t = String(body.product || ''); if (!PRODUCTS[t]) return res.status(400).json({ error: 'bad_product' });
    const n = Math.min(50, Math.max(1, parseInt(body.count) || 1));
    const codes = [];
    for (let i = 0; i < n; i++) { const c = newCode(); await kv(['SET', 'code:' + c, JSON.stringify({ t, u: 0, at: Date.now(), note: clip(body.note, 60) }), 'EX', 365 * 24 * 3600]); codes.push(c); }
    await kv(['INCRBY', 'stat:codes:' + t, n]);
    return res.status(200).json({ codes, product: t });
  }

  if (body.mode === 'pay_stats') {
    if (!(await verifyOwner(body.token))) return res.status(403).json({ error: 'forbidden' });
    const keys = ['free', 'blocked'].concat(Object.keys(PRODUCTS).flatMap(t => ['redeem:' + t, 'codes:' + t, 'paid:' + t, 'refund:' + t]));
    const vals = (await kv(['MGET'].concat(keys.map(k => 'stat:' + k)))) || [];
    return res.status(200).json(Object.fromEntries(keys.map((k, i) => [k, Number(vals[i]) || 0])));
  }

  if (body.mode === 'pay_webhook') {
    // لبوابة الدفع لاحقاً: ترسل البوابة {secret, wid, product, orderId} بعد نجاح الدفع
    const secret = ENV.PAY_WEBHOOK_SECRET;
    if (!secret || body.secret !== secret) return res.status(403).json({ error: 'forbidden' });
    if (!validWid(wid) || !PRODUCTS[body.product]) return res.status(400).json({ error: 'bad_request' });
    const oid = 'order:' + clip(body.orderId, 80);
    if (body.orderId && await kv(['EXISTS', oid])) return res.status(200).json({ ok: true, duplicate: true });
    const w = await getWallet(wid); applyProduct(w, body.product); await setWallet(wid, w);
    if (body.orderId) await kv(['SET', oid, '1', 'EX', 2 * 365 * 24 * 3600]);
    await kv(['INCR', 'stat:paid:' + body.product]);
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ error: 'unknown_mode' });
}

// =====================================================================
// 📊 أرقام الاستخدام + ✅ دقة التشخيص + 🔗 تقارير قابلة للمشاركة + 🩺 فحص سلامة الموقع
// =====================================================================
const APP_MODES = new Set(['track', 'feedback', 'report_save', 'report_get', 'report_del', 'insights', 'health', 'vibfb', 'clienterr', 'issue']);
const EVENTS = new Set(['visit', 'diag_start', 'diag_done', 'tool_start', 'tool_done', 'insp_start', 'insp_report', 'pay_open', 'checkout_click', 'share']);
const dayKey = (off) => { const d = new Date(Date.now() - (off || 0) * 864e5); return d.toISOString().slice(0, 10).replace(/-/g, ''); };
const rid = (n) => { const A = 'abcdefghjkmnpqrstuvwxyz23456789'; const b = crypto.getRandomValues(new Uint8Array(n)); let o = ''; for (let i = 0; i < n; i++) o += A[b[i] % A.length]; return o; };
async function appHandler(body, ip, res) {
  if (!KV_URL || !KV_TOKEN) return res.status(body.mode === 'track' ? 200 : 503).json({ error: 'not_configured' });

  // "أبلغ عن مشكلة": شكوى المستخدم تصلك قبل أن تصل للمتجر كتقييم
  if (body.mode === 'issue') {
    const text = clip(body.text, 600).trim();
    if (text.length < 3) return res.status(400).json({ error: 'empty' });
    if (!(await kv(['SET', 'issl:' + (await sha256hex('iss|' + ip)).slice(0, 24), '1', 'NX', 'EX', 30]))) return res.status(429).json({ error: 'slow_down' });
    await kv(['LPUSH', 'issue:list', JSON.stringify({ text, contact: clip(body.contact, 80), page: clip(body.page, 20), ver: clip(body.ver, 12), ctx: noPii(clip(body.ctx, 200)), at: Date.now() })]);
    await kv(['LTRIM', 'issue:list', 0, 99]);
    const ik = 'ev:issue:' + dayKey(); await kv(['INCR', ik]); await kv(['EXPIRE', ik, 45 * 864e2]);
    return res.status(200).json({ ok: true });
  }

  if (body.mode === 'clienterr') {
    const msg = noPii(clip(body.msg, 200)); if (!msg) return res.status(200).json({ ok: true });
    await kv(['LPUSH', 'err:list', JSON.stringify({ msg, page: clip(body.page, 20), ver: clip(body.ver, 12), ua: clip(body.ua, 60), at: Date.now() })]);
    await kv(['LTRIM', 'err:list', 0, 49]);
    const ek = 'ev:client_err:' + dayKey(); await kv(['INCR', ek]); await kv(['EXPIRE', ek, 45 * 864e2]);
    return res.status(200).json({ ok: true });
  }

  if (body.mode === 'track') {
    const ev = String(body.ev || '');
    if (EVENTS.has(ev)) { const k = 'ev:' + ev + ':' + dayKey(); await kv(['INCR', k]); await kv(['EXPIRE', k, 45 * 864e2]); }
    return res.status(200).json({ ok: true });
  }

  if (body.mode === 'feedback') {
    const r = ['yes', 'no', 'partial'].includes(body.result) ? body.result : null;
    if (!r || !validDid(body.did)) return res.status(400).json({ error: 'bad_request' });
    // التقييم للمشتركين فقط (من اشترى فعلاً)، حتى تكون نسبة الدقة المعلنة موثوقة
    if (!validWid(body.wid) || !(await getWallet(body.wid)).paid) return res.status(403).json({ error: 'subscribers_only' });
    if (await kv(['EXISTS', 'fbd:' + body.did])) return res.status(200).json({ ok: true, duplicate: true });
    await kv(['SET', 'fbd:' + body.did, r, 'EX', 365 * 864e2]);
    await kv(['INCR', 'stat:fb:' + r]);
    if (body.src === 'mechanic') await kv(['INCR', 'stat:fbm:' + r]);
    if (r !== 'yes') { await kv(['LPUSH', 'fb:list', JSON.stringify({ r, title: clip(body.title, 100), car: clip(body.car, 60), actual: noPii(clip(body.actual, 200)), at: Date.now() })]); await kv(['LTRIM', 'fb:list', 0, 99]); }
    return res.status(200).json({ ok: true });
  }

  if (body.mode === 'vibfb') {
    const mode = ['idle', 'drive', 'brake'].includes(body.vmode) ? body.vmode : null;
    const n = Number(body.net), ok = body.ok === 'normal' ? 'normal' : body.ok === 'problem' ? 'problem' : null;
    if (!mode || !ok || !isFinite(n) || n < 0 || n > 20 || !validWid(body.wid)) return res.status(400).json({ error: 'bad_request' });
    // تقييم واحد لكل محفظة ونوع قياس كل ساعة، حتى لا تُزوَّر البيانات بسهولة
    if (!(await kv(['SET', 'vibfbl:' + body.wid + ':' + mode, '1', 'NX', 'EX', 3600]))) return res.status(200).json({ ok: true, duplicate: true });
    await kv(['LPUSH', 'vibfb:' + mode, JSON.stringify({ n: Math.round(n * 10000) / 10000, ok, at: Date.now() })]);
    await kv(['LTRIM', 'vibfb:' + mode, 0, 499]);
    return res.status(200).json({ ok: true });
  }

  if (body.mode === 'report_save') {
    if (!validWid(body.wid)) return res.status(400).json({ error: 'bad_wallet' });
    const rp = body.report;
    if (!rp || typeof rp !== 'object' || typeof rp.score !== 'number') return res.status(400).json({ error: 'bad_report' });
    // نحفظ نسخة منقّحة بدون أي رقم هيكل أو بيانات شخصية
    const noVin = t => clip(t, 400).replace(/\b[A-HJ-NPR-Z0-9]{17}\b/g, '•••');
    const doc = {
      car: clip(body.car, 60), km: clip(body.km, 12), price: clip(body.price, 12), at: Date.now(),
      score: Math.max(0, Math.min(100, Math.round(rp.score))), verdict: ['good', 'attention', 'problem'].includes(rp.verdict) ? rp.verdict : 'attention',
      verdict_label: clip(rp.verdict_label, 40), confidence: clip(rp.confidence, 10), summary: noPii(noVin(rp.summary)),
      red_flags: (Array.isArray(rp.red_flags) ? rp.red_flags : []).slice(0, 8).map(f => ({ title: noVin(f && f.title).slice(0, 100), stage: clip(f && f.stage, 40), advice: noVin(f && f.advice).slice(0, 200) })),
      stages: (Array.isArray(body.stages) ? body.stages : []).slice(0, 8).map(x => ({ name: clip(x && x.name, 50), verdict: clip(x && x.verdict, 12) })),
      common_issues: (Array.isArray(rp.common_issues) ? rp.common_issues : []).slice(0, 6).map(x => clip(x, 160)),
      repair_cost_sar: Math.round(Number(rp.repair_cost_sar) || 0), offer_price_sar: Math.round(Number(rp.offer_price_sar) || 0)
    };
    const id = rid(10);
    await kv(['SET', 'rep:' + id, JSON.stringify(doc), 'EX', 120 * 864e2]);
    await kv(['SET', 'repown:' + id, (await sha256hex('rep|' + body.wid)).slice(0, 32), 'EX', 120 * 864e2]);
    await kv(['INCR', 'stat:reports']);
    return res.status(200).json({ id });
  }

  if (body.mode === 'report_del') {
    const id = String(body.id || '').replace(/[^a-z0-9]/g, '').slice(0, 12);
    if (!id || !validWid(body.wid)) return res.status(400).json({ error: 'bad_request' });
    const own = await kv(['GET', 'repown:' + id]);
    if (!own || own !== (await sha256hex('rep|' + body.wid)).slice(0, 32)) return res.status(403).json({ error: 'forbidden' });
    await kv(['DEL', 'rep:' + id]); await kv(['DEL', 'repown:' + id]);
    return res.status(200).json({ ok: true });
  }

  if (body.mode === 'report_get') {
    const id = String(body.id || '').replace(/[^a-z0-9]/g, '').slice(0, 12);
    const raw = id ? await kv(['GET', 'rep:' + id]) : null;
    if (!raw) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(JSON.parse(raw));
  }

  if (body.mode === 'insights') {
    if (!(await verifyOwner(body.token))) return res.status(403).json({ error: 'forbidden' });
    const days = [0, 1, 2, 3, 4, 5, 6].map(dayKey), evs = [...EVENTS];
    const keys = []; evs.forEach(e => days.forEach(d => keys.push('ev:' + e + ':' + d)));
    const vals = (await kv(['MGET'].concat(keys))) || [];
    const funnel = {}; evs.forEach((e, i) => { funnel[e] = days.reduce((a, d, j) => a + (Number(vals[i * days.length + j]) || 0), 0); });
    const st = (await kv(['MGET', 'stat:fb:yes', 'stat:fb:no', 'stat:fb:partial', 'stat:reports', 'ev:ai_fail:' + dayKey(), 'stat:free', 'stat:blocked'])) || [];
    const fb = ((await kv(['LRANGE', 'fb:list', 0, 14])) || []).map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean);
    const sm = (await kv(['MGET', 'stat:fbm:yes', 'stat:fbm:no', 'stat:fbm:partial', 'ev:client_err:' + dayKey(), 'stat:quota_hit'])) || [];
    const errs = ((await kv(['LRANGE', 'err:list', 0, 9])) || []).map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean);
    const issues = ((await kv(['LRANGE', 'issue:list', 0, 9])) || []).map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean);
    const issuesToday = Number(await kv(['GET', 'ev:issue:' + dayKey()])) || 0;
    const vib = {};
    for (const mode of ['idle', 'drive', 'brake']) {
      const rows = ((await kv(['LRANGE', 'vibfb:' + mode, 0, 499])) || []).map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean);
      vib[mode] = vibSuggest(rows, appConfig().vib[mode]);
    }
    return res.status(200).json({ funnel, accuracy: { yes: +st[0] || 0, no: +st[1] || 0, partial: +st[2] || 0 }, verified: { yes: +sm[0] || 0, no: +sm[1] || 0, partial: +sm[2] || 0 }, client_err_today: +sm[3] || 0, quota_hits: +sm[4] || 0, errors: errs, issues, issues_today: issuesToday, vib, reports: +st[3] || 0, ai_fail_today: +st[4] || 0, free: +st[5] || 0, blocked: +st[6] || 0, mismatches: fb });
  }

  if (body.mode === 'health') {
    if (!(await verifyOwner(body.token))) return res.status(403).json({ error: 'forbidden' });
    const out = { kv: false, gemini_key: !!ENV.GEMINI_API_KEY, gemini_ok: false, lemon_secret: !!ENV.LEMON_SIGNING_SECRET, lemon_links: Object.keys(checkoutLinks()).length, models: { main: MAIN, light: LIGHT, escalate: ESCALATE } };
    try { await kv(['SET', 'health:ping', '1', 'EX', 60]); out.kv = (await kv(['GET', 'health:ping'])) === '1'; } catch (e) {}
    if (ENV.GEMINI_API_KEY) {
      try { const t = await callGemini({ name: 'gemini', key: ENV.GEMINI_API_KEY, model: LIGHT[0] || MAIN[0] }, 'أجب بكائن JSON فقط: {"ok":true}', 'اختبار', 20, 8000); out.gemini_ok = /ok/.test(t || ''); }
      catch (e) { out.gemini_error = String(e.message || e).slice(0, 120); }
    }
    return res.status(200).json(out);
  }
  return res.status(400).json({ error: 'unknown_mode' });
}

// ---------- مكتبة مرجعية: نقارن القياس بقياسات نفس الموديل من مستخدمين آخرين ----------
async function peerCompare(car, metric, value) {
  if (!KV_URL || !car || !metric || !(value >= 0) || value > 1000) return null;
  const mk = normKey(String(car).replace(/\d{4}/g, '')).slice(0, 40);      // الشركة والموديل بدون السنة
  if (mk.length < 3) return null;
  const key = 'peer:' + clip(metric, 20).replace(/[^a-z_]/g, '') + ':' + (await sha256hex(mk)).slice(0, 16);
  const prev = ((await kv(['LRANGE', key, 0, 199])) || []).map(Number).filter(x => x >= 0);
  await kv(['LPUSH', key, String(Math.round(value * 10000) / 10000)]); await kv(['LTRIM', key, 0, 199]); await kv(['EXPIRE', key, 2 * 365 * 864e2]);
  if (prev.length < 5) return { n: prev.length };
  const below = prev.filter(x => x < value).length;
  return { n: prev.length, percentile: Math.round(below / prev.length * 100) };
}

// ---------- حالات عامة للبحث (بدون أي نص كتبه المستخدم) ----------
async function publishCase(body, out) {
  if (String(ENV.PUBLIC_CASES || '1') === '0' || !KV_URL) return;
  const car = clip(body.car, 60).trim(); if (car.length < 4 || !out.title) return;
  const id = (await sha256hex(normKey(car) + '|' + normKey(out.title))).slice(0, 12);
  if (await kv(['EXISTS', 'case:' + id])) return;
  await kv(['SET', 'case:' + id, JSON.stringify({ car, title: clip(out.title, 100), sev: out.severity, explanation: clip(out.explanation, 500), advice: clip(out.advice, 300), checks: (out.checks || []).slice(0, 4), at: Date.now() }), 'EX', 2 * 365 * 864e2]);
  await kv(['LPUSH', 'case:index', id]); await kv(['LTRIM', 'case:index', 0, 999]);
}

// ---------- التنظيم التلقائي (Gemma أولاً لأن حده اليومي كبير) ----------
async function curate(body, out, ip, ctx) {
  if (!KV_URL || !ENV.GEMINI_API_KEY || ctx.left() < 9000) return;
  const make = String(body.car || '').split(' ').slice(0, -1).join(' ');
  const h = (await sha256hex([normKey(make), normKey(body.description), normKey(body.structured)].join('|'))).slice(0, 16);
  if (await kv(['EXISTS', 'auto:' + h]) || await kv(['EXISTS', 'curblock:' + h])) return;
  const who = (await sha256hex(ip)).slice(0, 12);
  await kv(['SADD', 'curu:' + h, who]); await kv(['EXPIRE', 'curu:' + h, 30 * 24 * 3600]);
  const users = Number(await kv(['SCARD', 'curu:' + h])) || 0;
  if (users < CURATE_MIN_USERS) return;
  const prompt = ['السيارة: ' + clip(body.car, 80), 'وصف المالك: ' + clip(body.description, 500),
    body.structured ? 'معلومات اختارها: ' + clip(body.structured, 300) : '',
    'تشخيص الذكاء الاصطناعي: ' + out.title + ' | الخطورة: ' + out.severity + ' | ' + clip(out.explanation, 300) + ' | نصيحة: ' + clip(out.advice, 200)].filter(Boolean).join('\n');
  const chain = [...new Set(GEMMA.concat(LIGHT, MAIN))].map(m => ({ name: 'gemini', key: ENV.GEMINI_API_KEY, model: m }));
  const { data: d, model } = await callAI(chain, CURATE_SYSTEM, prompt, 900, { left: () => Math.min(ctx.left() - 1500, 9000) }, x => x && x.title && Array.isArray(x.keywords));
  const row = {
    id: 'a_' + h, auto: true, title: clip(d.title, 90), sev: ['safe', 'caution', 'stop'].includes(d.sev) ? d.sev : out.severity,
    kw: Object.fromEntries((d.keywords || []).slice(0, 15).map(k => [clip(k && k.k, 40), Math.min(5, Math.max(1, Number(k && k.w) || 2))]).filter(x => x[0])),
    codes: (d.codes || []).slice(0, 6).map(c => clip(c, 6).toUpperCase()).filter(c => /^[PBCU]\d{4}$/.test(c)),
    parts: (d.parts || []).slice(0, 6).map(x => ({ n: clip(x && x.n, 60), p: 0, opt: !!(x && x.opt) })).filter(x => x.n),
    labor: 0, advice: clip(d.advice || out.advice, 400), models: (d.models || []).slice(0, 6).map(x => clip(x, 30)),
    questions: (d.questions || []).slice(0, 3).map(q => q && q.type === 'choice'
      ? { q: clip(q.q, 140), type: 'choice', options: (q.options || []).slice(0, 5).map(o => ({ l: clip(o && o.l, 40), kw: clip(o && o.kw, 40) })) }
      : { q: clip(q && q.q, 140), type: 'yesno', kw: clip(q && q.kw, 40) }).filter(q => q.q),
    users, example: clip(body.description, 200), car: clip(body.car, 60), model, at: Date.now()
  };
  if (!Object.keys(row.kw).length) return;
  await kv(['SET', 'auto:' + h, JSON.stringify(row), 'EX', 120 * 24 * 3600]);
  await kv(['SADD', 'auto:index', h]);
  console.log('curated:', h, row.title, 'by', model);
}

const CURATE_SYSTEM = `أنت محرر قاعدة معرفة لتطبيق تشخيص أعطال سيارات في الخليج. حوّل الحالة المعطاة (وصف مالك تكرر من عدة مستخدمين + تشخيص) إلى صف منظم دقيق.
- title: اسم العطل بالعربية الواضحة (ليس وصف المالك).
- keywords: 5 إلى 12 كلمة أو عبارة قصيرة بلهجة الناس (من وصف المالك ومرادفاتها الخليجية) مع وزن 1-4.
- parts: أسماء القطع المعتادة فقط بدون أسعار، و opt=true لما يُبدّل عند الحاجة.
- questions: سؤالان يميّزان هذا العطل عن المشابه، نعم/لا مع kw أو اختيار مع options [{l, kw}].
- لا تخترع أسعاراً أو أكواداً غير مؤكدة.
أجب بكائن JSON فقط: {"title":"","sev":"safe|caution|stop","keywords":[{"k":"","w":2}],"codes":[],"parts":[{"n":"","opt":false}],"models":[],"advice":"","questions":[{"q":"","type":"yesno","kw":""}]}`;

const REVIEW_SYSTEM = `أنت مدقق خبير لقاعدة معرفة أعطال السيارات في السوق السعودي والخليجي. راجع كل صف بدقة واحكم عليه:
- "keep": صحيح ولا يحتاج تعديلاً.
- "fix": يحتاج تصحيحاً. ضع في fix الحقول المصححة فقط من: title, sev, kw (كائن {"كلمة": وزن 1-4}), parts ([{"n","p","opt"}] بأسعار واقعية بالريال لقطع تجاري جيد), labor, advice, questions.
- "delete": معلومة خاطئة أو غير مفيدة أو مضللة.
- "merge": مكرر لعطل آخر، وضع معرّفه في merge_into.
قواعد صارمة:
- السلامة أولاً: الحرارة والزيت والفرامل والتوجيه وتسريب البنزين لا تكون "safe".
- صحح الأسعار غير الواقعية (مرتفعة أو منخفضة جداً) وأجرة اليد.
- أضف كلمات خليجية شائعة ناقصة، واحذف الكلمات المضللة التي تسبب تشخيصاً خاطئاً.
- لا تغيّر ما هو صحيح، ولا تحذف إلا بسبب واضح، واذكر السبب في reason بجملة قصيرة.
أجب بكائن JSON فقط: {"reviews":[{"id":"","action":"keep|fix|delete|merge","reason":"","fix":{},"merge_into":null}]}`;

// التحقق من أن الطلب من مالك التطبيق (رمز Firebase صالح لبريد الإدارة)
let OWNER; // يُضبط في initEnv
let FIREBASE_WEB_KEY; // يُضبط في initEnv
async function verifyOwner(token) {
  if (!OWNER || !token || typeof token !== 'string' || token.length > 4000) return null;   // بدون OWNER_EMAIL لا يُعترف بأي مالك
  try {
    const d = await post('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_WEB_KEY, { 'content-type': 'application/json' }, { idToken: token }, 6000);
    const u = (d.users || [])[0];
    return u && String(u.email || '').toLowerCase() === OWNER ? u.email : null;
  } catch (e) { return null; }
}

const RESEARCH_SYSTEM = `أنت باحث خبير في أعطال السيارات بسوق الخليج والسعودية. ابحث في الإنترنت عن الموضوع المعطى، ثم لخّص النتيجة بكلماتك (لا تنسخ نصوصاً) في صف واحد لقاعدة معرفة تطبيق تشخيص.
- title: اسم العطل بالعربية الواضحة.
- sev: "safe" أو "caution" أو "stop" حسب خطورة القيادة.
- keywords: 6 إلى 15 كلمة أو عبارة قصيرة يكتبها الناس في الخليج لوصف هذا العطل (عامية: تفتف، ترج، طقطقة، ونين…) مع وزن 1-4 (4 للعبارات الحاسمة).
- codes: أكواد OBD المرتبطة إن وجدت.
- parts: القطع المعتادة مع سعر تقريبي بالريال السعودي في السوق السعودي (قطع تجاري جيد)، و opt=true للقطع التي تُبدّل فقط عند الحاجة.
- labor: أجرة اليد التقريبية بالريال.
- models: موديلات شائعة في الخليج يكثر فيها هذا العطل إن وُجدت مصادر.
- advice: نصيحة عملية للمالك في جملتين.
- questions: سؤالان أو ثلاثة تفرّق هذا العطل عن أعطال مشابهة، بنعم/لا مع kw، أو اختيار مع options [{l, kw}].
كن محافظاً في الأسعار ولا تخترع معلومات غير موجودة في المصادر.
أجب بكائن JSON فقط: {"title":"","sev":"","keywords":[{"k":"","w":2}],"codes":[],"parts":[{"n":"","p":0,"opt":false}],"labor":0,"models":[],"advice":"","questions":[{"q":"","type":"yesno","kw":""}]}`;

const PARTCHECK_SYSTEM = `أنت فني سيارات خبير ونزيه في دول الخليج، تساعد مالك السيارة على معرفة هل القطعة التي تقترحها الورشة لازمة فعلاً لهذا العطل.
- احكم بأحد ثلاثة: "needed" (سبب شائع ومباشر للعطل)، "maybe" (ممكن لكن ليس أول احتمال، أو يوجد إصلاح أرخص يُجرّب أولاً)، "unlikely" (لا علاقة واضحة بالعطل).
- كن منصفاً: لا تتهم الورشة، ولا تطمئن بلا سبب. إذا كانت القطعة من عناصر السلامة (فرامل، توجيه، إطارات) ومتآكلة فهي لازمة.
- اذكر كيف يتأكد المالك (فحص، قراءة كمبيوتر، أن يريه الفني القطعة) وما الإصلاح الأرخص الذي يُجرّب أولاً إن وُجد.
- يجب أن يطابق الحكم شرحك: إذا قلت إن العطل غالباً ليس من هذه القطعة فالحكم "unlikely" وليس "maybe".
- لا تفترض معلومات لم يذكرها المالك (مثل أنه غيّر قطعة مؤخراً)، واعتمد فقط على الوصف والإجابات المعطاة.
أجب بكائن JSON فقط: {"verdict":"needed"|"maybe"|"unlikely","reason":"جملة أو جملتان","how_to_verify":"جملة","cheaper_first":"إصلاح أرخص أولاً أو null"}`;

const INSPECT_SYSTEM = `أنت خبير فحص سيارات مستعملة في دول الخليج، تساعد مشترياً قام بفحص ذاتي لسيارة قبل شرائها.
- اكتب بالعربية الواضحة وباختصار، ولا تبالغ ولا تطمئن بلا سبب.
- اربط الملاحظات ببعضها (مثل: صبغ مختلف + فراغات غير متساوية = حادث سابق محتمل).
- اذكر الأعطال الشائعة المعروفة لهذا الموديل والسنة إن كانت ذات صلة.
- لا تخترع أسعاراً، ولا تقدم نفسك كشهادة فحص رسمية.
أجب بكائن JSON فقط: {"summary": "خلاصة في 2-3 جمل", "risks": ["أهم المخاطر بالترتيب"], "model_notes": "ملاحظة عن الموديل أو null", "next_steps": "ماذا يفعل المشتري الآن"}`;

// =====================================================================
// 🌍 الدولة المقترحة + الترجمة التلقائية للواجهة (تُحفظ في Redis للأبد، فلا تُترجم الجملة مرتين)
// =====================================================================
const LANG_OK = l => typeof l === 'string' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(l) && l.toLowerCase() !== 'ar';
const I18N_SYSTEM = `أنت مترجم واجهات تطبيقات. ترجم النصوص العربية إلى اللغة المطلوبة بأسلوب طبيعي ومختصر يناسب أزرار وعناوين تطبيق سيارات.
- احتفظ بالرموز {0} {1} … كما هي تماماً في أماكنها المناسبة، ولا تغيّر الأرقام ولا الرموز التعبيرية.
- لا تضف شرحاً. اترك أسماء العلامات التجارية (مثل Lemon Squeezy) كما هي.
أجب بكائن JSON فقط: {"map":{"النص العربي الأصلي":"الترجمة"}} بنفس المفاتيح حرفياً.`;
async function i18nHandler(body, res) {
  if (!KV_URL || !KV_TOKEN) return res.status(503).json({ error: 'not_configured' });
  const lang = body.lang; if (!LANG_OK(lang)) return res.status(400).json({ error: 'bad_lang' });
  const hk = 'i18n:' + lang;
  if (body.mode === 'i18n_pack') {
    const flat = (await kv(['HGETALL', hk])) || [], map = {};
    for (let i = 0; i + 1 < flat.length && i < 12000; i += 2) map[flat[i]] = flat[i + 1];
    return res.status(200).json({ map });
  }
  const strings = (Array.isArray(body.strings) ? body.strings : []).slice(0, 40).map(s => clip(s, 400)).filter(s => /[؀-ۿ]/.test(s));
  if (!strings.length) return res.status(200).json({ map: {} });
  const have = (await kv(['HMGET', hk].concat(strings))) || [], map = {}, miss = [];
  strings.forEach((s, i) => { if (have[i]) map[s] = have[i]; else miss.push(s); });
  if (miss.length && (ENV.GEMINI_API_KEY || ENV.ANTHROPIC_API_KEY)) {
    // سقف يومي لتكلفة الترجمة (يُضبط بـ I18N_DAILY)
    const qk = 'i18nq:' + dayKey(), used = Number(await kv(['INCRBY', qk, miss.length])) || 0;
    if (used <= miss.length) BG(kv(['EXPIRE', qk, 2 * 864e2]));
    if (used <= (parseInt(ENV.I18N_DAILY || '4000') || 4000)) {
      try {
        const ctx = { left: () => 15000 };
        const { data } = await callAI(buildChain('light'), I18N_SYSTEM, 'اللغة الهدف: ' + lang + '\n' + JSON.stringify(miss), 1800, ctx, d => d && d.map && typeof d.map === 'object');
        const save = [];
        miss.forEach(s => {
          const t = clip(data.map[s], 500).trim(); if (!t) return;
          const toks = x => (String(x).match(/\{\d+\}/g) || []).sort().join();
          if (toks(t) !== toks(s)) return;   // رمز {0} ضائع أو مضاف: نرفض الترجمة ونعيدها لاحقاً
          map[s] = t; save.push(s, t);
        });
        if (save.length) BG(kv(['HSET', hk].concat(save)));
      } catch (e) { console.error('i18n fail', String(e.message || e).slice(0, 150)); }
    }
  }
  return res.status(200).json({ map });
}

// نص التقرير: نبنيه من حقائق الفحص نفسها دون أن نخترع شيئاً (لا أرقام ولا قطع من خارج الحقائق)
function reportBody(f) {
  f = f && typeof f === 'object' ? f : {};
  const L = [];
  L.push('السيارة: ' + clip(f.car, 80) + (f.km ? ' • الممشى: ' + clip(f.km, 20) : '') + (f.place ? ' • ' + clip(f.place, 60) : ''));
  L.push('التشخيص المبدئي: ' + clip(f.title, 140) + (f.code ? ' (' + clip(f.code, 10) + ')' : ''));
  if (f.severity) L.push('درجة الخطورة: ' + clip(f.severity, 40));
  if (f.description) L.push('وصف المالك: ' + clip(f.description, 300));
  if (f.structured) L.push('معلومات إضافية: ' + clip(f.structured, 300));
  if (f.explanation) L.push('\nالشرح:\n' + clip(f.explanation, 700));
  if (Array.isArray(f.checks) && f.checks.length) L.push('\nما يُفحص أولاً:\n' + f.checks.slice(0, 6).map(c => '• ' + clip(c, 160)).join('\n'));
  if (Array.isArray(f.parts) && f.parts.length) L.push('\nالقطع المحتملة:\n' + f.parts.slice(0, 8).map(c => '• ' + clip(c, 80)).join('\n') + (f.total ? '\nالتكلفة التقريبية: ' + clip(f.total, 40) : ''));
  if (f.advice) L.push('\nالنصيحة:\n' + clip(f.advice, 600));
  L.push('\nتنبيه: تقدير مبدئي يساعدك قبل الذهاب للورشة، ولا يغني عن فحص الفني. اطلب عرض سعر مكتوباً واحتفظ بالقطع القديمة.');
  return L.join('\n');
}

async function handle(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  // نقبل الطلبات من نفس الموقع فقط
  const origin = req.headers.origin || '';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  if (origin && host && !origin.endsWith('//' + host)) return res.status(403).json({ error: 'forbidden' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  if (body.mode !== 'pay_webhook' && rateLimited(ip)) return res.status(429).json({ error: 'too_many_requests' });

  // الدولة المقترحة من شبكة المستخدم (Cloudflare)، بلا إذن موقع وبلا تخزين
  if (body.mode === 'geo') {
    const cc = String(req.headers['cf-ipcountry'] || '').toUpperCase(), ok = /^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1';
    return res.status(200).json({ country: ok ? cc : null, supported: ok });
  }
  if (body.mode === 'i18n' || body.mode === 'i18n_pack') return i18nHandler(body, res);
  // ميزات لم تكتمل في هذا الإصدار: ترفضها بوضوح بدل أن تفشل بصمت
  if (['rpack_list', 'rpack_build', 'insp_save', 'insp_get'].includes(body.mode)) return res.status(501).json({ error: 'not_implemented' });
  // تقرير PDF: لصاحب وصول مدفوع أو فحص مفتوح له فقط
  if (body.mode === 'report_write') {
    if (!KV_URL || !KV_TOKEN || !validWid(body.wid)) return res.status(503).json({ error: 'not_configured' });
    const w = await getWallet(body.wid);
    if (!passActive(w) && !(validDid(body.did) && (w.ful || []).includes(body.did))) return res.status(402).json({ error: 'payment_required', product: 'upgrade' });
    const text = reportBody(body.facts);
    return res.status(200).json({ summary: clip(body.facts && body.facts.title, 140), body: text, issues: [] });
  }

  // 💳 المحفظة والدفع: لا تحتاج مفاتيح ذكاء اصطناعي
  if (PAY_MODES.has(body.mode)) return payHandler(body, ip, res);
  if (APP_MODES.has(body.mode)) return appHandler(body, ip, res);
  // حدود يومية لكل محفظة (تُعدَّل بـ AI_DAILY_LIMITS مثل {"vision":40,"text":120,"report":10})
  const QCLASS = { vision: 'vision', inspect2: 'report', diagnose: 'text', questions: 'text', measure: 'text', partcheck: 'text', invoice: 'vision', parts_sheet: 'vision', inspect: 'text' }[body.mode];
  if (QCLASS && KV_URL && KV_TOKEN && validWid(body.wid)) {
    const lim = Object.assign({ vision: 40, text: 120, report: 10 }, (() => { try { return JSON.parse(ENV.AI_DAILY_LIMITS || '{}'); } catch (e) { return {}; } })());
    const qk = 'q:' + body.wid + ':' + dayKey() + ':' + QCLASS;
    const used = Number(await kv(['INCR', qk])) || 0;
    if (used === 1) BG(kv(['EXPIRE', qk, 2 * 864e2]));
    if (used > (Number(lim[QCLASS]) || 1e9)) { BG(kv(['INCR', 'stat:quota_hit'])); return res.status(429).json({ error: 'daily_limit', kind: QCLASS }); }
  }
  let reportWallet = null;
  if (body.mode === 'inspect2' && KV_URL && KV_TOKEN) {
    if (!validWid(body.wid)) return res.status(400).json({ error: 'bad_wallet' });
    KV_ERR = false;
    const w = await getWallet(body.wid);
    if (KV_ERR) return res.status(503).json({ error: 'busy' });
    if (!passActive(w)) {
      if (!rcValid(w)) { BG(kv(['INCR', 'stat:blocked'])); return res.status(402).json({ error: 'payment_required', product: 'report' }); }
      reportWallet = w;   // يُخصم بعد نجاح التقرير فقط
    }
  }
  if (GATED_FREE.has(body.mode) || GATED_PAID.has(body.mode)) {
    const g = await accessGate(body, ip);
    if (!g.ok && g.busy) return res.status(503).json({ error: 'busy' });
    if (!g.ok) { BG(kv(['INCR', 'stat:blocked'])); return res.status(402).json({ error: 'payment_required' }); }
  }
  if (!ENV.GEMINI_API_KEY && !ENV.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'not_configured' });

  // مهلة إجمالية 22 ثانية لكل طلب (المتصفح ينتظر 25)
  const deadline = Date.now() + 22000;
  const ctx = { left: () => deadline - Date.now() };

  try {
    if (body.mode === 'diagnose') {
      const catalog = Array.isArray(body.catalog) ? body.catalog.slice(0, 40).map(c => ({ id: clip(c.id, 20), title: clip(c.title, 80) })) : [];
      const ids = new Set(catalog.map(c => c.id));
      const prompt = [
        'السيارة: ' + clip(body.car, 60),
        'الموقع: ' + clip(body.country, 30) + ' - ' + clip(body.city, 30),
        body.mileage ? 'الممشى: ' + clip(body.mileage, 30) : '',
        body.structured ? 'معلومات محددة اختارها المالك: ' + clip(body.structured, 400) : '',
        body.description ? 'وصف المالك: ' + clip(body.description, 600) : '',
        body.code ? 'كود العطل: ' + clip(body.code, 10) : '',
        body.sound ? 'تحليل صوت مسجّل من الجوال: ' + clip(body.sound, 300) : '',
        body.context ? 'متى يظهر الصوت: ' + clip(body.context, 60) : '',
        body.localGuess ? 'ترجيح أولي من نظام بسيط: ' + clip(body.localGuess, 20) : '',
        Array.isArray(body.reference) && body.reference.length
          ? 'مراجع من قاعدة معرفة التطبيق (راجعها المالك؛ اعتمد عليها إن طابقت الأعراض):\n' + body.reference.slice(0, 3).map(r => '- ' + clip(r && r.title, 90) + (r.models ? ' [شائع في: ' + clip(r.models, 80) + ']' : '') + ' | القطع: ' + clip(r && r.parts, 160) + ' | ' + clip(r && r.advice, 200)).join('\n') : '',
        Array.isArray(body.followups) && body.followups.length
          ? 'أسئلة سابقة وإجابات المالك:\n' + body.followups.slice(-6).map(f => '- س: ' + clip(f && f.q, 200) + '\n  ج: ' + clip(f && f.a, 200)).join('\n') : '',
        'قائمة kb_id المتاحة: ' + JSON.stringify(catalog)
      ].filter(Boolean).join('\n');
      if (!body.description && !body.code && !body.sound && !body.structured) return res.status(400).json({ error: 'empty' });

      // نستخدم التخزين فقط للفحص الأول (بدون صوت أو أسئلة متابعة)
      const cacheable = !body.sound && !(Array.isArray(body.followups) && body.followups.length);
      const key = cacheable ? (await cacheKey(body)) : null;
      if (key) {
        const hit = await kv(['GET', key]);
        if (hit) {
          try { const c = JSON.parse(hit); console.log('cache hit:', key.slice(0, 16)); return res.status(200).json(Object.assign(c, { cached: true })); } catch (e) {}
        }
      }

      const { data: j, model } = await diagnose(prompt, ctx);
      const out = {
        kb_id: ids.has(j.kb_id) ? j.kb_id : null,
        title: clip(j.title, 120),
        severity: ['safe', 'caution', 'stop'].includes(j.severity) ? j.severity : 'caution',
        confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'medium',
        explanation: clip(j.explanation, 600),
        advice: clip(j.advice, 500),
        checks: Array.isArray(j.checks) ? j.checks.slice(0, 5).map(c => clip(c, 140)) : [],
        question: realQuestion(j.question) ? clip(j.question, 200) : null,
        model
      };
      // لا نحفظ إلا التشخيص الواثق (عالي أو متوسط)
      if (key && out.confidence !== 'low') BG(kv(['SET', key, JSON.stringify(out), 'EX', CACHE_TTL]));
      if (key && out.confidence === 'high') BG(publishCase(body, out).catch(() => {}));
      // 🤖 التعلّم التلقائي: إذا تكررت الحالة من عدة مستخدمين بثقة عالية نُنشئ صفاً "تلقائياً – غير معتمد"
      if (key && out.confidence === 'high' && !(body.reference || []).length) {
        try { await curate(body, out, ip, ctx); } catch (e) { console.error('curate', String(e.message || e).slice(0, 150)); }
      }
      return res.status(200).json(out);
    }

    if (body.mode === 'questions') {
      if (!body.description && !body.structured) return res.status(400).json({ error: 'empty' });
      const qkey = 'q:v1:' + (await cacheKey(body)).slice(8);
      const hit = await kv(['GET', qkey]);
      if (hit) { try { return res.status(200).json(Object.assign(JSON.parse(hit), { cached: true })); } catch (e) {} }
      const prompt = [
        'السيارة: ' + clip(body.car, 80),
        body.mileage ? 'الممشى: ' + clip(body.mileage, 30) : '',
        body.description ? 'وصف المالك: ' + clip(body.description, 600) : '',
        body.structured ? 'معلومات اختارها المالك: ' + clip(body.structured, 400) : ''
      ].filter(Boolean).join('\n');
      const valid = d => Array.isArray(d.questions) && d.questions.length > 0;
      const { data: j } = await callAI(buildChain('light'), QUESTIONS_SYSTEM, prompt, 500, ctx, valid);
      const questions = j.questions.slice(0, 4).map(q => ({
        q: clip(q.q, 140),
        type: q.type === 'yesno' ? 'yesno' : 'choice',
        options: q.type === 'yesno' ? null : (Array.isArray(q.options) ? q.options.slice(0, 5).map(o => clip(o, 40)) : [])
      })).filter(q => q.q && (q.type === 'yesno' || q.options.length >= 2));
      const out = { questions };
      if (questions.length) BG(kv(['SET', qkey, JSON.stringify(out), 'EX', CACHE_TTL]));
      return res.status(200).json(out);
    }

    if (body.mode === 'kb_auto') {
      const ids = (await kv(['SMEMBERS', 'auto:index'])) || [];
      if (!ids.length) return res.status(200).json({ rows: [] });
      const vals = (await kv(['MGET'].concat(ids.slice(0, 150).map(i => 'auto:' + i)))) || [];
      const rows = vals.map(v => { try { return JSON.parse(v); } catch (e) { return null; } }).filter(Boolean);
      return res.status(200).json({ rows });
    }

    if (body.mode === 'kb_auto_del') {
      if (!(await verifyOwner(body.token))) return res.status(403).json({ error: 'forbidden' });
      const id = String(body.id || '').replace(/^a_/, '').replace(/[^a-z0-9]/g, '').slice(0, 40);
      if (!id) return res.status(400).json({ error: 'empty' });
      await kv(['DEL', 'auto:' + id]); await kv(['SREM', 'auto:index', id]);
      if (body.block) await kv(['SET', 'curblock:' + id, '1', 'EX', 180 * 24 * 3600]);   // لا يُعاد إنشاؤه بعد الحذف
      return res.status(200).json({ ok: true });
    }

    if (body.mode === 'review') {
      if (!(await verifyOwner(body.token))) return res.status(403).json({ error: 'forbidden' });
      const key = ENV.GEMINI_API_KEY;
      if (!key) return res.status(503).json({ error: 'not_configured' });
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 8) : [];
      if (!rows.length) return res.status(400).json({ error: 'empty' });
      const all = Array.isArray(body.all) ? body.all.slice(0, 120).map(x => clip(x && x.id, 40) + ': ' + clip(x && x.title, 80)).join('\n') : '';
      const prompt = 'السوق: ' + clip(body.country || 'السعودية', 30) + ' (الأسعار بالريال السعودي)\n'
        + 'كل الأعطال في القاعدة (للبحث عن التكرار):\n' + all + '\n\nالصفوف المطلوب مراجعتها:\n'
        + JSON.stringify(rows.map(r => ({ id: clip(r.id, 40), title: clip(r.title, 90), sev: r.sev, kw: Object.keys(r.kw || {}).slice(0, 25), parts: (r.parts || []).slice(0, 8), labor: r.labor, advice: clip(r.advice, 400), models: r.models || [], questions: (r.questions || []).slice(0, 4) })));
      const deadline = Date.now() + 27000;
      for (const m of REVIEW_MODELS) {
        const left = deadline - Date.now(); if (left < 6000) break;
        try {
          const text = await callGemini({ name: 'gemini', key, model: m }, REVIEW_SYSTEM, prompt, 3500, Math.min(24000, left - 1000));
          const d = extractJson(text || '');
          if (!d || !Array.isArray(d.reviews)) { console.error('review bad output', m); continue; }
          const ok = new Set(rows.map(r => String(r.id)));
          const reviews = d.reviews.filter(r => r && ok.has(String(r.id))).map(r => ({
            id: String(r.id), action: ['keep', 'fix', 'delete', 'merge'].includes(r.action) ? r.action : 'keep', reason: clip(r.reason, 300),
            merge_into: r.merge_into ? clip(r.merge_into, 40) : null, fix: r.fix && typeof r.fix === 'object' ? r.fix : null
          }));
          console.log('review ok:', m, reviews.length);
          return res.status(200).json({ reviews, model: m });
        } catch (e) { console.error('review fail:', m, String(e.message || e).slice(0, 200)); }
      }
      return res.status(502).json({ error: 'ai_failed' });
    }

    if (body.mode === 'research') {
      // للمالك فقط: نتحقق من هويته عبر رمز Firebase قبل استهلاك حدود البحث
      const email = await verifyOwner(body.token);
      if (!email) return res.status(403).json({ error: 'forbidden' });
      const key = ENV.GEMINI_API_KEY;
      if (!key) return res.status(503).json({ error: 'not_configured' });
      const topic = clip(body.topic, 120);
      if (topic.length < 4) return res.status(400).json({ error: 'empty' });
      const existing = Array.isArray(body.existing) ? body.existing.slice(0, 60).map(x => clip(x, 60)).join('، ') : '';
      const prompt = 'الموضوع: ' + topic + (existing ? '\nأعطال موجودة مسبقاً في التطبيق (لا تكررها، وإن كان الموضوع أحدها فحسّنه): ' + existing : '');
      const deadline = Date.now() + 27000;
      const models = [...new Set(MAIN.concat(ESCALATE))];
      for (const m of models) {
        const left = deadline - Date.now(); if (left < 6000) break;
        try {
          const data = await post('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(m) + ':generateContent',
            { 'x-goog-api-key': key, 'content-type': 'application/json' },
            { systemInstruction: { parts: [{ text: RESEARCH_SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }],
              tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: 3000, temperature: 0.3 } }, Math.min(20000, left - 1000));
          const c = (data.candidates || [])[0] || {};
          const text = ((c.content && c.content.parts) || []).filter(x => x.text && !x.thought).map(x => x.text).join('\n');
          const d = extractJson(text);
          if (!d || !d.title) { console.error('research bad output', m); continue; }
          const chunks = (c.groundingMetadata && c.groundingMetadata.groundingChunks) || [];
          const sources = chunks.map(x => x.web).filter(Boolean).slice(0, 5).map(w => ({ uri: clip(w.uri, 300), title: clip(w.title, 120) }));
          const draft = {
            title: clip(d.title, 90), sev: ['safe', 'caution', 'stop'].includes(d.sev) ? d.sev : 'caution',
            keywords: Array.isArray(d.keywords) ? d.keywords.slice(0, 20).map(k => ({ k: clip(k && k.k, 40), w: Math.min(6, Math.max(1, Number(k && k.w) || 2)) })).filter(k => k.k) : [],
            codes: Array.isArray(d.codes) ? d.codes.slice(0, 8).map(x => clip(x, 6).toUpperCase()).filter(x => /^[PBCU]\d{4}$/.test(x)) : [],
            parts: Array.isArray(d.parts) ? d.parts.slice(0, 8).map(x => ({ n: clip(x && x.n, 60), p: Math.max(0, Math.round(Number(x && x.p) || 0)), opt: !!(x && x.opt) })).filter(x => x.n) : [],
            labor: Math.max(0, Math.round(Number(d.labor) || 0)), advice: clip(d.advice, 500),
            models: Array.isArray(d.models) ? d.models.slice(0, 10).map(x => clip(x, 30)) : [],
            questions: Array.isArray(d.questions) ? d.questions.slice(0, 3).map(q => q && q.type === 'choice'
              ? { q: clip(q.q, 140), type: 'choice', options: (q.options || []).slice(0, 5).map(o => ({ l: clip(o && o.l, 40), kw: clip(o && o.kw, 40) })) }
              : { q: clip(q && q.q, 140), type: 'yesno', kw: clip(q && q.kw, 40) }).filter(q => q.q) : []
          };
          console.log('research ok:', m, sources.length, 'sources');
          return res.status(200).json({ draft, sources });
        } catch (e) { console.error('research fail:', m, String(e.message || e).slice(0, 200)); }
      }
      return res.status(502).json({ error: 'ai_failed' });
    }

    if (body.mode === 'partcheck') {
      if (!body.fault || !body.part) return res.status(400).json({ error: 'empty' });
      const make = String(body.car || '').split(' ').slice(0, -1).join(' ');
      const pkey = 'p:v1:' + (await sha256hex([normKey(make), normKey(body.fault), normKey(body.part)].join('|'))).slice(0, 40);
      const hit = await kv(['GET', pkey]);
      if (hit) { try { return res.status(200).json(Object.assign(JSON.parse(hit), { cached: true })); } catch (e) {} }
      const prompt = [
        'السيارة: ' + clip(body.car, 80),
        'العطل كما وصفه المالك أو شخّصه التطبيق: ' + clip(body.fault, 700),
        Array.isArray(body.known_parts) && body.known_parts.length ? 'القطع المعتادة لهذا العطل في قاعدة التطبيق: ' + body.known_parts.slice(0, 6).map(x => clip(x, 60)).join('، ') : '',
        'القطعة التي تقترح الورشة تغييرها: ' + clip(body.part, 60)
      ].filter(Boolean).join('\n');
      const valid = d => ['needed', 'maybe', 'unlikely'].includes(d.verdict);
      const { data: j } = await callAI(buildChain('light'), PARTCHECK_SYSTEM, prompt, 400, ctx, valid);
      const out = { verdict: j.verdict, reason: clip(j.reason, 300), how_to_verify: clip(j.how_to_verify, 250), cheaper_first: j.cheaper_first ? clip(j.cheaper_first, 150) : null };
      BG(kv(['SET', pkey, JSON.stringify(out), 'EX', CACHE_TTL]));
      return res.status(200).json(out);
    }

    if (body.mode === 'inspect') {
      const prompt = [
        'السيارة: ' + clip(body.car, 80),
        body.price ? 'السعر المطلوب: ' + clip(body.price, 30) : '',
        'التقييم المحسوب: ' + clip(body.score, 5) + '/100',
        'نتائج الفحص الذاتي:\n' + clip(body.findings, 3000)
      ].filter(Boolean).join('\n');
      if (!body.findings) return res.status(400).json({ error: 'empty' });
      const { data: j } = await callAI(buildChain('light'), INSPECT_SYSTEM, prompt, 700, ctx, d => typeof d.summary === 'string');
      return res.status(200).json({
        summary: clip(j.summary, 700),
        risks: Array.isArray(j.risks) ? j.risks.slice(0, 5).map(x => clip(x, 200)) : [],
        model_notes: j.model_notes ? clip(j.model_notes, 300) : '',
        next_steps: j.next_steps ? clip(j.next_steps, 300) : ''
      });
    }

    if (body.mode === 'vision') {
      const kind = body.kind === 'docs' ? 'vin' : VISION_KINDS[body.kind] ? body.kind : 'general';
      const imgs = Array.isArray(body.images) ? body.images.slice(0, 8) : [];
      const okImg = x => typeof x === 'string' && x.length > 100 && x.length < 600000 && /^[A-Za-z0-9+/=]+$/.test(x.slice(0, 200));
      if (!imgs.length || !imgs.every(okImg)) return res.status(400).json({ error: 'bad_images' });
      const content = imgs.map(d => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: d } }));
      content.push({ type: 'text', text: ['السيارة: ' + clip(body.car, 100), body.km ? 'الممشى المعلن: ' + clip(body.km, 20) + ' كم' : '', body.notes ? 'ملاحظات المستخدم: ' + clip(body.notes, 400) : '', 'عدد الصور: ' + imgs.length + (Array.isArray(body.labels) ? ' — ' + body.labels.slice(0, 8).map((l, i) => i + ': ' + clip(l, 40)).join('، ') : '')].filter(Boolean).join('\n') });
      const sys = VISION_BASE + '\n\n' + VISION_KINDS[kind];
      const deadline = Date.now() + 40000;
      const models = [...new Set(MAIN.concat(ESCALATE))].filter(m => !/^gemma/i.test(m));
      for (const m of models) {
        const left = deadline - Date.now(); if (left < 8000) break;
        try {
          const text = await callGemini({ name: 'gemini', key: ENV.GEMINI_API_KEY, model: m }, sys, content, 1800, Math.min(24000, left - 1000));
          const d = extractJson(text || '');
          if (!d || !Array.isArray(d.findings)) { console.error('vision bad output', m); continue; }
          const sev = v => ['ok', 'attention', 'problem'].includes(v) ? v : 'attention';
          return res.status(200).json({
            kind, model: m,
            verdict: ['good', 'attention', 'problem'].includes(d.verdict) ? d.verdict : 'attention',
            summary: noPii(clip(d.summary, 400)),
            findings: d.findings.slice(0, 12).map(f => ({ title: clip(f && f.title, 80), location: clip(f && f.location, 60), severity: sev(f && f.severity), confidence: f && f.confidence === 'low' ? 'low' : 'medium', advice: clip(f && f.advice, 200), frame: Number.isInteger(f && f.frame) && f.frame >= 0 && f.frame < imgs.length ? f.frame : null })).filter(f => f.title),
            ok: Array.isArray(d.ok) ? d.ok.slice(0, 8).map(x => clip(x, 60)) : [],
            extracted: d.extracted && typeof d.extracted === 'object' ? { vin: clip(d.extracted.vin, 20).toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''), dot: Array.isArray(d.extracted.dot) ? d.extracted.dot.slice(0, 6).map(x => clip(x, 12)) : [], odometer: clip(d.extracted.odometer, 20), lights: Array.isArray(d.extracted.lights) ? d.extracted.lights.slice(0, 8).map(x => clip(x, 40)) : [], battery: clip(d.extracted.battery, 30), dates: Array.isArray(d.extracted.dates) ? d.extracted.dates.slice(0, 10).map(x => clip(x, 40)) : [], oil: clip(d.extracted.oil, 120) } : {},
            retake: Array.isArray(d.retake) ? d.retake.filter(n => Number.isInteger(n)).slice(0, 8) : []
          });
        } catch (e) { console.error('vision fail:', m, String(e.message || e).slice(0, 200)); }
      }
      return res.status(502).json({ error: 'ai_failed' });
    }

    if (body.mode === 'measure') {
      const v = body.vib;
      if (v && ['idle', 'drive', 'brake'].includes(v.mode) && isFinite(+v.net) && +v.net >= 0 && +v.net < 20)
        BG((async () => { await kv(['LPUSH', 'vib:' + v.mode, JSON.stringify({ n: Math.round(+v.net * 10000) / 10000, hz: Math.round(+v.hz || 0), fs: Math.round(+v.fs || 0), at: Date.now() })]); await kv(['LTRIM', 'vib:' + v.mode, 0, 999]); })());
      const prompt = ['السيارة: ' + clip(body.car, 100), 'نوع القياس: ' + clip(body.kind, 40), 'نتيجة القياس: ' + clip(body.summary, 700), body.notes ? 'ملاحظات: ' + clip(body.notes, 300) : ''].filter(Boolean).join('\n');
      const valid = d => ['good', 'attention', 'problem'].includes(d.verdict) && d.title;
      const { data: j } = await callAI(buildChain('light'), MEASURE_SYSTEM, prompt, 600, ctx, valid);
      let peer = null; try { peer = await peerCompare(body.car, body.metric, Number(body.value)); } catch (e) {}
      return res.status(200).json({ verdict: j.verdict, title: clip(j.title, 100), explanation: clip(j.explanation, 500), causes: Array.isArray(j.causes) ? j.causes.slice(0, 5).map(x => clip(x, 120)) : [], advice: clip(j.advice, 300), peer });
    }

    if (body.mode === 'inspect2') {
      const stages = Array.isArray(body.stages) ? body.stages.slice(0, 12) : [];
      const prompt = ['السيارة: ' + clip(body.car, 100), 'الممشى: ' + clip(body.km, 20) + ' كم', 'السعر المطلوب: ' + clip(body.price, 20) + ' ر.س',
        'نتائج المراحل:\n' + (stages.length ? stages.map(st => '- ' + clip(st && st.name, 60) + ': ' + clip(st && st.text, 900)).join('\n') : 'لم تُفحص أي مرحلة'),
        body.codes ? 'أكواد الكمبيوتر: ' + clip(body.codes, 200) : '', body.notes ? 'ملاحظات المشتري: ' + clip(body.notes, 500) : ''].filter(Boolean).join('\n');
      const deadline = Date.now() + 40000;
      const models = [...new Set(ESCALATE.concat(MAIN))].filter(m => !/^gemma/i.test(m));
      for (const m of models) {
        const left = deadline - Date.now(); if (left < 8000) break;
        try {
          const text = await callGemini({ name: 'gemini', key: ENV.GEMINI_API_KEY, model: m }, INSPECT2_SYSTEM, prompt, 1500, Math.min(25000, left - 1000));
          const d = extractJson(text || '');
          if (!d || typeof d.score !== 'number') { console.error('inspect2 bad output', m); continue; }
          if (reportWallet) { reportWallet.rc = (reportWallet.rc || 0) - 1; await setWallet(body.wid, reportWallet); }
          return res.status(200).json({
            model: m, score: Math.max(0, Math.min(100, Math.round(d.score))),
            verdict: ['good', 'attention', 'problem'].includes(d.verdict) ? d.verdict : 'attention', verdict_label: clip(d.verdict_label, 40),
            confidence: ['high', 'medium', 'low'].includes(d.confidence) ? d.confidence : 'medium', summary: clip(d.summary, 500),
            red_flags: Array.isArray(d.red_flags) ? d.red_flags.slice(0, 8).map(f => ({ title: clip(f && f.title, 100), stage: clip(f && f.stage, 40), advice: clip(f && f.advice, 200) })).filter(f => f.title) : [],
            common_issues: Array.isArray(d.common_issues) ? d.common_issues.slice(0, 6).map(x => clip(x, 160)) : [],
            repair_cost_sar: Math.max(0, Math.round(Number(d.repair_cost_sar) || 0)), offer_price_sar: Math.max(0, Math.round(Number(d.offer_price_sar) || 0)),
            seller_line: clip(d.seller_line, 300)
          });
        } catch (e) { console.error('inspect2 fail:', m, String(e.message || e).slice(0, 200)); }
      }
      return res.status(502).json({ error: 'ai_failed' });
    }

    if (body.mode === 'invoice') {
      const image = String(body.image || '');
      if (!image || image.length > 4_000_000 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) return res.status(400).json({ error: 'bad_image' });
      const content = [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: 'اقرأ هذه الفاتورة. العملة المتوقعة: ' + clip(body.currency, 5) }
      ];
      const { data: j } = await callAI(buildChain('main'), INVOICE_SYSTEM, content, 800, ctx, d => Array.isArray(d.items));
      const items = j.items.slice(0, 20)
        .map(it => ({ name: clip(it.name, 60), price: Number(it.price) || 0 }))
        .filter(it => it.name && it.price > 0 && it.price < 1e6);
      return res.status(200).json({ items, labor: Number(j.labor) || null, total: Number(j.total) || null, currency: j.currency ? clip(j.currency, 6) : null });
    }

    if (body.mode === 'parts_sheet') {
      const image = String(body.image || '');
      if (!image || image.length > 4_000_000 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) return res.status(400).json({ error: 'bad_image' });
      const content = [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: 'السيارة: ' + clip(body.car, 80) + '\nالدولة: ' + clip(body.country, 30) + ' - ' + clip(body.city, 30) + '\nالعملة: ' + clip(body.currency, 5) }
      ];
      const { data: j } = await callAI(buildChain('main'), PARTS_SHEET_SYSTEM, content, 1200, ctx, d => Array.isArray(d.items));
      const num = v => { v = Number(v); return v > 0 && v < 1e7 ? Math.round(v * 100) / 100 : null; };
      const items = j.items.slice(0, 25).map(it => {
        let lo = num(it.fair_min), hi = num(it.fair_max); if (lo && hi && lo > hi) [lo, hi] = [hi, lo];
        return { name: clip(it.name, 70), part_no: it.part_no ? clip(it.part_no, 30) : null, qty: Math.max(1, Math.min(99, Math.round(Number(it.qty) || 1))), listed: num(it.listed_price), fair_min: lo, fair_max: hi };
      }).filter(it => it.name);
      return res.status(200).json({ items, currency: j.currency ? clip(j.currency, 6) : null, note: j.note ? clip(j.note, 200) : null });
    }

    return res.status(400).json({ error: 'unknown_mode' });
  } catch (e) {
    console.error(e);
    try { const k = 'ev:ai_fail:' + dayKey(); BG(kv(['INCR', k]).then(() => kv(['EXPIRE', k, 45 * 864e2]))); } catch (x) {}
    return res.status(502).json({ error: 'ai_failed' });
  }
}

// ---------- متغيرات البيئة: في Cloudflare تأتي مع كل طلب ----------
let ENV = {};
let BG = p => p;   // الكتابات الخلفية: تُكمَل بعد إرسال الرد عبر waitUntil
function initEnv() {
  CLAUDE_MODEL = ENV.ANTHROPIC_MODEL || 'claude-haiku-5-5';
  MAIN = list(ENV.GEMINI_MAIN_MODELS || ENV.GEMINI_MODEL || 'gemini-flash-lite-latest');
  LIGHT = list(ENV.GEMINI_LIGHT_MODELS || 'gemini-flash-lite-latest');
  GEMMA = list(ENV.GEMINI_GEMMA_MODELS || 'gemma-4-31b-it');
  ESCALATE = list(ENV.GEMINI_ESCALATE_MODELS || 'gemini-3.6-flash,gemini-flash-latest');
  REVIEW_MODELS = list(ENV.GEMINI_REVIEW_MODELS || 'gemini-flash-latest,gemini-3.6-flash');
  CURATE_MIN_USERS = Math.max(2, parseInt(ENV.CURATE_MIN_USERS || '3'));
  KV_URL = ENV.KV_REST_API_URL || ENV.UPSTASH_REDIS_REST_URL || '';
  KV_TOKEN = ENV.KV_REST_API_TOKEN || ENV.UPSTASH_REDIS_REST_TOKEN || '';
  FREE_PER_IP_DAY = Math.max(1, parseInt(ENV.FREE_PER_IP_DAY || '3'));
  OWNER = String(ENV.OWNER_EMAIL || '').trim().toLowerCase();   // بريد المالك من متغير البيئة OWNER_EMAIL في Cloudflare (لا يُكتب في الكود)
  FIREBASE_WEB_KEY = ENV.FIREBASE_API_KEY || 'AIzaSyACt18eL1b_k0udQwXNH0dq56DmMXL8iLE';
}

// ---------- نقطة الدخول في Cloudflare Pages Functions ----------
export async function onRequest(context) {
  ENV = Object.assign({}, context.env || {});
  initEnv();
  BG = p => { try { context.waitUntil(Promise.resolve(p).catch(() => {})); } catch (e) {} return p; };
  const request = context.request;
  const headers = {};
  request.headers.forEach((v, k) => { headers[k] = v; });
  headers['x-forwarded-for'] = request.headers.get('cf-connecting-ip') || headers['x-forwarded-for'] || '';
  if (!headers.host) { try { headers.host = new URL(request.url).host; } catch (e) {} }
  const body = request.method === 'POST' ? await request.text() : '';
  if (new URL(request.url).searchParams.get('src') === 'lemon' && request.method === 'POST') {
    const [st, o] = await lemonWebhook(body, request.headers.get('x-signature'));
    return new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json' } });
  }
  let status = 200, out = {};
  const resHeaders = { 'content-type': 'application/json; charset=utf-8' };
  const res = { setHeader(k, v) { resHeaders[k] = v; }, status(c) { status = c; return this; }, json(o) { out = o; return this; } };
  try { await handle({ method: request.method, headers, body }, res); }
  catch (e) { console.error(e); status = 500; out = { error: 'server_error' }; }
  return new Response(JSON.stringify(out), { status, headers: resHeaders });
}
