// اختبارات الخادم: المحفظة والدفع والخدمة المجانية والأرصدة والترجمة. تعمل بدون إنترنت (Redis وGemini وهميان)
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { onRequest } from '../functions/api/ai.js';

// ---------- Redis وهمي بنفس واجهة Upstash REST ----------
const store = new Map();
function redis(cmd) {
  const [op, k, ...a] = cmd; const O = op.toUpperCase();
  const get = key => (store.has(key) ? store.get(key) : null);
  switch (O) {
    case 'GET': return get(k);
    case 'SET': { const nx = a.includes('NX'); if (nx && store.has(k)) return null; store.set(k, String(a[0])); return 'OK'; }
    case 'EXISTS': return store.has(k) ? 1 : 0;
    case 'DEL': return store.delete(k) ? 1 : 0;
    case 'INCR': { const v = (+get(k) || 0) + 1; store.set(k, String(v)); return v; }
    case 'INCRBY': { const v = (+get(k) || 0) + (+a[0]); store.set(k, String(v)); return v; }
    case 'EXPIRE': return 1;
    case 'MGET': return [k].concat(a).map(get);
    case 'SADD': { const s = new Set(JSON.parse(get(k) || '[]')); a.forEach(x => s.add(x)); store.set(k, JSON.stringify([...s])); return 1; }
    case 'SREM': { const s = new Set(JSON.parse(get(k) || '[]')); a.forEach(x => s.delete(x)); store.set(k, JSON.stringify([...s])); return 1; }
    case 'SMEMBERS': return JSON.parse(get(k) || '[]');
    case 'LPUSH': { const l = JSON.parse(get(k) || '[]'); l.unshift(a[0]); store.set(k, JSON.stringify(l)); return l.length; }
    case 'LTRIM': return 'OK';
    default: return null;
  }
}
// الهاش يحتاج معالجة خاصة لأن أول وسيط بعد المفتاح هو الحقل
function redisFull(cmd) {
  const O = cmd[0].toUpperCase();
  if (O === 'HSET') { const k = cmd[1], h = JSON.parse(store.get(k) || '{}'); for (let i = 2; i + 1 < cmd.length; i += 2) h[cmd[i]] = cmd[i + 1]; store.set(k, JSON.stringify(h)); return (cmd.length - 2) / 2; }
  if (O === 'HMGET') { const h = JSON.parse(store.get(cmd[1]) || '{}'); return cmd.slice(2).map(f => (f in h ? h[f] : null)); }
  if (O === 'HGETALL') { const h = JSON.parse(store.get(cmd[1]) || '{}'); return Object.entries(h).flat(); }
  return redis(cmd);
}

let geminiText = null;   // ما يعيده Gemini الوهمي
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u === 'https://kv.test') { const r = redisFull(JSON.parse(init.body)); return new Response(JSON.stringify({ result: r }), { status: 200 }); }
  if (u.includes('generativelanguage.googleapis.com')) {
    if (geminiText == null) return new Response('no', { status: 500 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: geminiText }] } }] }), { status: 200 });
  }
  return new Response('{}', { status: 404 });
};

const ENV = { KV_REST_API_URL: 'https://kv.test', KV_REST_API_TOKEN: 't', GEMINI_API_KEY: 'g', LEMON_SIGNING_SECRET: 'sec',
  LEMON_CHECKOUT_FULL: 'https://shop.lemonsqueezy.com/checkout/buy/full', LEMON_CHECKOUT_FULL_US: 'https://shop-us.lemonsqueezy.com/checkout/buy/full',
  LEMON_CHECKOUT_DIAG: 'https://shop.lemonsqueezy.com/checkout/buy/diag', OWNER_EMAIL: '' };
