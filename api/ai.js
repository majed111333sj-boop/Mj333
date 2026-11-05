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

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
const MAIN = list(process.env.GEMINI_MAIN_MODELS || process.env.GEMINI_MODEL || 'gemini-flash-lite-latest');
const LIGHT = list(process.env.GEMINI_LIGHT_MODELS || 'gemini-flash-lite-latest');
const GEMMA = list(process.env.GEMINI_GEMMA_MODELS || 'gemma-4-31b-it');
const ESCALATE = list(process.env.GEMINI_ESCALATE_MODELS || 'gemini-3.6-flash,gemini-flash-latest');
const RANK = { low: 0, medium: 1, high: 2 };

function buildChain(task) {
  const g = process.env.GEMINI_API_KEY, a = process.env.ANTHROPIC_API_KEY;
  const order = (task === 'light' ? LIGHT.concat(MAIN) : MAIN.concat(LIGHT)).concat(GEMMA);
  const gem = g ? [...new Set(order)].map(m => ({ name: 'gemini', key: g, model: m })) : [];
  const cla = a ? [{ name: 'claude', key: a, model: CLAUDE_MODEL }] : [];
  return String(process.env.AI_PROVIDER || '').toLowerCase() === 'claude' ? cla.concat(gem) : gem.concat(cla);
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
  const key = process.env.GEMINI_API_KEY;
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
أجب بكائن JSON فقط بدون أي نص آخر، بهذا الشكل:
{"kb_id": string|null, "title": "اسم العطل المرجّح باختصار", "severity": "safe"|"caution"|"stop", "confidence": "high"|"medium"|"low",
 "explanation": "شرح مبسط في جملتين لسبب ترجيح هذا العطل", "advice": "نصيحة عملية للمالك في جملة أو جملتين",
 "checks": ["فحص محدد يطلبه من الفني", "..."], "question": "سؤال واحد للمالك إذا كانت الثقة منخفضة، وإلا null"}`;

const INVOICE_SYSTEM = `أنت تقرأ صور فواتير ورش السيارات وقطع الغيار في دول الخليج.
استخرج بنود القطع وأسعارها كما هي في الفاتورة (السعر النهائي لكل بند بعد الكمية إن وجد)، وأجرة اليد إن وجدت.
أجب بكائن JSON فقط: {"items":[{"name":"اسم القطعة بالعربية","price":number}], "labor": number|null, "total": number|null, "currency": "رمز العملة إن ظهر"|null}
إذا لم تكن الصورة فاتورة واضحة فأرجع {"items":[]}.`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'not_configured' });

  // نقبل الطلبات من نفس الموقع فقط
  const origin = req.headers.origin || '';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  if (origin && host && !origin.endsWith('//' + host)) return res.status(403).json({ error: 'forbidden' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'too_many_requests' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

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
        body.description ? 'وصف المالك: ' + clip(body.description, 600) : '',
        body.code ? 'كود العطل: ' + clip(body.code, 10) : '',
        body.sound ? 'تحليل صوت مسجّل من الجوال: ' + clip(body.sound, 300) : '',
        body.context ? 'متى يظهر الصوت: ' + clip(body.context, 60) : '',
        body.localGuess ? 'ترجيح أولي من نظام بسيط: ' + clip(body.localGuess, 20) : '',
        'قائمة kb_id المتاحة: ' + JSON.stringify(catalog)
      ].filter(Boolean).join('\n');
      if (!body.description && !body.code && !body.sound) return res.status(400).json({ error: 'empty' });

      const { data: j, model } = await diagnose(prompt, ctx);
      return res.status(200).json({
        kb_id: ids.has(j.kb_id) ? j.kb_id : null,
        title: clip(j.title, 120),
        severity: ['safe', 'caution', 'stop'].includes(j.severity) ? j.severity : 'caution',
        confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'medium',
        explanation: clip(j.explanation, 600),
        advice: clip(j.advice, 500),
        checks: Array.isArray(j.checks) ? j.checks.slice(0, 5).map(c => clip(c, 140)) : [],
        question: j.question ? clip(j.question, 200) : null,
        model
      });
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

    return res.status(400).json({ error: 'unknown_mode' });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'ai_failed' });
  }
};
