/** @type {import('tailwindcss').Config} */
module.exports = {
  // يقرأ Tailwind كل الكلاسات المستخدمة في صفحات الموقع (بما فيها الموجودة داخل الجافاسكربت)
  content: ['./*.html', './js/**/*.js'],
  theme: { extend: {} },
  plugins: [],
};
