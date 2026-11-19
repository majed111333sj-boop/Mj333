// تحويل دائم من العنوان القديم إلى الدومين الجديد: لصفحات المتصفح فقط (GET + text/html)
// لا نمسّ واجهة /api ولا الطلبات الأخرى ولا روابط المعاينة (abc.alfahis.pages.dev)
const OLD_HOST = 'alfahis.pages.dev', NEW_ORIGIN = 'https://afhasnow.com';
// روابط قصيرة للإعلانات والمشاركة: afhasnow.com/check و afhasnow.com/lights (تحويل مؤقت 302 ليسهل تغيير الوجهة لاحقاً)
export const SHORT_LINKS = { '/check': '/?go=diag', '/lights': '/?go=lights' };

export async function onRequest({ request, next }) {
  try {
    const u = new URL(request.url);
    if (request.method === 'GET' && u.hostname === OLD_HOST && /text\/html/.test(request.headers.get('accept') || '')) {
      return Response.redirect(NEW_ORIGIN + u.pathname + u.search, 301);
    }
    const short = request.method === 'GET' && SHORT_LINKS[u.pathname.replace(/\/+$/, '').toLowerCase()];
    if (short) {
      const extra = u.search ? '&' + u.search.slice(1) : '';   // نحافظ على utm_* للإعلانات
      return Response.redirect(u.origin + short + extra, 302);
    }
  } catch (e) { /* أي خطأ: نكمل بلا تحويل */ }
  return next();
}
