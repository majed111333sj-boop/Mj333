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
    const model = decodeURIComponent(u.split('/models/')[1].split(':')[0]);
    (globalThis.__gem = globalThis.__gem || []).push({ model, body: String(init.body) });
    if (globalThis.__geminiFn) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: globalThis.__geminiFn(model, String(init.body)) }] } }] }), { status: 200 });
    if (geminiText == null) return new Response('no', { status: 500 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: geminiText }] } }] }), { status: 200 });
  }
  if (u.includes('identitytoolkit.googleapis.com')) {
    const tok = JSON.parse(init.body).idToken;
    const users = { 'tok-ali': { localId: 'uid-ali', email: 'ali@example.com', providerUserInfo: [{ providerId: 'google.com' }] }, 'tok-anon': { localId: 'uid-anon', providerUserInfo: [] } };
    if (/^tok-g-/.test(tok)) users[tok] = { localId: 'uid-' + tok, email: tok + '@example.com', providerUserInfo: [{ providerId: 'google.com' }] };
    return users[tok] ? new Response(JSON.stringify({ users: [users[tok]] }), { status: 200 }) : new Response('{"error":"bad"}', { status: 400 });
  }
  if (u.startsWith('https://api.whop.com/api/v1/checkout_configurations')) { globalThis.__whopReq = JSON.parse(init.body); if (globalThis.__whopRejectRedirect && globalThis.__whopReq.redirect_url) return new Response('{"error":"bad"}', { status: 400 }); return new Response(JSON.stringify({ id: 'ch_abc123', purchase_url: 'https://whop.com/checkout/ch_abc123/' }), { status: 200 }); }
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

const linked = async () => { const w = wid(); await api({ mode: 'acct_link', wid: w, token: 'tok-g-' + w }); return w; };
const burnFree = async w => { await api(diagBody(w, did())); await api(diagBody(w, did())); };   // يستهلك التشخيصين المجانيين

test.beforeEach(() => { store.clear(); globalThis.__gem = []; globalThis.__geminiFn = null; geminiText = JSON.stringify({ kb_id: 'cv', title: 'تلف جوزة العكس', severity: 'caution', confidence: 'medium', explanation: 'شرح', advice: 'افحص', checks: [], question: null }); });

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

test('الخدمة المجانية: تشخيصان فقط ثم 402 لتشخيص ثالث، ويُسمح بنفس التشخيص', async () => {
  const w = wid(), d1 = did(), d2 = did(), d3 = did();
  assert.equal((await api(diagBody(w, d1))).status, 200);
  assert.equal((await api(diagBody(w, d1))).status, 200);          // نفس التشخيص
  assert.equal((await api({ mode: 'wallet', wid: w })).json.freeLeft, 1);
  assert.equal((await api(diagBody(w, d2))).status, 200);          // الثاني المجاني
  assert.equal((await api(diagBody(w, d3))).status, 402);          // ثالث: يحتاج رصيداً
  const v = (await api({ mode: 'wallet', wid: w })).json;
  assert.equal(v.freeAvailable, false); assert.equal(v.freeLeft, 0); assert.deepEqual(v.freeDids, [d1, d2]);
  assert.equal((await api(diagBody(w, d1))).status, 200);          // القديم يبقى متاحاً
});

test('فتح تفاصيل تشخيص مجاني برصيد: يخصم مرة ولا يفتح تشخيصاً غير معروف', async () => {
  const w = wid(), d = did();
  await api(diagBody(w, d));
  assert.equal((await api({ mode: 'unlock', wid: w, did: d })).status, 402);            // لا رصيد
  assert.equal((await api({ mode: 'unlock', wid: w, did: did() })).status, 404);         // تشخيص لم يُجرَ
  await lemon(w, 'فحص السيارة + قطع الأعطال');
  const r = await api({ mode: 'unlock', wid: w, did: d });
  assert.equal(r.status, 200); assert.ok(r.json.unlocked.includes(d)); assert.equal(r.json.cr.diag, 0);
  assert.equal((await api({ mode: 'unlock', wid: w, did: d })).json.kept, true);         // لا خصم ثانٍ
  assert.ok(!(await api({ mode: 'wallet', wid: w })).json.fullUnlocked.includes(d));     // diag لا يفتح الوافي
});