let ipN = 0;
async function api(body, { env = {}, headers = {} } = {}) {
  const ip = '10.0.' + Math.floor(ipN / 250) + '.' + (ipN++ % 250);
  const req = new Request('https://app.test/api/ai', { method: 'POST', body: JSON.stringify(body), headers: Object.assign({ 'cf-connecting-ip': ip }, headers) });
  const res = await onRequest({ env: Object.assign({}, ENV, env), request: req, waitUntil: () => {} });
  return { status: res.status, json: await res.json() };
}
async function lemon(wid, productName, { event = 'order_created', id = String(Math.random()).slice(2, 10) } = {}) {
  const raw = JSON.stringify({ meta: { event_name: event, custom_data: { wid } }, data: { id, attributes: { status: 'paid', first_order_item: { product_name: productName, variant_id: 1 } } } });
  const sig = crypto.createHmac('sha256', 'sec').update(raw).digest('hex');
  const req = new Request('https://app.test/api/ai?src=lemon', { method: 'POST', body: raw, headers: { 'x-signature': sig } });
  const res = await onRequest({ env: Object.assign({}, ENV), request: req, waitUntil: () => {} });
  return { status: res.status, json: await res.json(), id };
}
const wid = () => 'w_' + crypto.randomBytes(8).toString('hex');
const did = () => 'd' + crypto.randomBytes(5).toString('hex');
const diagBody = (w, d, extra) => Object.assign({ mode: 'diagnose', wid: w, did: d, car: 'تويوتا كامري 2018', description: 'صوت طقطقة عند اللف ' + d, catalog: [{ id: 'cv', title: 'جوزة' }] }, extra);

test.beforeEach(() => { store.clear(); geminiText = JSON.stringify({ kb_id: 'cv', title: 'تلف جوزة العكس', severity: 'caution', confidence: 'medium', explanation: 'شرح', advice: 'افحص', checks: [], question: null }); });

test('محفظة جديدة: الخدمة المجانية متاحة والأرصدة صفر', async () => {
  const w = wid(); const r = await api({ mode: 'wallet', wid: w });
  assert.equal(r.status, 200); assert.equal(r.json.freeAvailable, true);
  assert.equal(r.json.uses, 0); assert.equal(r.json.toolUses, 0); assert.equal(r.json.freeChoice, null); assert.deepEqual(r.json.unlocked, []);
});

test('اختيار الخدمة المجانية يُحفظ مرة واحدة ولا يتغير', async () => {
  const w = wid();
  assert.equal((await api({ mode: 'set_free_choice', wid: w, choice: 'parts_prices' })).json.freeChoice, 'parts_prices');
  const again = await api({ mode: 'set_free_choice', wid: w, choice: 'diag_only' });
  assert.equal(again.json.freeChoice, 'parts_prices');
  assert.equal((await api({ mode: 'wallet', wid: w })).json.freeChoice, 'parts_prices');
  assert.equal((await api({ mode: 'set_free_choice', wid: w, choice: 'hack' })).status, 400);
});

test('الخدمة المجانية: فحص واحد فقط ثم 402 لفحص آخر، ويُسمح بنفس الفحص', async () => {
  const w = wid(), d1 = did(), d2 = did();
  assert.equal((await api(diagBody(w, d1))).status, 200);
  assert.equal((await api(diagBody(w, d1))).status, 200);          // نفس الخدمة
  assert.equal((await api(diagBody(w, d2))).status, 402);          // خدمة جديدة
  const v = (await api({ mode: 'wallet', wid: w })).json;
  assert.equal(v.freeAvailable, false); assert.equal(v.freeDid, d1);
});

test('باقة 3 فحوصات: تُخصم مرة لكل فحص جديد ولا تُخصم لتكرار نفس الفحص', async () => {
  const w = wid();
  await api(diagBody(w, did()));                                    // تستهلك المجاني
  assert.equal((await lemon(w, 'Pack3 - 3 فحوصات')).status, 200);
  assert.equal((await api({ mode: 'wallet', wid: w })).json.uses, 3);
  const a = did(), b = did(), c = did(), e = did();
  assert.equal((await api(diagBody(w, a))).status, 200);
  assert.equal((await api(diagBody(w, a))).status, 200);          // نفس الفحص: بلا خصم
  assert.equal((await api({ mode: 'wallet', wid: w })).json.uses, 2);
  assert.equal((await api(diagBody(w, b))).status, 200);
  assert.equal((await api(diagBody(w, c))).status, 200);
  assert.equal((await api(diagBody(w, e))).status, 402);          // انتهى الرصيد
  const v = (await api({ mode: 'wallet', wid: w })).json;
  assert.equal(v.uses, 0); assert.ok(v.unlocked.includes(a));
});

