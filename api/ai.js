// دالة الذكاء الاصطناعي على Vercel: تشخيص الأعطال + قراءة الفواتير
// تعمل مع Gemini أو Claude حسب المفتاح الموجود في إعدادات Vercel:
//   GEMINI_API_KEY    ← يستخدم Google Gemini (له فئة مجانية)
//   ANTHROPIC_API_KEY ← يستخدم Anthropic Claude
// إذا وُجد الاثنان يُستخدم Gemini، ويمكن الإجبار بالمتغير AI_PROVIDER = gemini أو claude

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

function pickProvider() {
  const forced = String(process.env.AI_PROVIDER || '').toLowerCase();
  const g = process.env.GEMINI_API_KEY, a = process.env.ANTHROPIC_API_KEY;
  if (forced === 'claude' && a) return { name: 'claude', key: a };
  if (forced === 'gemini' && g) return { name: 'gemini', key: g };
  if (g) return { name: 'gemini', key: g };
  if (a) return { name: 'claude', key: a };
  return null;
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

async function callClaude(apiKey, system, content, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] })
  });
  if (!r.ok) throw new Error('claude ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200));
  const data = await r.json();
  return (data.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
}

async function callGemini(apiKey, system, content, maxTokens) {
  const parts = (Array.isArray(content) ? content : [{ type: 'text', text: content }]).map(c =>
    c.type === 'image' ? { inline_data: { mime_type: c.source.media_type, data: c.source.data } } : { text: c.text });
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(GEMINI_MODEL) + ':generateContent';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: maxTokens + 2048, responseMimeType: 'application/json', temperature: 0.3 }
    })
  });
  if (!r.ok) throw new Error('gemini ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200));
  const data = await r.json();
  const c = (data.candidates || [])[0];
  return ((c && c.content && c.content.parts) || []).filter(x => x.text && !x.thought).map(x => x.text).join('\n');
}

function callAI(provider, system, content, maxTokens) {
  return provider.name === 'gemini'
    ? callGemini(provider.key, system, content, maxTokens)
    : callClaude(provider.key, system, content, maxTokens);
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
 "checks": ["فحص محدد يطلبه من الفني", "..."], "question": "سؤال واحد للمالك إذا كانت الثقة منخفضة، وإلا null"}`;const INVOICE_SYSTEM = `أنت تقرأ صور فواتير ورش السيارات وقطع الغيار في دول الخليج.
استخرج بنود القطع وأسعارها كما هي في الفاتورة (السعر النهائي لكل بند بعد الكمية إن وجد)، وأجرة اليد إن وجدت.
أجب بكائن JSON فقط: {"items":[{"name":"اسم القطعة بالعربية","price":number}], "labor": number|null, "total": number|null, "currency": "رمز العملة إن ظهر"|null}
إذا لم تكن الصورة فاتورة واضحة فأرجع {"items":[]}.`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const provider = pickProvider();
  if (!provider) return res.status(503).json({ error: 'not_configured' });

  // نقبل الطلبات من نفس الموقع فقط
  const origin = req.headers.origin || '';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  if (origin && host && !origin.endsWith('//' + host)) return res.status(403).json({ error: 'forbidden' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'too_many_requests' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

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

      const text = await callAI(provider, DIAG_SYSTEM, prompt, 700);
      const j = extractJson(text);
      if (!j || !j.title) return res.status(502).json({ error: 'bad_output' });
      return res.status(200).json({
        kb_id: ids.has(j.kb_id) ? j.kb_id : null,
        title: clip(j.title, 120),
        severity: ['safe', 'caution', 'stop'].includes(j.severity) ? j.severity : 'caution',
        confidence: ['high', 'medium', 'low'].includes(j.confidence) ? j.confidence : 'medium',
        explanation: clip(j.explanation, 600),
        advice: clip(j.advice, 500),
        checks: Array.isArray(j.checks) ? j.checks.slice(0, 5).map(c => clip(c, 140)) : [],
        question: j.question ? clip(j.question, 200) : null
      });
    }

    if (body.mode === 'invoice') {
      const image = String(body.image || '');
      if (!image || image.length > 4_000_000 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) return res.status(400).json({ error: 'bad_image' });
      const content = [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: 'اقرأ هذه الفاتورة. العملة المتوقعة: ' + clip(body.currency, 5) }
      ];
      const text = await callAI(provider, INVOICE_SYSTEM, content, 800);
      const j = extractJson(text) || { items: [] };
      const items = Array.isArray(j.items) ? j.items.slice(0, 20)
        .map(it => ({ name: clip(it.name, 60), price: Number(it.price) || 0 }))
        .filter(it => it.name && it.price > 0 && it.price < 1e6) : [];
      return res.status(200).json({ items, labor: Number(j.labor) || null, total: Number(j.total) || null, currency: j.currency ? clip(j.currency, 6) : null });
    }

    return res.status(400).json({ error: 'unknown_mode' });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'ai_failed' });
  }
};
