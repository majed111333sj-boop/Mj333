# الفاحص الذكي — دليل التشغيل

تطبيق ويب يقدّم ثلاث خدمات:
- **تشخيص أعطال السيارات** بالوصف أو الصوت أو كود العطل، أو بالقراءة المباشرة من قارئ OBD.
- **الأسعار العادلة** حسب الدولة والمدينة.
- **ربط المستخدم بالورش والوكلاء المعتمدين.**

يعمل التطبيق فوراً في **وضع تجريبي**. كل خدمة خارجية تفعّلها بخطوات منفصلة.

| الميزة | بدون إعداد | بعد الإعداد |
|---|---|---|
| التشخيص بالوصف والصوت والكود | ✅ محرك محلي داخل المتصفح | 🤖 تشخيص ذكي (Anthropic) |
| قراءة الفاتورة بالصورة | ❌ | ✅ (Anthropic) |
| الورش والوكلاء والتقييمات والأسعار المشتركة | على الجهاز نفسه فقط | ✅ بين كل المستخدمين (Firebase) |

---

## 1) محتويات المستودع

```
index.html          التطبيق
privacy.html        سياسة الخصوصية (مسودة)
terms.html          شروط الاستخدام (مسودة)
api/ai.js           دالة الذكاء الاصطناعي على Vercel
package.json        Tailwind 3.4.17 + أمر البناء
tailwind.config.js
vercel.json         إعدادات البناء والنشر
input.css
.gitignore
README.md
```

## 2) النشر

ارفع كل الملفات على GitHub مكان القديمة، واحذف `FIREBASE_SETUP.md` القديم إن وجد. Vercel يبني وينشر تلقائياً.

بعد الرفع تأكد من أمرين:
- **حالة النشر:** من **Vercel → Deployments** يجب أن تكون حالة آخر نشر **Ready**.
- **إعدادات Vercel:** في **Settings → Build and Deployment** اترك أوامر البناء بدون Override، لأن `vercel.json` يتولاها.

---

## 3) تفعيل الذكاء الاصطناعي (اختياري، مدفوع حسب الاستخدام)

1. أنشئ حساباً في https://console.anthropic.com، ثم أضف رصيداً وأنشئ **API Key**.
2. في Vercel افتح المشروع، ثم **Settings → Environment Variables**.
3. أضف متغيراً اسمه `ANTHROPIC_API_KEY` وقيمته المفتاح، وفعّله لبيئة Production.
4. من **Deployments** اضغط ⋯ على آخر نشر، ثم **Redeploy**.

ملاحظات:
- **أمان المفتاح:** المفتاح محفوظ في Vercel فقط، ولا يظهر في صفحة الموقع أبداً.
- **حد الإنفاق:** ضع حداً شهرياً للإنفاق من إعدادات Anthropic، كإجراء أمان إضافي.
- **تغيير النموذج:** النموذج الافتراضي في `api/ai.js` هو `claude-haiku-5-5`، وهو سريع ومنخفض التكلفة. يمكنك تغييره بإضافة متغير `ANTHROPIC_MODEL`.
- **الحماية المدمجة في الدالة:** تقبل الطلبات من موقعك فقط، وتحدّ عدد الطلبات لكل مستخدم، وتقصّ النصوص الطويلة.

---

## 4) تفعيل Firebase (الورش والوكلاء والأسعار بين كل المستخدمين)

### أ) إنشاء المشروع
1. افتح https://console.firebase.google.com، ثم **Add project**.
2. اضغط أيقونة الويب **</>** وسجّل التطبيق، ثم انسخ محتوى `firebaseConfig = { ... }`.
3. افتح **Build → Firestore Database → Create database**، واختر **Production mode**.
4. افتح **Build → Authentication → Get started**، وفعّل **Anonymous** و **Email/Password**.
5. من **Authentication → Users → Add user** أضف بريدك وكلمة مرور قوية. هذا حساب الإدارة.
6. من **Authentication → Settings → Authorized domains** أضف نطاق موقعك على Vercel.

