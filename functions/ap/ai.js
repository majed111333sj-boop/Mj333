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
// ---------- Web Crypto بدل وحدة crypto في Node ----------
const _enc = new TextEncoder();
async function sha256hex(s) { const b = await crypto.subtle.digest('SHA-256', _enc.encode(String(s))); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }

// ---------- التخزين المؤقت (Upstash Redis عبر REST) ----------
let KV_URL; // يُضبط في initEnv
let KV_TOKEN; // يُضبط في initEnv
const CACHE_TTL = 30 * 24 * 3600;   // 30 يوماً

async function kv(cmd) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch(KV_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + KV_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(cmd), signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return (await r.json()).result;
  } catch (e) { return null; }
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

const INVOICE_SYSTEM = `أنت تقرأ صور فواتير ورش السيارات وقطع الغيار في دول الخليج.
استخرج بنود القطع وأسعارها كما هي في الفاتورة (السعر النهائي لكل بند بعد الكمية إن وجد)، وأجرة اليد إن وجدت.
أجب بكائن JSON فقط: {"items":[{"name":"اسم القطعة بالعربية","price":number}], "labor": number|null, "total": number|null, "currency": "رمز العملة إن ظهر"|null}
إذا لم تكن الصورة فاتورة واضحة فأرجع {"items":[]}.`;

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
const PAY_MODES = new Set(['wallet', 'use_free', 'redeem', 'codes_create', 'pay_stats', 'pay_webhook']);
const PRODUCTS = { day: { days: 1 }, day3: { days: 3 }, annual: { days: 365 } };
const GATED_FREE = new Set(['diagnose', 'questions', 'inspect']);   // يُسمح بها ضمن الخدمة المجانية الأولى
const GATED_PAID = new Set(['partcheck', 'invoice']);                // تحتاج وصولاً مدفوعاً دائماً
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
async function walletView(wid, ip, w) {
  const f = await freeState(wid, ip, w);
  return { passUntil: passActive(w) ? w.pass : 0, freeAvailable: !f.used, freeDid: f.did };
}
function applyProduct(w, product) {
  const p = PRODUCTS[product]; if (!p) return false;
  w.pass = Math.max(w.pass || 0, Date.now()) + p.days * 864e5;
  return true;
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
  const w = await getWallet(body.wid);
  if (passActive(w)) return { ok: true };
  if (GATED_PAID.has(body.mode)) return { ok: false };
  const did = validDid(body.did) ? body.did : null;
  const f = await freeState(body.wid, ip, w);
  if (f.used) return { ok: !!did && f.did === did };
  if (!did) return { ok: false };
  if (body.mode === 'questions') return { ok: true };              // الأسئلة تسبق التشخيص في نفس الخدمة
  w.freeDid = did; await setWallet(body.wid, w);
  await kv(['INCR', (await ipKey(ip))]); await kv(['EXPIRE', (await ipKey(ip)), 24 * 3600]);
  await kv(['INCR', 'stat:free']);
  return { ok: true };
}

async function payHandler(body, ip, res) {
  if (!KV_URL || !KV_TOKEN) return res.status(503).json({ error: 'not_configured' });
  const wid = body.wid;

  if (body.mode === 'wallet') {
    if (!validWid(wid)) return res.status(400).json({ error: 'bad_wallet' });
    return res.status(200).json(await walletView(wid, ip, await getWallet(wid)));
  }

  if (body.mode === 'use_free') {   // لخدمات بدون ذكاء اصطناعي (مثل نتيجة الفحص قبل الشراء)
    if (!validWid(wid) || !validDid(body.did)) return res.status(400).json({ error: 'bad_request' });
    const g = await accessGate(Object.assign({}, body, { mode: 'inspect' }), ip);
    return res.status(g.ok ? 200 : 402).json(Object.assign({ ok: g.ok }, await walletView(wid, ip, await getWallet(wid))));
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
    return res.status(200).json(Object.assign({ ok: true, product: c.t }, await walletView(wid, ip, w)));
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
    const keys = ['free', 'blocked'].concat(Object.keys(PRODUCTS).flatMap(t => ['redeem:' + t, 'codes:' + t, 'paid:' + t]));
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
  if (!token || typeof token !== 'string' || token.length > 4000) return null;
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

  // 💳 المحفظة والدفع: لا تحتاج مفاتيح ذكاء اصطناعي
  if (PAY_MODES.has(body.mode)) return payHandler(body, ip, res);
  if (GATED_FREE.has(body.mode) || GATED_PAID.has(body.mode)) {
    const g = await accessGate(body, ip);
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
        question: j.question ? clip(j.question, 200) : null,
        model
      };
      // لا نحفظ إلا التشخيص الواثق (عالي أو متوسط)
      if (key && out.confidence !== 'low') BG(kv(['SET', key, JSON.stringify(out), 'EX', CACHE_TTL]));
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
  OWNER = String(ENV.OWNER_EMAIL || 'majed111333sj@gmail.com').toLowerCase();
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
  let status = 200, out = {};
  const resHeaders = { 'content-type': 'application/json; charset=utf-8' };
  const res = { setHeader(k, v) { resHeaders[k] = v; }, status(c) { status = c; return this; }, json(o) { out = o; return this; } };
  try { await handle({ method: request.method, headers, body }, res); }
  catch (e) { console.error(e); status = 500; out = { error: 'server_error' }; }
  return new Response(JSON.stringify(out), { status, headers: resHeaders });
}