test('أسماء منتجات Lemon الفعلية في المتجر تُعرف صحيحاً', async () => {
  const names = { 'الفاحص الذكي – باقة الأدوات': 'tools', 'الفاحص الذكي / باقة ٣ فحوصات': 'pack3', 'الفاحص الذكي / باقة الاسبوع': 'week', 'الفاحص الذكي / باقة اليوم': 'day', 'فحص سيارة مستعملة قبل الشراء': 'report' };
  for (const [name, prod] of Object.entries(names)) {
    const w = wid(); await lemon(w, name); const v = (await api({ mode: 'wallet', wid: w })).json;
    const got = prod === 'tools' ? v.toolUses === 5 : prod === 'pack3' ? v.uses === 3 : prod === 'report' ? v.reports === 1 : v.passUntil > Date.now();
    assert.ok(got, name);
  }
});

test('اليوم والأسبوع: وصول زمني، والاسترجاع يلغيه', async () => {
  const w = wid(); await api(diagBody(w, did()));
  const o = await lemon(w, 'Week - أسبوع كامل');
  let v = (await api({ mode: 'wallet', wid: w })).json;
  assert.ok(v.passUntil > Date.now() + 6.5 * 864e5 && v.passUntil < Date.now() + 7.5 * 864e5);
  assert.equal((await api(diagBody(w, did()))).status, 200);
  await lemon(w, 'Week - أسبوع كامل', { event: 'order_refunded', id: o.id });
  v = (await api({ mode: 'wallet', wid: w })).json;
  assert.equal(v.passUntil, 0);
  assert.equal((await api(diagBody(w, did()))).status, 402);
});

test('استرجاع باقة الفحوصات يخصم رصيدها ولا ينزل عن الصفر', async () => {
  const w = wid(); const o = await lemon(w, 'Pack3');
  await api(diagBody(w, did())); // مجاني
  await api(diagBody(w, did())); // خصم 1
  await lemon(w, 'Pack3', { event: 'order_refunded', id: o.id });
  assert.equal((await api({ mode: 'wallet', wid: w })).json.uses, 0);
});

test('باقة الأدوات: 5 استخدامات للأدوات المستقلة فقط', async () => {
  const w = wid(); await api({ mode: 'measure', wid: w, did: 't' + did(), summary: 'x', kind: 'k', tool: 'tires' });   // مجاني (فشل AI لا يهم: الخدمة استُهلكت)
  assert.equal((await api({ mode: 'measure', wid: w, did: 't' + did(), summary: 'x', tool: 'tires' })).status, 402);
  await lemon(w, 'Tools - باقة الأدوات');
  assert.equal((await api({ mode: 'wallet', wid: w })).json.toolUses, 5);
  geminiText = JSON.stringify({ verdict: 'good', title: 'سليم', explanation: '', causes: [], advice: '' });
  assert.notEqual((await api({ mode: 'measure', wid: w, did: 't' + did(), summary: 'x', tool: 'tires' })).status, 402);
  assert.equal((await api({ mode: 'wallet', wid: w })).json.toolUses, 4);
  assert.equal((await api(diagBody(w, did()))).status, 402);       // لا تفتح التشخيص
});

test('فحص القطع لا يعمل إلا بوصول مدفوع أو فحص مفتوح', async () => {
  const w = wid(), d = did();
  await api(diagBody(w, d));                                        // المجاني
  const pc = { mode: 'partcheck', wid: w, did: d, car: 'x', fault: 'عطل', part: 'قطعة' };
  assert.equal((await api(pc)).status, 402);
  await lemon(w, 'Pack3'); const d2 = did(); await api(diagBody(w, d2));   // رصيد قديم يعامل كوافٍ
  assert.notEqual((await api(Object.assign({}, pc, { did: d2 }))).status, 402);
});

test('مدقق الفاتورة: مرة واحدة لمن اختار القطع والأسعار مجاناً', async () => {
  const w = wid(); await api({ mode: 'set_free_choice', wid: w, choice: 'parts_prices' }); await api(diagBody(w, did()));
  const inv = { mode: 'invoice', wid: w, did: did(), image: 'A'.repeat(300) };
  geminiText = JSON.stringify({ items: [{ name: 'فلتر', price: 50 }] });
  assert.equal((await api(inv)).status, 200);
  assert.equal((await api(inv)).status, 200);                        // نفس did: بلا خصم ثانٍ
  assert.equal((await api(Object.assign({}, inv, { did: did() }))).status, 402);
  const w2 = wid(); await api(diagBody(w2, did()));                  // لم يختر القطع والأسعار
  assert.equal((await api(Object.assign({}, inv, { wid: w2 }))).status, 402);
});