test('باقة 3 فحوصات: تُخصم مرة لكل فحص جديد ولا تُخصم لتكرار نفس الفحص', async () => {
  const w = wid();
  await burnFree(w);                                                // تستهلك المجانيين
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
  const w = wid(); await burnFree(w);
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
  await burnFree(w);
  await api(diagBody(w, did())); // خصم 1
  await lemon(w, 'Pack3', { event: 'order_refunded', id: o.id });
  assert.equal((await api({ mode: 'wallet', wid: w })).json.uses, 0);
});

test('باقة الأدوات: 5 استخدامات للأدوات المستقلة فقط', async () => {
  const w = wid(); await burnFree(w);   // الأدوات ليست مجانية
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
  await burnFree(w); await api(diagBody(w, d));                     // المجاني
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
  const w = wid(), d = did(); await burnFree(w);          // المجاني
  await lemon(w, 'الفحص الوافي');
  assert.equal((await api(diagBody(w, d, { level: 'full' }))).status, 200);
  assert.equal((await cr(w)).full, 0);
  const v = (await api({ mode: 'wallet', wid: w })).json; assert.ok(v.unlocked.includes(d) && v.fullUnlocked.includes(d));
  assert.notEqual((await api(PC(w, d))).status, 402);
  assert.equal((await api({ mode: 'report_write', wid: w, did: d, facts: { title: 'ت' } })).status, 200);
});

