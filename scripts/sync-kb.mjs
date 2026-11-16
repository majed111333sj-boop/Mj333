// ينسخ قاعدة الأعطال الكاملة من js/02-diagnosis.js إلى ملف خاص بالخادم (functions/_lib/kb-data.js).
// الملف لا يُقدَّم للمتصفح أبداً: يستعمله الذكاء الاصطناعي في الخادم كمرجع قبل أي بحث.
// يُشغَّل تلقائياً ضمن npm run build، وتتحقق الاختبارات أنه مطابق للمصدر.
import fs from 'node:fs';
import vm from 'node:vm';

export function readKb(file = 'js/02-diagnosis.js') {
  const src = fs.readFileSync(file, 'utf8');
  const i0 = src.indexOf('const CAR_KB = ['), i1 = src.indexOf('const CONTEXT_ADJUST');
  if (i0 < 0 || i1 < i0) throw new Error('تعذر قراءة CAR_KB');
  return vm.runInNewContext(src.slice(i0, i1).replace('const CAR_KB', 'var CAR_KB') + '\nCAR_KB', {});
}
export function render(kb) {
  return '// ملف مولَّد تلقائياً من js/02-diagnosis.js بواسطة scripts/sync-kb.mjs. لا تعدّله يدوياً.\n// قاعدة الأعطال الكاملة (خاصة بالخادم): الكلمات والأكواد والموديلات والقطع والأسعار والنصائح.\nexport default ' + JSON.stringify(kb, null, 1) + ';\n';
}
if (import.meta.url === `file://${process.argv[1]}`) {
  fs.mkdirSync('functions/_lib', { recursive: true });
  const kb = readKb(); fs.writeFileSync('functions/_lib/kb-data.js', render(kb));
  console.log('sync-kb: ' + kb.length + ' عطلاً ← functions/_lib/kb-data.js');
}