test('تقييم الدقة للمشتركين فقط', async () => {
  const w = wid(), d = did();
  assert.equal((await api({ mode: 'feedback', wid: w, did: d, result: 'yes' })).status, 403);
  await lemon(w, 'Day');
  assert.equal((await api({ mode: 'feedback', wid: w, did: d, result: 'yes' })).status, 200);
  assert.equal((await api({ mode: 'feedback', wid: w, did: did(), result: 'bogus' })).status, 400);
});

test('روابط الدفع: العام، وخاص المنطقة، ولا روابط غير موثوقة', async () => {
  const w = wid();
  let l = (await api({ mode: 'wallet', wid: w })).json.links; assert.match(l.full, /shop\.lemonsqueezy/); assert.ok(l.diag); assert.equal(l.upgrade, undefined);
  l = (await api({ mode: 'wallet', wid: w, cc: 'US' })).json.links; assert.match(l.full, /shop-us/);
  l = (await api({ mode: 'wallet', wid: w }, { env: { LEMON_CHECKOUT_UPGRADE: 'https://evil.example/pay' } })).json.links; assert.equal(l.upgrade, undefined);
});

test('Webhook: توقيع خاطئ يُرفض، والتكرار لا يضاعف الرصيد', async () => {
  const w = wid(); const bad = new Request('https://app.test/api/ai?src=lemon', { method: 'POST', body: '{}', headers: { 'x-signature': 'abc' } });
  assert.equal((await onRequest({ env: ENV, request: bad, waitUntil: () => {} })).status, 401);
  const o = await lemon(w, 'Pack3'); await lemon(w, 'Pack3', { id: o.id });
  assert.equal((await api({ mode: 'wallet', wid: w })).json.uses, 3);
});

test('الدول والترجمة', async () => {
  const g = await api({ mode: 'geo' }, { headers: { 'cf-ipcountry': 'SA' } }); assert.deepEqual(g.json, { country: 'SA', supported: true });
  assert.equal((await api({ mode: 'geo' })).json.supported, false);
  geminiText = JSON.stringify({ map: { 'افحص {0} سيارة': 'Check {0} cars', 'مرحبا': 'Hi {0}' } });
  const r = await api({ mode: 'i18n', lang: 'en', strings: ['افحص {0} سيارة', 'مرحبا'] });
  assert.equal(r.json.map['افحص {0} سيارة'], 'Check {0} cars');
  assert.equal(r.json.map['مرحبا'], undefined);                     // رمز {0} مضاف: مرفوض
  const pack = await api({ mode: 'i18n_pack', lang: 'en' }); assert.equal(pack.json.map['افحص {0} سيارة'], 'Check {0} cars');
  assert.equal((await api({ mode: 'i18n', lang: 'ar', strings: ['x'] })).status, 400);
});

test('تقرير PDF: يحتاج وصولاً مدفوعاً أو فحصاً مفتوحاً، ولا يخترع أرقاماً', async () => {
  const w = wid(), facts = { car: 'كامري 2018', title: 'تلف جوزة', total: '500 ر.س', parts: ['جوزة'], advice: 'افحص' };
  assert.equal((await api({ mode: 'report_write', wid: w, did: did(), facts })).status, 402);
  await lemon(w, 'Day');
  const r = await api({ mode: 'report_write', wid: w, did: did(), facts });
  assert.equal(r.status, 200); assert.match(r.json.body, /500 ر\.س/); assert.match(r.json.body, /جوزة/);
});

test('لوحة المالك مغلقة عند عدم ضبط OWNER_EMAIL', async () => {
  assert.equal((await api({ mode: 'codes_create', token: 'x'.repeat(50), product: 'day', count: 1 })).status, 403);
});

test('ميزات غير مكتملة تعيد 501 بوضوح', async () => {
  assert.equal((await api({ mode: 'insp_get', id: 'abcd' })).status, 501);
  assert.equal((await api({ mode: 'rpack_list', token: 'x' })).status, 501);
});

// ---------- 3.2.0: الأرصدة لكل خدمة ----------
const cr = async w => (await api({ mode: 'wallet', wid: w })).json.cr;
const PC = (w, d) => ({ mode: 'partcheck', wid: w, did: d, car: 'x', fault: 'عطل', part: 'قطعة' });

