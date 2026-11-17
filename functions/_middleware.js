// تحويل دائم من العنوان القديم إلى الدومين الجديد: لصفحات المتصفح فقط (GET + text/html)
// لا نمسّ واجهة /api ولا الطلبات الأخرى ولا روابط المعاينة (abc.alfahis.pages.dev)
const OLD_HOST = 'alfahis.pages.dev', NEW_ORIGIN = 'https://afhasnow.com';

export async function onRequest({ request, next }) {
  try {
    const u = new URL(request.url);
    if (request.method === 'GET' && u.hostname === OLD_HOST && /text\/html/.test(request.headers.get('accept') || '')) {
      return Response.redirect(NEW_ORIGIN + u.pathname + u.search, 301);
    }
  } catch (e) { /* أي خطأ: نكمل بلا تحويل */ }
  return next();
}