### ب) قواعد الحماية
افتح **Firestore → Rules** والصق التالي. استبدل `OWNER@EMAIL.COM` ببريدك، ثم اضغط **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isOwner() { return signedIn() && request.auth.token.email == "OWNER@EMAIL.COM"; }
    function str(v, n) { return v is string && v.size() <= n; }

    // الورش والوكلاء
    match /providers/{id} {
      allow read: if resource.data.status == "approved" || isOwner()
                  || (signedIn() && resource.data.ownerUid == request.auth.uid);
      allow create: if signedIn()
        && request.resource.data.ownerUid == request.auth.uid
        && request.resource.data.status == "pending"
        && request.resource.data.featured == false
        && request.resource.data.type in ["workshop", "agent"]
        && str(request.resource.data.name, 60) && str(request.resource.data.phone, 16)
        && str(request.resource.data.country, 2) && str(request.resource.data.city, 40)
        && str(request.resource.data.spec, 80);
      allow update, delete: if isOwner();
    }

    // طلبات المستخدمين (تقارير وطلبات تسعير)
    match /requests/{id} {
      function prov(pid) { return get(/databases/$(database)/documents/providers/$(pid)).data; }
      allow create: if signedIn()
        && request.resource.data.userUid == request.auth.uid
        && request.resource.data.status == "sent" && request.resource.data.reply == ""
        && prov(request.resource.data.providerId).status == "approved"
        && prov(request.resource.data.providerId).ownerUid == request.resource.data.providerOwnerUid
        && str(request.resource.data.report, 2000) && str(request.resource.data.note, 300)
        && str(request.resource.data.userName, 40) && str(request.resource.data.userPhone, 16);
      allow read: if signedIn() && (resource.data.userUid == request.auth.uid
                                 || resource.data.providerOwnerUid == request.auth.uid || isOwner());
      allow update: if signedIn() && (
        // الورشة/الوكيل: إرسال أو تحديث عرض السعر فقط
        (resource.data.providerOwnerUid == request.auth.uid
          && resource.data.status in ["sent", "replied"]
          && request.resource.data.status == "replied"
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["reply", "quote", "availability", "repliedAt", "status"])
          && str(request.resource.data.reply, 500) && request.resource.data.quote is number)
        ||
        // المستخدم: قبول العرض ثم الإكمال
        (resource.data.userUid == request.auth.uid
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["status", "statusAt"])
          && ((resource.data.status == "replied" && request.resource.data.status == "accepted")
           || (resource.data.status == "accepted" && request.resource.data.status == "done")))
      );
    }

    // التقييمات: تقييم واحد لكل طلب مكتمل فقط
    match /reviews/{requestId} {
      function rq() { return get(/databases/$(database)/documents/requests/$(requestId)).data; }
      allow read: if true;
      allow create: if signedIn()
        && rq().userUid == request.auth.uid && rq().status == "done"
        && rq().providerId == request.resource.data.providerId
        && request.resource.data.reqId == requestId
        && request.resource.data.stars is int && request.resource.data.stars >= 1 && request.resource.data.stars <= 5
        && str(request.resource.data.text, 300);
      allow delete: if isOwner();
    }

    // الأسعار التي يساهم بها المستخدمون
    match /prices/{id} {
      allow read: if true;
      allow create: if signedIn() && request.resource.data.uid == request.auth.uid
        && request.resource.data.price is number && request.resource.data.price > 0 && request.resource.data.price < 1000000
        && str(request.resource.data.part, 60) && str(request.resource.data.country, 2) && str(request.resource.data.city, 40);
      allow delete: if isOwner();
    }
  }
}
```

### ج) الربط بالملف
في أعلى كود `index.html`، داخل قسم **⚙️ الإعدادات**:

```js
const FIREBASE_CONFIG = { apiKey: "…", authDomain: "…", projectId: "…", storageBucket: "…", messagingSenderId: "…", appId: "…" };
const OWNER_EMAIL = "بريدك@example.com";
```

ارفع الملف على GitHub، فتختفي رسالة "وضع تجريبي".

> مفتاح `apiKey` في Firebase ليس سراً، ووجوده في الصفحة طبيعي. الحماية الفعلية تأتي من القواعد في الخطوة (ب).

---

## 5) دورة العمل

1. **المستخدم:** يختار دولته ومدينته، ثم يفحص السيارة فيحصل على التشخيص والسعر العادل وجملة التفاوض.
2. **الإرسال:** يرسل التقرير لورشة، أو يطلب تسعير القطع من وكيل أو محل، في مدينته.
3. **الرد:** الورشة أو الوكيل يدخل برقم الجوال وكلمة المرور من أي جهاز، ويرسل عرض سعر ورسالة (والوكيل يحدد التوفر: أصلي أو تجاري).
4. **الإكمال:** المستخدم يقبل العرض، ثم يضغط "تم الإصلاح" ويقيّم. التقييمات الموثقة فقط تظهر على البطاقة.
5. **الإدارة:** من "لوحة الإدارة" أسفل الصفحة توافق على الطلبات أو ترفضها، وتميّز جهة ⭐ لتظهر أولاً، وتزيل أي جهة.

**نسيان كلمة مرور ورشة أو وكيل:** احذف حسابها من **Authentication → Users**، ثم أزلها من لوحة الإدارة، وبعدها تسجّل من جديد.

---

## 6) قبل البدء بالربح ⚠️

- **Vercel:** خطة **Hobby** المجانية مخصصة للاستخدام الشخصي غير التجاري فقط. عند البدء بأي دخل (عمولات، اشتراكات، تمييز مدفوع، إعلانات) انقل المشروع إلى خطة **Pro**.
- **Firebase:** الخطة المجانية Spark تكفي للبداية، وعند النمو انتقل لخطة Blaze بالدفع حسب الاستخدام.
- **الدفع الإلكتروني وحجز المبالغ (Escrow):** لم يُبنَ في التطبيق عمداً، لأن استلام أموال العملاء يحتاج ترخيصاً. عند الحاجة استخدم مزود دفع مرخّصاً في بلدك.
- **الجانب القانوني:** صفحتا الخصوصية والشروط مسودات عامة. راجعهما مع مختص قانوني، وأضف بريد التواصل في `privacy.html`. احرص على سجل تجاري وتوافق مع أنظمة حماية البيانات في دولتك.

---

## 7) التخصيص

كل ما يلي داخل `index.html`:
- **الدول والمدن والعملات وأرقام الطوارئ ومستوى الأسعار لكل دولة:** في `COUNTRIES`.
- **الأعطال والقطع والأسعار المرجعية بالريال السعودي:** في `CAR_KB` و `PRICE_PARTS`. تتحول الأسعار تلقائياً لعملة كل دولة ومستوى أسعارها.
- **أكواد الأعطال المعروفة دون إنترنت:** في `DTC_INFO`.