test('3.2.0: أسماء المنتجات الجديدة تُعرف وتمنح الرصيد الصحيح', async () => {
  const cases = [['الفحص الوافي', 'full'], ['فحص السيارة + قطع الأعطال', 'diag'], ['ترقية إلى الفحص الوافي', 'upg'], ['أسعار القطع', 'prices'], ['أداة فحص أساسية', 'tm'], ['أداة فحص فرعية', 'ts']];
  for (const [name, key] of cases) { const w = wid(); await lemon(w, name); const c = await cr(w); assert.equal(c[key], 1, name); assert.equal(Object.values(c).reduce((a, b) => a + b, 0), 1, name); }
  const w = wid(); await lemon(w, 'فحص سيارة مستعملة قبل الشراء'); assert.equal((await api({ mode: 'wallet', wid: w })).json.reports, 1);
  const w5 = wid(); await lemon(w5, 'باقة 5 فحوصات مستعملة'); assert.equal((await api({ mode: 'wallet', wid: w5 })).json.reports, 5);
});

test('3.2.0: الفحص الوافي يخصم رصيده ويفتح قطع الأعطال والتقرير', async () => {
  const w = wid(), d = did(); await api(diagBody(w, did()));          // المجاني
  await lemon(w, 'الفحص الوافي');
  assert.equal((await api(diagBody(w, d, { level: 'full' }))).status, 200);
  assert.equal((await cr(w)).full, 0);
  const v = (await api({ mode: 'wallet', wid: w })).json; assert.ok(v.unlocked.includes(d) && v.fullUnlocked.includes(d));
  assert.notEqual((await api(PC(w, d))).status, 402);
  assert.equal((await api({ mode: 'report_write', wid: w, did: d, facts: { title: 'ت' } })).status, 200);
});

test('3.2.0: فحص السيارة + قطع الأعطال لا يفتح الوافي حتى الترقية، والترقية لا تُخصم مرتين', async () => {
  const w = wid(), d = did(); await api(diagBody(w, did()));
  await lemon(w, 'فحص السيارة + قطع الأعطال');
  assert.equal((await api(diagBody(w, d))).status, 200);
  assert.equal((await cr(w)).diag, 0);
  assert.equal((await api(PC(w, d))).status, 402);                   // قطع الأعطال تحتاج الوافي
  assert.equal((await api({ mode: 'report_write', wid: w, did: d, facts: { title: 'ت' } })).status, 402);
  assert.equal((await api({ mode: 'upgrade', wid: w, did: d })).status, 402);   // لا رصيد ترقية
  await lemon(w, 'ترقية إلى الفحص الوافي'); await lemon(w, 'ترقية إلى الفحص الوافي');
  assert.equal((await api({ mode: 'upgrade', wid: w, did: d })).status, 200);
  assert.equal((await api({ mode: 'upgrade', wid: w, did: d })).status, 200);   // نفس الفحص: بلا خصم
  assert.equal((await cr(w)).upg, 1);
  assert.notEqual((await api(PC(w, d))).status, 402);
  assert.equal((await api({ mode: 'upgrade', wid: w, did: did() })).status, 404);   // فحص غير معروف
});

test('3.2.0: الأسعار: خصم لكل did مرة واحدة', async () => {
  const w = wid(); await api(diagBody(w, did()));
  const d = did();
  assert.equal((await api({ mode: 'use_prices', wid: w, did: d })).status, 402);
  await lemon(w, 'أسعار القطع'); await lemon(w, 'أسعار القطع');
  assert.equal((await api({ mode: 'use_prices', wid: w, did: d })).status, 200);
  assert.equal((await api({ mode: 'use_prices', wid: w, did: d })).status, 200);
  assert.equal((await cr(w)).prices, 1);
  geminiText = JSON.stringify({ items: [{ name: 'فلتر', price: 50 }] });
  assert.equal((await api({ mode: 'invoice', wid: w, did: did(), image: 'A'.repeat(300) })).status, 200);
  assert.equal((await cr(w)).prices, 0);
});