test('3.2.0: فحص السيارة + قطع الأعطال لا يفتح الوافي حتى الترقية، والترقية لا تُخصم مرتين', async () => {
  const w = wid(), d = did(); await burnFree(w);
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

test('3.3.0: ربط الحساب: يربط المحفظة، ويرفض المجهول والرمز الخاطئ', async () => {
  const w = wid();
  assert.equal((await api({ mode: 'acct_link', wid: w, token: 'bad' })).status, 401);
  assert.equal((await api({ mode: 'acct_link', wid: w, token: 'tok-anon' })).status, 401);
  assert.equal((await api({ mode: 'acct_link', wid: 'x', token: 'tok-ali' })).status, 400);
  const r = await api({ mode: 'acct_link', wid: w, token: 'tok-ali' });
  assert.equal(r.status, 200); assert.equal(r.json.wid, w); assert.equal(r.json.merged, false); assert.equal(r.json.email, 'a***@example.com');
});

test('3.3.0: جهاز جديد: الدخول بنفس الحساب يعيد المحفظة الأصلية بأرصدتها، ولا يضاعفها التكرار', async () => {
  const w1 = wid(), w2 = wid();
  await lemon(w1, 'الفحص الوافي'); await lemon(w1, 'أسعار القطع');
  await api({ mode: 'acct_link', wid: w1, token: 'tok-ali' });
  const r = await api({ mode: 'acct_link', wid: w2, token: 'tok-ali' });   // جهاز آخر برصيد فارغ
  assert.equal(r.json.wid, w1); assert.equal(r.json.cr.full, 1); assert.equal(r.json.cr.prices, 1);
  const r2 = await api({ mode: 'acct_link', wid: w2, token: 'tok-ali' });   // تكرار
  assert.equal(r2.json.cr.full, 1); assert.equal(r2.json.merged, false);
});

test('3.3.0: دمج محفظة الجهاز المدفوعة في محفظة الحساب مرة واحدة فقط', async () => {
  const wa = wid(), wb = wid();
  await lemon(wa, 'الفحص الوافي'); await api({ mode: 'acct_link', wid: wa, token: 'tok-ali' });
  await lemon(wb, 'الفحص الوافي'); await lemon(wb, 'ترقية إلى الفحص الوافي');
  const r = await api({ mode: 'acct_link', wid: wb, token: 'tok-ali' });
  assert.equal(r.json.wid, wa); assert.equal(r.json.merged, true); assert.equal(r.json.cr.full, 2); assert.equal(r.json.cr.upg, 1);
  const old = await api({ mode: 'wallet', wid: wb }); assert.equal(old.json.cr.full, 0);   // القديمة فُرّغت
  const again = await api({ mode: 'acct_link', wid: wb, token: 'tok-ali' });
  assert.equal(again.json.cr.full, 2);   // لا مضاعفة
});

async function whop(type, data, { secret = 'ws_test', id = 'msg_' + Math.random().toString(36).slice(2), ts = Math.floor(Date.now() / 1000), env = {} } = {}) {
  const raw = JSON.stringify({ type, data });
  const sig = 'v1,' + crypto.createHmac('sha256', secret).update(id + '.' + ts + '.' + raw).digest('base64');
  const req = new Request('https://app.test/api/ai?src=whop', { method: 'POST', body: raw, headers: { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': sig } });
  const res = await onRequest({ env: Object.assign({}, ENV, { WHOP_WEBHOOK_SECRET: 'ws_test' }, env), request: req, waitUntil: () => {} });
  return { status: res.status, json: await res.json() };
}
test('3.3.0 Whop: توقيع خاطئ أو قديم يُرفض', async () => {
  assert.equal((await whop('payment.succeeded', { id: 'pay_1' }, { secret: 'bad' })).status, 401);
  assert.equal((await whop('payment.succeeded', { id: 'pay_1' }, { ts: 1000000000 })).status, 401);
});
test('3.3.0 Whop: الدفع يمنح الرصيد مرة واحدة، والاسترجاع يخصمه', async () => {
  const w = wid(), d = { id: 'pay_' + did(), product: { title: 'أسعار القطع' }, metadata: { wid: w } };
  assert.equal((await whop('payment.succeeded', d)).json.ok, true);
  assert.equal((await whop('payment.succeeded', d)).json.duplicate, true);
  assert.equal((await api({ mode: 'wallet', wid: w })).json.cr.prices, 1);
  const rf = await whop('refund.created', { id: 'rf_1', payment: { id: d.id }, status: 'succeeded' });
  assert.equal(rf.json.refunded, true);
  assert.equal((await api({ mode: 'wallet', wid: w })).json.cr.prices, 0);
});
test('3.3.0 Whop: منتج مجهول أو بلا محفظة لا يمنح شيئاً ويُحفظ للمراجعة', async () => {
  assert.equal((await whop('payment.succeeded', { id: 'pay_x', product: { title: 'شيء آخر' }, metadata: { wid: wid() } })).json.unmapped, true);
  assert.equal((await whop('payment.succeeded', { id: 'pay_y', product: { title: 'الفحص الوافي' } })).json.no_wallet, true);
});

test('3.3.0 Whop: إنشاء جلسة دفع تحمل المحفظة والمنتج، ولا تعمل بدون الإعداد أو بدون حساب', async () => {
  const w = await linked();
  assert.equal((await api({ mode: 'whop_checkout', wid: w, product: 'prices' })).status, 503);
  const env = { WHOP_API_KEY: 'k', WHOP_WEBHOOK_SECRET: 'ws_test', WHOP_PLAN_PRICES: 'plan_abc12345' };
  const r = await api({ mode: 'whop_checkout', wid: w, product: 'prices' }, { env });
  assert.equal(r.status, 200); assert.match(r.json.url, /^https:\/\/whop\.com\/checkout\//);
  assert.deepEqual(globalThis.__whopReq, { redirect_url: 'https://afhasnow.com/?paid=1', variant_id: 'plan_abc12345', mode: 'payment', metadata: { wid: w, product: 'prices' } });
  await api({ mode: 'whop_checkout', wid: w, product: 'prices' }, { env, headers: { host: 'alfahis.pages.dev' } });   // الدومين القديم: يعود العميل إليه
  assert.equal(globalThis.__whopReq.redirect_url, 'https://alfahis.pages.dev/?paid=1');
  await api({ mode: 'whop_checkout', wid: w, product: 'prices' }, { env, headers: { host: 'evil.example' } });   // دومين غير معتمد: نرجع للأصلي
  assert.equal(globalThis.__whopReq.redirect_url, 'https://afhasnow.com/?paid=1');
  assert.equal((await api({ mode: 'whop_checkout', wid: w, product: 'nope' }, { env })).status, 400);
  assert.equal((await api({ mode: 'whop_checkout', wid: w, product: 'full' }, { env })).status, 503);   // معرّف الخطة غير مضبوط
  assert.equal((await api({ mode: 'wallet', wid: w }, { env })).json.whop, true);
  const anon = await api({ mode: 'whop_checkout', wid: wid(), product: 'prices' }, { env });         // بلا حساب Google
  assert.equal(anon.status, 403); assert.equal(anon.json.error, 'account_required');
});

test('3.3.6 Whop: إن رفض حقل الرجوع نكمل إنشاء الجلسة بدونه', async () => {
  const w = await linked(), env = { WHOP_API_KEY: 'k', WHOP_WEBHOOK_SECRET: 'ws_test', WHOP_PLAN_PRICES: 'plan_abc12345' };
  globalThis.__whopRejectRedirect = true;
  try {
    const r = await api({ mode: 'whop_checkout', wid: w, product: 'prices' }, { env });
    assert.equal(r.status, 200); assert.equal(globalThis.__whopReq.redirect_url, undefined);
  } finally { globalThis.__whopRejectRedirect = false; }
});

test('3.3.6 Whop: يتعرف على المنتج من metadata أو من معرّف الخطة حتى بلا اسم', async () => {
  const w1 = wid(), w2 = wid();
  assert.equal((await whop('payment.succeeded', { id: 'pay_' + did(), metadata: { wid: w1, product: 'diag' } })).json.ok, true);
  assert.equal((await api({ mode: 'wallet', wid: w1 })).json.cr.diag, 1);
  const r = await whop('payment.succeeded', { id: 'pay_' + did(), plan: { id: 'plan_zzTEST12345' }, metadata: { wid: w2 } }, { env: { WHOP_PLAN_TOOLSUB: 'plan_zzTEST12345' } });
  assert.equal(r.json.ok, true);
  assert.equal((await api({ mode: 'wallet', wid: w2 })).json.cr.ts, 1);
  assert.equal((await whop('payment.succeeded', { id: 'pay_' + did(), metadata: { wid: w1, product: 'nope' } })).json.unmapped, true);   // قيمة غريبة لا تُقبل
});

test('3.3.27 رابط مشاركة نتيجة الفحص: يُحفظ منقّحاً (بلا السعر والهيكل والأرقام) ويُقرأ، وصاحبه فقط يحذفه', async () => {
  const w = wid();
  const rep = { score: 72, verdict: 'attention', confidence: '60%', summary: 'فحص 10 من 17 نقطة', red_flags: [{ title: 'تاريخ حوادث', stage: 'الأوراق', advice: 'اتصل 0551234567 رقم الهيكل JTDKN3DU5A0123456' }], common_issues: ['ضعف المكيف'], repair_cost_sar: 1800.4 };
  const s = await api({ mode: 'report_save', wid: w, car: 'تويوتا كامري 2018', km: '120000', price: '45000', report: rep, stages: [{ name: 'المحرك', verdict: 'ok' }] });
  assert.equal(s.status, 200); assert.match(s.json.id, /^[a-z0-9]{6,12}$/);
  const g = await api({ mode: 'report_get', id: s.json.id });
  assert.equal(g.status, 200); assert.equal(g.json.score, 72); assert.equal(g.json.repair_cost_sar, 1800); assert.equal(g.json.stages[0].verdict, 'ok');
  const raw = JSON.stringify(g.json);
  assert.ok(!raw.includes('0551234567') && !raw.includes('JTDKN3DU5A0123456'));
  assert.equal(g.json.price, '45000');   // الخادم يحفظ ما يصله، والعميل لا يرسل السعر أصلاً
  assert.equal((await api({ mode: 'report_get', id: 'nope123' })).status, 404);
  assert.equal((await api({ mode: 'report_del', wid: wid(), id: s.json.id })).status, 403);
  assert.equal((await api({ mode: 'report_del', wid: w, id: s.json.id })).status, 200);
  assert.equal((await api({ mode: 'report_get', id: s.json.id })).status, 404);
});

test('3.3.30 مرجع الخادم الخاص: الوصف المطابق يمرّر المرجع للنموذج العادي بلا ترقية', async () => {
  const w = await linked();
  const r = await api(diagBody(w, did(), { description: 'دواسة الفرامل تنزل لآخرها ' + did() }));
  assert.equal(r.status, 200);
  assert.equal(globalThis.__gem[0].model, 'gemini-flash-lite-latest');   // النموذج العادي لأن هناك تشابهاً
  assert.match(globalThis.__gem[0].body, /مراجع من قاعدة معرفة التطبيق/);
  assert.match(globalThis.__gem[0].body, /دواسة الفرامل إسفنجية/);
  assert.ok(!/ريال|[0-9]{3,} ر\.س/.test(globalThis.__gem[0].body.match(/مراجع من قاعدة[\s\S]*?قائمة kb_id/)[0]), 'لا أسعار للنموذج');
});

test('3.3.30 حالة جديدة لا تشبه أي عطل: النموذج القوي أولاً، ثم تُضاف للقاعدة (غير معتمدة) مع نص المستخدم', async () => {
  const w = await linked();
  const desc = 'هناك صرير غريب من سقف السيارة عند الأمطار الغزيرة وبعد غسيلها ' + did() + ' جوال 0551234567';
  globalThis.__geminiFn = (model, body) => /محرر قاعدة معرفة/.test(body) || /محرر قاعدة معرفة/.test(body)
    ? JSON.stringify({ title: 'تسرب مياه من جوان فتحة السقف', sev: 'caution', keywords: [{ k: 'صرير من السقف', w: 3 }, { k: 'مطر', w: 2 }], parts: [{ n: 'جوان فتحة السقف', opt: false }], advice: 'افحص مجاري التصريف.' })
    : JSON.stringify({ kb_id: null, title: 'تسرب مياه من فتحة السقف', severity: 'caution', confidence: 'high', explanation: 'ش', advice: 'ن', checks: [], question: null });
  const r = await api(diagBody(w, did(), { description: desc }), { env: { GEMINI_ESCALATE_MODELS: 'gemini-pro-test' } });
  assert.equal(r.status, 200); assert.equal(r.json.model, 'gemini-pro-test');
  assert.equal(globalThis.__gem[0].model, 'gemini-pro-test');
  for (let i = 0; i < 40 && ![...store.keys()].some(k => k.startsWith('auto:') && k !== 'auto:index'); i++) await new Promise(x => setTimeout(x, 25));
  const key = [...store.keys()].find(k => k.startsWith('auto:') && k !== 'auto:index');
  assert.ok(key, 'لم تُضف الحالة للقاعدة');
  const row = JSON.parse(store.get(key));
  assert.equal(row.src, 'novel'); assert.equal(row.auto, true); assert.match(row.title, /فتحة السقف/);
  assert.ok(row.example.includes('صرير') && !row.example.includes('0551234567'), 'نص المستخدم يُحفظ بلا جوال');
});

test('3.3.30 حالة جديدة بثقة منخفضة لا تُضاف للقاعدة', async () => {
  const w = await linked();
  globalThis.__geminiFn = () => JSON.stringify({ kb_id: null, title: 'غير واضح', severity: 'caution', confidence: 'low', explanation: 'ش', advice: 'ن', checks: [], question: 'متى يحدث؟' });
  await api(diagBody(w, did(), { description: 'شيء غريب جداً لا أعرف وصفه أبداً ' + did() }));
  await new Promise(x => setTimeout(x, 150));
  assert.ok(![...store.keys()].some(k => k.startsWith('auto:') && k !== 'auto:index'));
});

test('3.3.30 ملف الخادم الخاص مطابق لقاعدة الأعطال في js/02-diagnosis.js', async () => {
  const { readKb, render } = await import('../scripts/sync-kb.mjs');
  const fs = await import('node:fs');
  assert.equal(fs.readFileSync(new URL('../functions/_lib/kb-data.js', import.meta.url), 'utf8'), render(readKb()), 'شغّل: node scripts/sync-kb.mjs');
});

test('الدومين الجديد: العنوان القديم يُحوَّل للصفحات فقط، وواجهة API والمعاينات لا تُمسّ', async () => {
  const { onRequest } = await import('../functions/_middleware.js');
  const next = async () => new Response('ok');
  const go = (url, headers = {}, method = 'GET') => onRequest({ request: new Request(url, { method, headers }), next });
  const r = await go('https://alfahis.pages.dev/faults/cvt.html?q=1', { accept: 'text/html' });
  assert.equal(r.status, 301); assert.equal(r.headers.get('location'), 'https://afhasnow.com/faults/cvt.html?q=1');
  assert.equal((await go('https://alfahis.pages.dev/api/ai', { accept: 'text/html' }, 'POST')).status, 200);   // الطلبات غير GET
  assert.equal((await go('https://alfahis.pages.dev/api/ai', { accept: '*/*' })).status, 200);                 // غير الصفحات
  assert.equal((await go('https://afhasnow.com/', { accept: 'text/html' })).status, 200);                      // الدومين الجديد
  assert.equal((await go('https://abc.alfahis.pages.dev/', { accept: 'text/html' })).status, 200);             // روابط المعاينة
});

test('الروابط القصيرة: /check و/lights تحوّل للتشخيص مع الحفاظ على utm', async () => {
  const { onRequest } = await import('../functions/_middleware.js');
  const next = async () => new Response('ok');
  const go = (url, method = 'GET') => onRequest({ request: new Request(url, { method }), next });
  let r = await go('https://afhasnow.com/check');
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), 'https://afhasnow.com/?go=diag');
  r = await go('https://afhasnow.com/Lights/?utm_source=tiktok');
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), 'https://afhasnow.com/?go=lights&utm_source=tiktok');
  assert.equal((await go('https://afhasnow.com/check', 'POST')).status, 200);
  assert.equal((await go('https://afhasnow.com/checkout')).status, 200);
});
