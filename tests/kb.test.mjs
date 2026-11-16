// اختبارات قاعدة الأعطال (CAR_KB): البنية، والسلامة، وعدم التكرار. تعمل بدون إنترنت.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../js/02-diagnosis.js', import.meta.url), 'utf8');
const i0 = src.indexOf('const CAR_KB = ['), i1 = src.indexOf('const CONTEXT_ADJUST');
assert.ok(i0 >= 0 && i1 > i0, 'تعذر قراءة CAR_KB');
const KB = vm.runInNewContext(src.slice(i0, i1).replace('const CAR_KB', 'var CAR_KB') + '\nCAR_KB', {});
const norm = t => String(t || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();

test('القاعدة: معرّفات وعناوين فريدة وحقول كاملة', () => {
  assert.ok(KB.length >= 50, 'عدد الأعطال: ' + KB.length);
  const ids = new Set(), titles = new Set();
  for (const k of KB) {
    assert.match(k.id, /^[a-z][a-z0-9_]*$/, k.id);
    assert.ok(!ids.has(k.id), 'معرّف مكرر ' + k.id); ids.add(k.id);
    assert.ok(k.title && !titles.has(norm(k.title)), 'عنوان مكرر أو فارغ ' + k.id); titles.add(norm(k.title));
    assert.ok(['safe', 'caution', 'stop'].includes(k.sev), k.id + ' خطورة');
    assert.ok(Array.isArray(k.codes) && k.codes.every(c => /^[PCBU][0-9A-F]{4}$/.test(c)), k.id + ' أكواد');
    assert.ok(k.advice && k.advice.length > 40, k.id + ' نصيحة');
    assert.ok(typeof k.labor === 'number' && k.labor >= 0, k.id + ' أجرة');
    assert.ok(Array.isArray(k.parts) && k.parts.length > 0 && k.parts.every(p => typeof p[0] === 'string' && Number.isFinite(p[1]) && p[1] > 0 && p[1] < 20000), k.id + ' قطع');
    assert.ok(k.kw && Object.keys(k.kw).length >= 3 && Object.values(k.kw).every(w => Number.isFinite(w) && w >= 0 && w <= 5), k.id + ' كلمات');
    if (k.models) assert.ok(Array.isArray(k.models), k.id + ' موديلات');
  }
});

test('القاعدة: لا كلمات بحث فارغة (المحرك يطبّع الكلمات عند المطابقة)', () => {
  for (const k of KB) for (const w of Object.keys(k.kw)) assert.ok(norm(w).length > 0, k.id);
});

test('السلامة: أعطال الفرامل والحرارة والوقود والتوجيه لا تقل خطورتها', () => {
  const must = { overheat: 'stop', headgasket: 'stop', fuel: 'stop', knock: 'stop', brakesoft: 'stop', brakehard: 'stop', theta: 'stop' };
  for (const [id, sev] of Object.entries(must)) assert.equal(KB.find(k => k.id === id).sev, sev, id);
  for (const id of ['brakes', 'steer', 'steerrack', 'rotorwarp', 'abssensor']) assert.notEqual(KB.find(k => k.id === id).sev, 'safe', id);
  for (const k of KB) if (/فرامل|حرارة|رديتر|توجيه|دركسون|بنزين وقود/.test(k.title) && !/تآكل فحمات|مبروزة|ABS|مفاجئ|المكيف/.test(k.title)) assert.notEqual(k.sev, 'safe', k.id);
});

test('التطابق: كل عطل يظهر أولاً عند وصف أعراضه الواضحة', () => {
  const score = (text, extra) => {
    const t = norm(text), out = {};
    for (const k of KB) { let s = 0; for (const [w, v] of Object.entries(k.kw)) if (t.includes(norm(w))) s += v; if (extra && (k.models || []).some(x => t.includes(norm(x)))) s += 2; if (s) out[k.id] = s; }
    return Object.entries(out).sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const cases = [
    ['دواسة الفرامل تنزل لآخرها', 'brakesoft'], ['دواسة الفرامل صلبة وثقيلة', 'brakehard'], ['رجة عند الفرملة من السرعة', 'rotorwarp'],
    ['لمبة ABS مضاءة', 'abssensor'], ['لمبة الوسادة الهوائية', 'airbaglight'], ['كفر متشقق وقديم', 'oldtires'],
    ['السيارة ديزل وفيها دخان أبيض ووضع الحماية', 'dpf'], ['لمبة البطارية والإنارة ضعيفة', 'alternator'], ['ريحة حلاوة ونقط أخضر تحت المكينة', 'waterpump'],
    ['القير CVT يرتجف عند الانطلاق', 'cvt'], ['الدركسون فيه لعب ويطق', 'steerrack'], ['طقة في المكينة وانطفى أثناء السير', 'theta'],
    ['تسحب يمين والكفر ياكل من جنب', 'alignment']
  ];
  for (const [text, id] of cases) assert.equal(score(text), id, text);
});