test('3.2.0: الأدوات الأساسية والفرعية رصيدان منفصلان', async () => {
  const w = wid(); await api({ mode: 'measure', wid: w, did: 't' + did(), summary: 'x', tool: 'camera' });   // المجاني
  geminiText = JSON.stringify({ verdict: 'good', title: 'سليم', explanation: '', causes: [], advice: '' });
  await lemon(w, 'أداة فحص أساسية');
  assert.equal((await api({ mode: 'measure', wid: w, did: 't' + did(), summary: 'x', tool: 'tires' })).status, 402);   // فرعية: لا تُدفع بالأساسي
  assert.notEqual((await api({ mode: 'measure', wid: w, did: 't' + did(), summary: 'x', tool: 'vibration' })).status, 402);
  assert.equal((await cr(w)).tm, 0);
  await lemon(w, 'أداة فحص فرعية');
  assert.notEqual((await api({ mode: 'measure', wid: w, did: 't' + did(), summary: 'x', tool: 'tires' })).status, 402);
  assert.equal((await cr(w)).ts, 0);
});

test('3.2.0: الاسترجاع يخصم الرصيد الجديد، وحزمة 5 مستعملة صالحة 6 أشهر وتنتهي', async () => {
  const w = wid(); const o = await lemon(w, 'الفحص الوافي'); await lemon(w, 'الفحص الوافي', { event: 'order_refunded', id: o.id });
  assert.equal((await cr(w)).full, 0);
  const w5 = wid(); await lemon(w5, 'باقة 5 فحوصات مستعملة');
  const rec = JSON.parse(store.get('w:' + w5));
  assert.ok(rec.rcx > Date.now() + 180 * 864e5 && rec.rcx < Date.now() + 186 * 864e5);
  rec.rcx = Date.now() - 1000; store.set('w:' + w5, JSON.stringify(rec));
  assert.equal((await api({ mode: 'wallet', wid: w5 })).json.reports, 0);
  assert.equal((await api({ mode: 'inspect2', wid: w5, car: 'x', stages: [] })).status, 402);
});

test('3.2.1: ورقة القطع: تحتاج رصيد أسعار، تُخصم مرة لكل صورة، وتُنظَّف المخرجات', async () => {
  const w = wid(); await api(diagBody(w, did()));
  const d = did(), body = { mode: 'parts_sheet', wid: w, did: d, image: 'A'.repeat(300), car: 'كامري 2018', currency: 'SAR' };
  assert.equal((await api(body)).status, 402);
  await lemon(w, 'أسعار القطع');
  geminiText = JSON.stringify({ items: [{ name: 'فلتر زيت', part_no: '04152', qty: 1, listed_price: 60, fair_min: 40, fair_max: 30 }, { name: '', qty: 2 }], currency: 'SAR' });
  const r = await api(body);
  assert.equal(r.status, 200); assert.equal(r.json.items.length, 1);
  assert.deepEqual([r.json.items[0].fair_min, r.json.items[0].fair_max, r.json.items[0].listed], [30, 40, 60]);   // النطاق المقلوب يُصحَّح
  assert.equal((await api(body)).status, 200);                      // نفس الصورة: بلا خصم ثانٍ
  assert.equal((await cr(w)).prices, 0);
  assert.equal((await api(Object.assign({}, body, { did: did() }))).status, 402);   // صورة جديدة تحتاج رصيداً جديداً
});

test('أسماء منتجات Lemon كما كُتبت فعلاً في المتجر (همزات وتاء مربوطة بصيغة ه)', async () => {
  const names = [['اداه فحص اساسيه', 'tm'], ['فحص اداه رئيسيه', 'tm'], ['فحص اداه فرعيه', 'ts'], ['اداه فحص فرعيه', 'ts'], ['اسعار القطع', 'prices'], ['الفحص الوافي', 'full'], ['ترقيه الى الفحص الوافي', 'upg'], ['فحص السياره +قطع الاعطال', 'diag']];
  for (const [name, key] of names) { const w = wid(); await lemon(w, name); const c = await cr(w); assert.equal(c[key], 1, name); }
  const w5 = wid(); await lemon(w5, 'باقه خمسه فحوصات مستعمله'); assert.equal((await api({ mode: 'wallet', wid: w5 })).json.reports, 5);
  const w1 = wid(); await lemon(w1, 'فحص سياره مستعمله قبل الشراء (الشامل)'); assert.equal((await api({ mode: 'wallet', wid: w1 })).json.reports, 1);
  const w6 = wid(); await lemon(w6, 'فحص خمس سيارات مستعمله (الشامل)'); assert.equal((await api({ mode: 'wallet', wid: w6 })).json.reports, 5);
});

globalThis.fetch = globalThis.fetch;   // (realFetch محفوظ للتوثيق فقط)
void realFetch;
