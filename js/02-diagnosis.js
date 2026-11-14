// الفاحص الذكي · قاعدة الأعطال وبناء النتيجة والتشخيص
// جزء من index.html، يُحمَّل بالترتيب: كل الملفات تشترك في نفس النطاق العام

// 🚗 بيانات السيارات وقاعدة الأعطال (أسعار مرجعية بالريال السعودي)
// =====================================================================
const CHIPS = {
    when:  [['start', 'عند التشغيل', 'عند التشغيل تشغيل الصبح'], ['idle', 'والسيارة واقفة', 'واقفه وقوف اشاره'], ['accel', 'عند الدعسة', 'الدعسه تسارع'],
            ['speed', 'على سرعة عالية', 'على السرعه مع السرعه ماشي'], ['brake', 'عند الفرملة', 'فرمله افرمل'], ['steer', 'عند لف الدركسون', 'لف الدركسون عند اللف'],
            ['bump', 'في المطبات', 'مطبات مطب'], ['cold', 'والمحرك بارد', 'بارد'], ['hot', 'بعد ما يحمى', 'بعد ما يحمى']],
    sym:   [['sound', 'صوت', 'صوت'], ['vib', 'رجة', 'رجه'], ['smell', 'رائحة', 'ريحه'], ['smoke', 'دخان', 'دخان'], ['leak', 'تسريب سوائل', 'تسريب'],
            ['power', 'ضعف بالسحب', 'ضعف عزم ما تسحب'], ['heat', 'حرارة', 'حراره تسخن'], ['ac', 'المكيف', 'مكيف ما يبرد'], ['pull', 'تسحب لجهة', 'يسحب']],
    light: [['engine', '🔧 المكينة', 'لمبه المكينه'], ['oil', '🛢️ الزيت', 'لمبه الزيت'], ['temp', '🌡️ الحرارة', 'ساعه الحراره'], ['battery', '🔋 البطارية', 'بطاريه دينمو'],
            ['abs', '⚠️ ABS', 'فرامل'], ['brakel', '🛑 الفرامل', 'فرامل'], ['airbag', '🎈 الوسادة', ''], ['tpms', '🛞 ضغط الكفرات', 'كفرات']]
};
const CAR_MODELS = {
    'تويوتا': ['كامري', 'كورولا', 'يارس', 'لاندكروزر', 'برادو', 'هايلكس', 'راف فور', 'فورتشنر', 'أفالون', 'إينوفا'],
    'هيونداي': ['أكسنت', 'إلنترا', 'سوناتا', 'توسان', 'سنتافي', 'كريتا', 'أزيرا', 'باليسيد'],
    'نيسان': ['صني', 'ألتيما', 'باترول', 'ماكسيما', 'إكس تريل', 'نافارا', 'كيكس', 'باثفايندر'],
    'كيا': ['ريو', 'سيراتو', 'K5', 'سبورتاج', 'سورينتو', 'بيجاس', 'كارنفال', 'سيلتوس'],
    'لكزس': ['ES', 'LX', 'RX', 'IS', 'GX', 'NX'],
    'فورد': ['تورس', 'إكسبلورر', 'إكسبديشن', 'F-150', 'موستنج', 'إيدج', 'رينجر'],
    'شيفروليه': ['تاهو', 'ماليبو', 'كابريس', 'سلفرادو', 'كابتيفا', 'سبارك', 'جروف', 'سوبربان'],
    'جي إم سي': ['يوكن', 'سييرا', 'تيرين', 'أكاديا'],
    'هوندا': ['أكورد', 'سيفيك', 'CR-V', 'بايلوت', 'سيتي', 'HR-V'],
    'مازدا': ['مازدا 6', 'مازدا 3', 'CX-5', 'CX-9', 'CX-30'],
    'ميتسوبيشي': ['لانسر', 'باجيرو', 'أتراج', 'ASX', 'L200', 'إكسباندر']
};
const CAR_MAKES = ['تويوتا', 'هيونداي', 'نيسان', 'كيا', 'لكزس', 'فورد', 'شيفروليه', 'جي إم سي', 'هوندا', 'مازدا', 'ميتسوبيشي', 'مرسيدس', 'بي إم دبليو', 'جيلي', 'شانجان', 'إم جي', 'شيري', 'دودج', 'جيب', 'أخرى'];

const CAR_KB = [
    { id: 'misfire', title: 'تقطيع احتراق (كويل أو بواجي)', codes: ['P0300','P0301','P0302','P0303','P0304','P0305','P0306','P0307','P0308'], sev: 'caution',
      kw: { 'تفتف': 3, 'تفتفه': 3, 'تقطيع': 3, 'يقطع': 2, 'رجه': 1, 'رجفه': 1, 'يرج': 1, 'ترج': 1, 'وقوف': 1, 'واقف': 1, 'واقفه': 1, 'اشاره': 1, 'سكون': 1, 'ضعف': 1, 'عزم': 1, 'لمبه المكينه': 2, 'تومض': 3, 'كويل': 3, 'بواجي': 3, 'بوجي': 3, 'شمعات': 3 },
      parts: [['كويل إشعال', 185], ['طقم بواجي (شمعات)', 120]], labor: 80,
      advice: 'إذا كانت لمبة المحرك تومض فلا تقُد لمسافات طويلة؛ الوقود غير المحترق يتلف دبة التلوث. اطلب من الفني تبديل الكويل بين السلندرات لتأكيد التالف قبل الشراء.' },
    { id: 'ac', title: 'ضعف تبريد المكيف (نقص فريون أو تسريب)', codes: [], sev: 'safe',
      kw: { 'مكيف': 3, 'تكييف': 3, 'ما يبرد': 3, 'مايبرد': 3, 'حار': 2, 'هواء حار': 3, 'فريون': 3, 'كمبروسر': 2, 'ضاغط': 2 },
      parts: [['تعبئة فريون + فحص تسريب', 125]], labor: 60,
      advice: 'اطلب فحص تسريب بالصبغة قبل التعبئة؛ التعبئة بدون إصلاح التسريب تضيع فلوسك. إذا الكمبروسر لا يشبك فقد يكون الريليه أو الكلتش وليس الكمبروسر كاملاً.' },
    { id: 'steer', title: 'ونين طرمبة الدركسون (نقص زيت أو تلف الطرمبة)', codes: [], sev: 'caution',
      kw: { 'ونين': 3, 'دركسون': 1, 'سكان': 2, 'توجيه': 2, 'لف': 0, 'دركسون ثقيل': 3, 'ثقيل اللف': 3, 'طرمبه': 2 },
      parts: [['زيت دركسون', 45], ['طرمبة دركسون (عند الحاجة)', 450]], labor: 120,
      advice: 'ابدأ بفحص مستوى زيت الدركسون وتسريبه؛ كثير من حالات الونين تنتهي بتعبئة الزيت. لا تقبل تبديل الطرمبة قبل هذا الفحص.' },
    { id: 'brakes', title: 'تآكل فحمات الفرامل', codes: [], sev: 'caution',
      kw: { 'فرامل': 3, 'بريك': 3, 'فرمله': 3, 'افرمل': 3, 'صرير': 2, 'زيقه': 2, 'تزيق': 2, 'صفير': 1, 'حكه': 2, 'احتكاك': 2, 'فحمات': 3, 'هوبات': 2, 'دسكات': 2 },
      parts: [['طقم فحمات أمامي', 240]], labor: 100,
      advice: 'صوت الحديد على الحديد (خشخشة قوية) يعني أن الفحمات انتهت وبدأت تأكل الهوبات؛ أصلحها فوراً. الصفير الخفيف غالباً مؤشر تآكل مبكر.' },
    { id: 'belt', title: 'سير المحرك مرتخٍ أو متآكل', codes: [], sev: 'caution',
      kw: { 'سير': 3, 'صياح': 3, 'صفير عند التشغيل': 3, 'تشغيل الصبح': 2, 'صفاره': 2, 'زعيق': 2 },
      parts: [['سير محرك', 120], ['شداد السير (عند الحاجة)', 180]], labor: 60,
      advice: 'السير إذا انقطع يوقف الدينمو وطرمبة الماء في كثير من السيارات؛ لا تؤجله طويلاً.' },
    { id: 'overheat', title: 'ارتفاع حرارة المحرك', codes: ['P0217'], sev: 'stop',
      kw: { 'حراره': 3, 'تسخن': 3, 'يسخن': 3, 'سخونه': 3, 'يغلي': 3, 'رديتر': 3, 'بخار': 2, 'مروحه': 2, 'ثرموستات': 3, 'ساعه الحراره': 3 },
      parts: [['ثرموستات', 150], ['ماء رديتر (كولنت)', 60]], labor: 120,
      advice: 'أوقف السيارة فوراً إذا تجاوز المؤشر المنتصف، ولا تفتح غطاء الرديتر والمحرك حار. القيادة مع الحرارة قد تتلف رأس المكينة.' },
    { id: 'headgasket', title: 'تهريب وجه رأس المكينة (جوان الرأس)', codes: ['P0300', 'P0217'], codeW: 3, sev: 'stop',
      kw: { 'وجه الراس': 4, 'وجه المكينه': 4, 'جوان راس': 4, 'جوان الراس': 4, 'كاسكيت': 4, 'ماء في الزيت': 4, 'زيت حليبي': 4, 'رغوه بيضاء': 4, 'دخان ابيض': 3, 'بخار من الشكمان': 3, 'ينقص ماء الرديتر': 3, 'زيت في الماء': 4 },
      parts: [['طقم جوانات وجه الرأس', 450], ['تجليخ وجه الرأس (عند الحاجة)', 350], ['ماء رديتر (كولنت)', 60], ['زيت وفلتر', 180]], labor: 1400,
      advice: 'لا تقد السيارة: استمرار الحرارة مع التهريب قد يتلف المحرك بالكامل. اطلب فحص ضغط الأسطوانات واختبار تسريب الغازات في ماء الرديتر قبل فتح المكينة.' },
    { id: 'tick', title: 'تكتكة في المحرك (صبابات أو بخاخات أو مستوى زيت)', codes: [], sev: 'caution',
      kw: { 'تكتكه': 4, 'تكتكه المحرك': 4, 'تكتكه في المحرك': 4, 'ماكينه تكتك': 4, 'صبابات': 3, 'صوت صبابات': 4, 'تكتكه البارد': 3, 'تكتك عند': 2 },
      parts: [['زيت محرك وفلتر', 180], ['تنظيف بخاخات الوقود (عند الحاجة)', 250], ['صبابات هيدروليكية (عند الحاجة)', 400]], labor: 120,
      advice: 'ابدأ بفحص مستوى الزيت ونوعه؛ التكتكة البسيطة عند البارد قد تختفي بعد الزيت الصحيح. إن استمرت مع اهتزاز أو فقدان قدرة فاطلب قراءة الكمبيوتر وفحص الصبابات والبخاخات.' },
    { id: 'fuel', title: 'تسريب وقود (رائحة بنزين قوية)', codes: [], sev: 'stop',
      kw: { 'ريحه بنزين': 5, 'ريحه وقود': 5, 'بنزين قوي': 4, 'تسريب بنزين': 5, 'تسريب وقود': 5, 'ريحه بنزين قويه': 5 },
      parts: [['خرطوم وقود', 120], ['حساس ضغط وقود (عند الحاجة)', 250]], labor: 150,
      advice: 'رائحة البنزين القوية خطر حريق: أوقف المحرك ولا تشغّله قرب مصدر شرر، وأبعد السيارة عن المكان المغلق، واطلب سطحة إلى ورشة. لا تكمل القيادة.' },
    { id: 'battery', title: 'ضعف البطارية أو السلف', codes: ['P0562'], sev: 'caution',
      kw: { 'ما يشتغل': 3, 'مايشتغل': 3, 'ما تشتغل': 3, 'تكتكه': 2, 'طقطقه عند التشغيل': 3, 'بطاريه': 3, 'سلف': 3, 'دينمو': 2, 'ثقيل في التشغيل': 3, 'اضاءه ضعيفه': 2 },
      parts: [['بطارية', 400]], labor: 30,
      advice: 'افحص البطارية مجاناً عند أغلب محلات البطاريات قبل الشراء. إذا كانت البطارية سليمة والتكتكة مستمرة فالمشكلة غالباً في السلف.' },
    { id: 'cat', title: 'ضعف دبة التلوث أو حساس الأكسجين', codes: ['P0420','P0430','P0130','P0135'], sev: 'safe',
      kw: { 'دبه': 3, 'دبه التلوث': 3, 'ريحه بيض': 3, 'ريحه كبريت': 3, 'حساس اكسجين': 3, 'اكسجين': 2 },
      parts: [['حساس أكسجين', 350]], labor: 100,
      advice: 'ابدأ بحساس الأكسجين لأنه أرخص بكثير من الدبة. القيادة آمنة مؤقتاً لكن استهلاك الوقود قد يزيد.' },
    { id: 'bearing', title: 'تلف رمان بلي العجلة', codes: [], sev: 'caution',
      kw: { 'هدير': 3, 'طنين': 2, 'يزيد مع السرعه': 3, 'مع السرعه': 2, 'رمان بلي': 3, 'رولمان': 3, 'بيرنق': 3, 'صوت طياره': 3 },
      parts: [['رمان بلي عجلة', 280]], labor: 150,
      advice: 'إذا تغيّر الصوت عند الميلان يميناً أو يساراً فهذا يؤكد رمان البلي. لا تتأخر لأن تلفه الكامل قد يسبب ارتخاء العجلة.' },
    { id: 'suspension', title: 'تلف أجزاء المقصات أو المساعدات', codes: [], sev: 'caution',
      kw: { 'مطبات': 3, 'مطب': 3, 'حفر': 2, 'طقطقه': 2, 'خبط': 3, 'طقه تحت': 3, 'مساعدات': 3, 'مساعد': 2, 'مقصات': 3, 'جلد': 2, 'طقه وانا ماشي': 3, 'طقطقه وانا ماشي': 3 },
      parts: [['عمود توازن (لنك)', 120], ['جلد مقص (عند الحاجة)', 150]], labor: 100,
      advice: 'اطلب رفع السيارة وتحديد القطعة بالضبط؛ كثير من الورش تقترح تبديل المساعدات كاملة بينما المشكلة في لنك رخيص.' },
    { id: 'knock', title: 'طقة داخلية في المحرك (نقص زيت أو تلف داخلي)', codes: [], sev: 'stop',
      kw: { 'طقه في المكينه': 4, 'طقه من المكينه': 4, 'دق': 2, 'نوك': 3, 'دق مكينه': 4, 'لمبه الزيت': 4, 'ضغط الزيت': 3, 'طقطقه في المحرك': 4 },
      parts: [['فحص ضغط الزيت + تغيير زيت', 180]], labor: 100,
      advice: 'أوقف المحرك وافحص مستوى الزيت فوراً. الطقة المنتظمة التي تزيد مع الدعسة قد تعني تلفاً داخلياً؛ لا تقُد السيارة حتى يفحصها فني.' },
    { id: 'trans', title: 'مشكلة في ناقل الحركة (القير)', codes: ['P0700','P0730','P0740'], sev: 'caution',
      kw: { 'قير': 3, 'جير': 3, 'نتعه': 3, 'رفسه': 3, 'يرفس': 3, 'تبديل': 2, 'يتاخر في التبديل': 3, 'يعلق': 2, 'غيار': 2 },
      parts: [['تغيير زيت القير + فلتر', 300]], labor: 150,
      advice: 'ابدأ بفحص زيت القير ولونه ورائحته قبل أي قرار بفتح القير. الزيت المحروق يعني أن الفحص يجب أن يكون عند متخصص قيرات.' },
    { id: 'exhaust', title: 'تسريب في الشكمان (العادم)', codes: [], sev: 'safe',
      kw: { 'شكمان': 3, 'عادم': 3, 'صوت عالي': 2, 'طرطعه': 3, 'فرقعه': 2 },
      parts: [['وصلة أو جوان شكمان', 150]], labor: 100,
      advice: 'تأكد من عدم وجود رائحة عادم داخل المقصورة؛ إن وجدت فافتح النوافذ وأصلحها سريعاً.' },
    { id: 'balance', title: 'عدم اتزان الكفرات أو الترصيص', codes: [], sev: 'caution',
      kw: { 'رجه في الدركسون': 4, 'رجه على السرعه': 4, 'سرعه 100': 3, 'خط سريع': 2, 'ترصيص': 3, 'ميزان': 3, 'وزن': 2, 'يسحب': 3, 'يميل': 2, 'كفرات': 2, 'وانا ماشي': 2, 'اثناء السير': 2, 'على السرعه': 2, 'في الطريق': 1 },
      parts: [['وزن وترصيص', 120]], labor: 0,
      advice: 'افحص ضغط الكفرات أولاً. إذا السيارة تسحب لجهة واحدة مع تآكل غير متساوٍ فتحتاج ترصيص.' },
    { id: 'oil', title: 'تسريب أو حرق زيت المحرك', codes: [], sev: 'caution',
      kw: { 'دخان ازرق': 4, 'دخان': 2, 'يشرب زيت': 4, 'ياكل زيت': 4, 'تسريب زيت': 4, 'نقط زيت': 3, 'ريحه احتراق': 2 },
      parts: [['جوان غطاء البلوف', 120]], labor: 150,
      advice: 'راقب مستوى الزيت أسبوعياً. التسريب الخارجي غالباً جوان رخيص، أما الدخان الأزرق المستمر فقد يعني حرق زيت داخلي ويحتاج فحص ضغط سلندرات.' },
    { id: 'lean', title: 'خليط وقود غير متوازن (تهريب هواء أو حساس هواء متسخ)', codes: ['P0171','P0172','P0174','P0175','P0101'], sev: 'caution',
      kw: { 'تهريب هواء': 4, 'حساس الهواء': 3, 'ماف': 3, 'استهلاك بنزين': 2, 'يصرف بنزين': 3 },
      parts: [['تنظيف حساس الهواء (MAF)', 60], ['فحص تهريب الهواء (خراطيم)', 80]], labor: 80,
      advice: 'ابدأ بالأرخص: تنظيف حساس الهواء وفحص خراطيم الهواء بالدخان. لا تبدّل الحساسات قبل هذا الفحص.' }
];
CAR_KB.push(
    { id: 'power', title: 'ضعف في سحب المحرك (فلاتر أو بوابة الهواء أو ضغط البنزين)', codes: ['P0171','P0101'], sev: 'caution',
      kw: { 'ما تسحب': 4, 'ماتسحب': 4, 'ثقيله': 2, 'ثقيل في الدعسه': 4, 'بطيئه': 3, 'تمشي ببطء': 4, 'ضعف في الدعسه': 4, 'ضعف عزم': 4, 'ما تشيل': 3, 'ضعيفه': 2 },
      parts: [['فلتر هواء', 60], ['فلتر بنزين', 120], ['تنظيف بوابة الهواء (ثروتل)', 100]], labor: 80,
      advice: 'ابدأ بالأرخص: فلتر الهواء وتنظيف بوابة الهواء، ثم فلتر البنزين. إذا كانت لمبة المكينة مضاءة فاطلب قراءة الكمبيوتر قبل تبديل أي قطعة.' },
    { id: 'cv', title: 'تلف جوزة العكس (CV) أو مفصل التوجيه', codes: [], sev: 'caution',
      kw: { 'طقطقه عند اللف': 4, 'طقطقه عند لف': 5, 'طقطقه': 3, 'طق عند اللف': 4, 'طق عند لف': 4, 'عند اللف': 2, 'عند لف': 2, 'دوران': 2, 'جوزه': 4, 'عكس': 3, 'كوبلن': 3, 'لفيت': 1 },
      parts: [['جوزة عكس (CV)', 350]], labor: 150,
      advice: 'الطقطقة مع اللف الكامل للدركسون علامة شائعة لتلف جوزة العكس. افحص الجلد المطاطي حولها؛ إن كان مشقوقاً فقد تسرب الشحم.' }
);
// تعديلات حسب السياق: كلمات تجعل بعض الأعطال أقل أو أكثر احتمالاً
const CONTEXT_ADJUST = [
    { re: /ماشي|السير|الطريق|السرعه|سرعه عاليه/, adj: { misfire: -2, balance: 2, bearing: 1 }, unless: /تفتف|تقطيع|يقطع/ },
    { re: /واقف|وقوف|اشاره|سكون/, adj: { balance: -2, bearing: -2, misfire: 1 } },
    { re: /اللف|لف الدركسون/, adj: { cv: 2, steer: 1 } },
    { re: /بارد/, adj: { belt: 1, battery: 1 } }
];
const SEV = {
    safe:    ['آمن للسير 🟢', 'bg-emerald-950 border-emerald-500/50 text-emerald-300', 'آمن للسير'],
    caution: ['أصلحه قريباً 🟡', 'bg-amber-950 border-amber-500/50 text-amber-300', 'يحتاج إصلاح قريباً'],
    stop:    ['توقف فوراً 🛑', 'bg-red-950 border-red-500/50 text-red-300', 'توقف فوراً']
};
const isOptional = p => p[0].includes('عند الحاجة');
const kbById = id => CAR_KB.find(k => k.id === id) || null;

function scoreDescription(text) {
    const raw = String(text || '').toUpperCase();
    const norm = normalizeAr(text);
    const scores = {};
    CAR_KB.forEach(item => {
        let sc = 0;
        if (item.codes.some(c => raw.includes(c))) sc += (item.codeW || 10);
        for (const [k, w] of Object.entries(item.kw)) if (norm.includes(normalizeAr(k))) sc += w;
        if (sc > 0) scores[item.id] = sc;
    });
    CONTEXT_ADJUST.forEach(r => {
        if (!r.re.test(norm) || (r.unless && r.unless.test(norm))) return;
        for (const [id, d] of Object.entries(r.adj)) if (scores[id] !== undefined || d > 0 && Object.keys(scores).length) scores[id] = (scores[id] || 0) + d;
    });
    // عطل شائع في موديل المستخدم (من قاعدة المعرفة) يأخذ دفعة إضافية
    const model = normalizeAr(($('car-model') && $('car-model').value) || '');
    if (model) CAR_KB.forEach(k => { if (scores[k.id] && (k.models || []).some(m => { const n = normalizeAr(m); return n && (model.includes(n) || n.includes(model)); })) scores[k.id] += 2; });
    Object.keys(scores).forEach(k => { if (scores[k] <= 0) delete scores[k]; });
    return scores;
}

// ---------- الخيارات الموجّهة (متى/الأعراض/اللمبات) ----------
function buildChips() {
    ['when', 'sym', 'light'].forEach(group => {
        const box = $('chips-' + group); box.innerHTML = '';
        CHIPS[group].forEach(([id, label]) => {
            const b = el('button', 'chip', label);
            b.type = 'button'; b.dataset.group = group; b.dataset.id = id;
            b.onclick = () => b.classList.toggle('on');
            box.appendChild(b);
        });
    });
}
function selectedChips() {
    const out = { when: [], sym: [], light: [], kw: [] };
    document.querySelectorAll('.chip.on').forEach(b => {
        const c = CHIPS[b.dataset.group].find(x => x[0] === b.dataset.id);
        if (!c) return;
        out[b.dataset.group].push(c[1].replace(/^[^\u0600-\u06FFA-Za-z]+\s*/, ''));
        if (c[2]) out.kw.push(c[2]);
        if (b.dataset.group === 'light') out.lightIds = (out.lightIds || []).concat(c[0]);
    });
    return out;
}
function contextText(sel) {
    sel = sel || selectedChips();
    const parts = [];
    if (sel.when.length) parts.push('متى تظهر: ' + sel.when.join('، '));
    if (sel.sym.length) parts.push('الأعراض: ' + sel.sym.join('، '));
    if (sel.light.length) parts.push('لمبات الطبلون: ' + sel.light.join('، '));
    return parts.join(' | ');
}
function fillModelList() {
    const dl = $('car-model-list'); dl.innerHTML = '';
    (CAR_MODELS[$('car-make').value] || []).forEach(m => { const o = document.createElement('option'); o.value = m; dl.appendChild(o); });
}

function carLabel() { const m = ($('car-model').value || '').trim(); return $('car-make').value + (m ? ' ' + m : '') + ' ' + $('car-year').value; }

let diagMode = 'desc';
function setDiagMode(m) {
    diagMode = m;
    ['desc', 'voice', 'code'].forEach(x => {
        $('mode-' + x).classList.toggle('active', x === m);
        $('panel-' + x).classList.toggle('hidden', x !== m);
    });
}
function quickDesc(t) { $('car-desc').value = t; onDescInput(); startInterview(); }

// ---------- بناء نتيجة التشخيص ----------
function buildLocalResult(scores, meta) {
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const r = { source: meta.source, text: meta.text || '', code: meta.code || '', soundSummary: meta.soundSummary || '', codeInfo: meta.codeInfo || '',
                kb: null, title: '', sev: null, conf: '', explanation: meta.codeInfo || '', advice: '', checks: [], question: '', alts: [], ai: false };
    if (!ranked.length) return r;
    const top = kbById(ranked[0][0]);
    const topScore = ranked[0][1], second = ranked[1] ? ranked[1][1] : 0;
    let conf = topScore >= 8 && topScore - second >= 3 ? 'عالية' : (topScore >= 4 ? 'متوسطة' : 'منخفضة');
    if (meta.source === 'sound' && conf === 'عالية') conf = 'متوسطة';
    Object.assign(r, { kb: top, title: top.title, sev: top.sev, conf, advice: top.advice,
                       alts: ranked.slice(1, 3).map(([id]) => kbById(id).title) });
    if (!r.code) r.code = top.codes.find(c => r.text.toUpperCase().includes(c)) || '';
    applyLightSafety(r, meta);
    return r;
}
// لمبات الخطر الحمراء: تُرفع الخطورة إلى "توقف فوراً" ويظهر التحذير دائماً، حتى لو لم يتحدد عطل
const LIGHT_WARN = {
    oil: 'لمبة الزيت الحمراء تعني ضغط زيت منخفض: أطفئ المحرك فوراً وافحص مستوى الزيت.',
    temp: 'لمبة الحرارة تعني خطر ارتفاع حرارة المحرك: أوقف السيارة ولا تفتح غطاء الرديتر وهو حار.',
    brakel: 'لمبة الفرامل الحمراء تعني خللاً في نظام الفرامل أو نقص زيت الفرامل: لا تقُد السيارة، واطلب سطحة أو افحصها قبل أي مشوار.'
};
function applyLightSafety(r, meta) {
    const ids = (meta && meta.lightIds) || [];
    const hit = Object.keys(LIGHT_WARN).filter(k => ids.includes(k));
    if (!hit.length) return;
    r.sev = 'stop';
    r.lightWarn = hit.map(k => LIGHT_WARN[k]).join(' ');
    hit.forEach(k => { if (!String(r.advice || '').includes(LIGHT_WARN[k])) r.advice = LIGHT_WARN[k] + (r.advice ? ' ' + r.advice : ''); });
}

let lastDiag = null, diagSeq = 0, lastRenderedCosts = null;

let lastMeta = null, followups = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runDiagnosis(scores, meta) {
    // أول استخدام: يختار المستخدم خدمته المجانية الواحدة قبل أن نبدأ التحليل (أداة مستقلة ← صفحة الأدوات)
    if (freeStillOpen() && !freeChoice()) {
        const ch = await promptFreeServiceChoiceIfNeeded();
        if (!ch) return;
        if (ch === 'single_tool') { location.href = 'tools.html'; return; }
    }
    track('diag_start');
    const seq = ++diagSeq;
    lastMeta = meta;
    const local = buildLocalResult(scores, meta);
    meta._scores = scores;
    // 📚 تطابق قوي مع عطل راجعه المالك في قاعدة المعرفة ← الإجابة من الجدول مباشرة بدون ذكاء اصطناعي
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const strongKb = local.kb && local.kb.remote && !local.kb.auto && ranked.length && ranked[0][1] >= 8 && (!ranked[1] || ranked[1][1] * 2 <= ranked[0][1]) && meta.source !== 'sound';
    if (strongKb) { local.fromKb = true; local.conf = 'عالية'; }
    const useAi = !strongKb && aiUsable() && location.protocol !== 'file:';
    $('car-results').classList.add('hidden');
    $('skeleton-msg').textContent = useAi ? '🤖 جاري تحليل المشكلة بالذكاء الاصطناعي… (حتى 20 ثانية)' : '⏳ جاري التحليل…';
    $('car-skeleton').classList.remove('hidden');
    if (window.innerWidth < 900) $('car-skeleton').scrollIntoView({ behavior: 'smooth', block: 'center' });
    // ننتظر الذكاء الاصطناعي أولاً حتى لا تظهر نتيجة مبدئية ثم تتغير
    const [ai] = await Promise.all([useAi ? aiDiagnose(meta, local) : Promise.resolve(null), sleep(450)]);
    if (seq !== diagSeq) return;
    $('car-skeleton').classList.add('hidden');
    if (ai && ai.paywall) { blockService(); return; }
    if (!useAi) onFreeUsed(diagIdFor(meta));
    const final = ai ? mergeAi(local, ai) : local;
    applyLightSafety(final, meta);
    renderDiagnosis(final, false);
    if (final.title) { addHistory(final); track('diag_done'); }
    kbQueueRecord(final, meta);
    // الخادم هو مصدر الحقيقة للخدمة المجانية: نسأله بعد كل تشخيص حتى تظهر أسعار القطع مرة واحدة فقط
    walletRefresh();
    $('car-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderDiagnosis(r, aiPending) {
    $('car-results').classList.remove('hidden');
    const badges = { desc: 'تشخيص من الوصف', sound: 'تشخيص صوتي مبدئي', both: 'تشخيص صوتي + وصف', code: 'تشخيص من كود العطل' };
    $('res-badge').textContent = r.ai ? (r.cached ? '⚡ تشخيص ذكي (من السجلات)' : '🤖 تشخيص ذكي') : r.fromKb ? '📚 من قاعدة المعرفة' : badges[r.source] || 'تشخيص';
    $('res-car').textContent = carLabel() + ' • ' + cityName();
    $('res-code').textContent = r.code ? 'DTC: ' + r.code : '';
    $('res-confidence').textContent = r.conf ? 'الثقة: ' + r.conf : '';


    const sb = $('res-sound-box');
    sb.textContent = r.soundSummary; sb.classList.toggle('hidden', !r.soundSummary);
    const ex = $('res-explain');
    ex.textContent = r.explanation; ex.classList.toggle('hidden', !r.explanation);

    const ul = $('res-parts'); ul.innerHTML = '';
    const sevPill = $('res-severity');
    if (!r.title) {
        lastDiag = null;
        $('res-title').textContent = 'لم أتمكن من تحديد العطل';
        $('res-total').textContent = '—';
        sevPill.textContent = 'غير محدد';
        sevPill.className = 'text-[11px] font-extrabold px-2 py-0.5 rounded-md inline-block border bg-slate-800 border-slate-600 text-slate-200';
        if (r.lightWarn) { sevPill.textContent = SEV.stop[0]; sevPill.className = 'text-[11px] font-extrabold px-2 py-0.5 rounded-md inline-block border ' + SEV.stop[1]; }
        $('res-advice').textContent = (r.lightWarn ? '🛑 ' + r.lightWarn + '\n' : '') + (r.source === 'sound'
            ? 'الصوت المسجّل لم يُظهر نمطاً واضحاً. سجّل مرة أخرى في مكان أهدأ وقرّب الجوال من مصدر الصوت، أو أضف وصفاً مكتوباً.'
            : 'جرّب وصفاً أدق: متى يظهر العطل (وقوف، سرعة، فرملة، لف الدركسون، تشغيل)؟ وما نوع الصوت (صفير، طقطقة، ونين، هدير)؟ وهل ظهرت لمبة في الطبلون؟');
        ['res-checks-box', 'res-followup'].forEach(id => $(id).classList.add('hidden'));
        $('res-alt').textContent = '';
        $('negotiator-script').textContent = '';
        $('protect-list').innerHTML = '';
        return;
    }
    $('res-title').textContent = r.title;
    const sev = SEV[r.sev] || SEV.caution;
    sevPill.textContent = sev[0];
    sevPill.className = 'text-[11px] font-extrabold px-2 py-0.5 rounded-md inline-block border ' + sev[1];

    // القطع والأسعار لا تُحقن في الصفحة أصلاً إلا لمن يحق له (وصول مدفوع أو خدمته المجانية المختارة)، فلا يكفي حذف التمويه من المتصفح
    const showCosts = costsVisible();
    lastRenderedCosts = showCosts;
    if (!showCosts) {
        ul.appendChild(el('li', 'text-slate-500', '🔒 أسماء القطع وعددها وأسعارها تظهر مع الباقة المدفوعة.'));
        delete $('res-total').dataset.sar;
        $('res-total').textContent = '🔒';
        r.totalSar = r.kb && !r.kb.noPrice ? r.kb.parts.filter(p => !isOptional(p)).reduce((a, p) => a + p[1], 0) + r.kb.labor : 0;
    } else if (r.kb && !r.kb.noPrice) {
        const items = r.kb.parts.concat(r.kb.labor ? [['أجرة اليد', r.kb.labor]] : []);
        items.forEach(([name, sar]) => {
            const li = el('li', 'flex justify-between bg-slate-50 border border-slate-200 rounded-lg px-2 py-1' + (name.includes('عند الحاجة') ? ' text-slate-400' : ''));
            li.appendChild(el('span', null, name));
            const v = el('span', 'font-mono font-bold text-slate-800'); v.dataset.sar = sar; v.dir = 'ltr';
            li.appendChild(v); ul.appendChild(li);
        });
        r.totalSar = r.kb.parts.filter(p => !isOptional(p)).reduce((a, p) => a + p[1], 0) + r.kb.labor;
        $('res-total').dataset.sar = r.totalSar;
    } else if (r.intl && (r.intl.parts.length || r.intl.hi) && window.SD) {
        // نطاقات تقديرية بعملة الدولة (القطع ثم أجرة اليد)
        const row = (name, lo, hi) => { const li = el('li', 'flex justify-between bg-slate-50 border border-slate-200 rounded-lg px-2 py-1'); li.appendChild(el('span', null, name)); const v = el('span', 'font-mono font-bold text-slate-800', SD.range(lo, hi)); v.dir = 'ltr'; li.appendChild(v); ul.appendChild(li); };
        r.intl.parts.forEach(p => row(p.name, p.lo, p.hi));
        if (r.intl.laborHi) row('أجرة اليد', r.intl.laborLo, r.intl.laborHi);
        ul.appendChild(el('li', 'text-slate-500', 'تقدير تقريبي لسوقك؛ اطلب عرض سعر مكتوباً قبل الإصلاح.'));
        delete $('res-total').dataset.sar;
        $('res-total').textContent = r.intl.hi ? SD.range(r.intl.lo, r.intl.hi) : '—';
        r.totalSar = 0;
    } else {
        ul.appendChild(el('li', 'text-slate-500', r.costNote || 'يحدد الفني القطع المطلوبة بعد الفحص.'));
        delete $('res-total').dataset.sar;
        $('res-total').textContent = '—';
        r.totalSar = 0;
    }
    const chk = $('res-checks'); chk.innerHTML = '';
    (r.checks || []).forEach(c => chk.appendChild(el('li', null, c)));
    $('res-checks-box').classList.toggle('hidden', !(r.checks && r.checks.length));
    $('res-advice').textContent = '💡 ' + r.advice;
    const canAsk = r.question && postAsks < 2;
    $('res-question').textContent = canAsk ? '❓ ' + r.question : '';
    $('followup-input').value = '';
    $('res-followup').classList.toggle('hidden', !canAsk);
    $('res-alt').textContent = r.alts && r.alts.length ? 'احتمالات أخرى: ' + r.alts.join('، ') : '';
    lastDiag = r;
    renderMoney();
    applyLock();
    renderNegotiator();
}

// مشاركة النتيجة في واتساب: بدون أسعار أو بيانات شخصية
function shareText() {
    const r = lastDiag; if (!r || !r.title) return '';
    const sev = SEV[r.sev] ? SEV[r.sev][2] : '';
    return 'شخّصت سيارتي بتطبيق الفاحص الذكي: ' + r.title + (sev ? ' (' + sev + ')' : '') + '\nجرّبه مجاناً: ' + SITE_URL;
}
function shareResult() {
    const t = shareText(); if (!t) return;
    track('share');
    if (navigator.share) { navigator.share({ text: t }).catch(() => {}); return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noopener');
}
function renderNegotiator() {
    if (!lastDiag || !lastDiag.title) return;
    const r = lastDiag;
    let txt;
    if (!costsVisible()) {
        $('negotiator-script').textContent = '';
        const ul0 = $('protect-list'); ul0.innerHTML = '';
        ul0.appendChild(el('li', null, '🔒 صيغة التفاوض وأسعار القطع تظهر مع الباقة المدفوعة.'));
        ul0.appendChild(el('li', null, '🔎 ليست كل قطعة تقترحها الورشة تالفة بالضرورة؛ اطلب أن يريك العطل أو القراءة قبل التبديل.'));
        $('pc-part-r').value = ''; $('pc-result-r').classList.add('hidden');
        return;
    }
    if (r.kb && !r.kb.noPrice && r.totalSar > 0) {
        const parts = r.kb.parts.filter(p => !isOptional(p)).map(p => `${p[0]} بحدود ${fmtSar(p[1])}`).join('، و');
        const labor = r.kb.labor ? `، وأجرة اليد المعتادة نحو ${fmtSar(r.kb.labor)}` : '';
        txt = `"التشخيص المبدئي لسيارتي: ${r.title}. سعر ${parts}${labor} في ${cityName()}. أرجو اعتماد الفاتورة بحدود ${fmtSar(r.totalSar)}، وتسليمي القطع القديمة بعد التبديل."`;
    } else {
        txt = `"التشخيص المبدئي لسيارتي: ${r.title}. أرجو تزويدي بعرض سعر مكتوب بالقطع وأجرة اليد قبل البدء، وتسليمي القطع القديمة بعد التبديل."`;
    }
    $('negotiator-script').textContent = txt;
    const ul = $('protect-list'); ul.innerHTML = '';
    const tips = [];
    const opt = r.kb ? r.kb.parts.filter(isOptional).map(p => p[0].replace(' (عند الحاجة)', '')) : [];
    tips.push('🔎 ليست كل قطعة تقترحها الورشة تالفة بالضرورة' + (opt.length ? ' (مثل ' + opt.join('، ') + ')' : '') + '؛ اطلب أن يريك العطل أو القراءة قبل التبديل.');
    if (r.kb && !r.kb.noPrice && r.totalSar > 0) tips.push('💰 السعر العادل في ' + cityName() + ' تقريباً ' + fmtSar(r.totalSar) + '. اطلب عرضاً مكتوباً، واطلب القطع القديمة.');
    else tips.push('💰 اطلب عرض سعر مكتوباً بالقطع وأجرة اليد قبل البدء، واطلب القطع القديمة.');
    tips.forEach(t => ul.appendChild(el('li', null, t)));
    ['pc-part-r'].forEach(id => { $(id).value = ''; }); $('pc-result-r').classList.add('hidden');
}
// ---------- هل القطعة لازمة لهذا العطل؟ ----------
// قطع من نفس النظام: قد تكون لازمة لكنها ليست السبب الأول
const RELATED_PARTS = {
    brakes: ['هوبات', 'دسكات', 'هوب', 'كالبر', 'قماشات', 'زيت فرامل'], steer: ['علبه دركسون', 'ليات دركسون', 'ذراع', 'مقص'],
    misfire: ['بخاخات', 'بخاخ', 'حساس', 'فلتر بنزين', 'جوان'], ac: ['كمبروسر', 'ضاغط', 'ثلاجه', 'مكثف', 'ريليه'],
    overheat: ['رديتر', 'طرمبه ماء', 'مروحه', 'حساس حراره', 'خراطيم'], battery: ['دينمو', 'سلف', 'اقطاب'],
    suspension: ['مساعدات', 'مقصات', 'جلد', 'كفرات'], balance: ['كفرات', 'رمان بلي', 'مقصات', 'جوزه'],
    bearing: ['هوب', 'جوزه', 'كفرات'], trans: ['فلتر قير', 'حساس سرعه', 'كمبيوتر قير', 'بلف'],
    power: ['بخاخات', 'طرمبه بنزين', 'دبه', 'حساس'], cv: ['عكس', 'جلد عكس', 'رمان بلي'], belt: ['شداد', 'بكرات', 'دينمو']
};
// كلمات عامة لا تكفي وحدها للحكم أن القطعة لازمة
const GENERIC_PART_WORDS = new Set(['فلتر', 'حساس', 'طقم', 'زيت', 'تنظيف', 'فحص', 'تغيير', 'ماء', 'جوان', 'خرطوم'].map(normalizeAr));
function localPartVerdict(part, kb) {
    const n = normalizeAr(part);
    if (!kb) return null;
    const words = n.split(' ').filter(w => w.length > 2 && w !== 'ال' && !GENERIC_PART_WORDS.has(w.replace(/^ال/, '')));
    let best = null, bestScore = 0;
    kb.parts.forEach(p => {
        const pn = normalizeAr(p[0].replace(' (عند الحاجة)', ''));
        let sc = 0;
        if (pn === n) sc = 100; else if (pn.includes(n) || n.includes(pn)) sc = 50;
        words.forEach(w => { if (pn.includes(w.replace(/^ال/, ''))) sc += w.length; });
        if (sc > bestScore) { bestScore = sc; best = p; }
    });
    if (best && bestScore >= 4) {
        if (isOptional(best)) return { verdict: 'maybe', reason: 'قد تكون لازمة، لكنها عادة آخر خيار في هذا العطل وليست أوله.', how_to_verify: 'ابدأ بالإصلاح الأبسط، واطلب إثباتاً على تلفها قبل تبديلها.', cheaper_first: kb.parts.filter(p => !isOptional(p)).map(p => p[0]).join('، ') || null };
        return { verdict: 'needed', reason: 'هذه القطعة من الأسباب الشائعة لعطل "' + kb.title + '".', how_to_verify: 'اطلب من الفني أن يريك الفحص أو القراءة التي تؤكد تلفها.', cheaper_first: null };
    }
    if ((RELATED_PARTS[kb.id] || []).some(r => n.includes(normalizeAr(r)) || normalizeAr(r).includes(n)))
        return { verdict: 'maybe', reason: 'هذه القطعة من نفس النظام، لكنها ليست السبب الأول المعتاد لعطل "' + kb.title + '".', how_to_verify: 'اطلب من الفني أن يريك تلفها بالقياس أو بالعين قبل تبديلها.', cheaper_first: kb.parts.filter(p => !isOptional(p)).map(p => p[0]).join('، ') || null };
    return { verdict: 'unlikely', reason: 'هذه القطعة ليست ضمن القطع المعتادة لعطل "' + kb.title + '".', how_to_verify: 'اطلب من الفني أن يوضح علاقتها بالعطل، أو يريك سبب التلف قبل التبديل.', cheaper_first: null };
}
async function checkPart(where) {
    if (!fullUnlocked()) return blockFull('مدقق القطع ضمن الفحص الوافي.');
    const part = $('pc-part-' + where).value.trim();
    const box = $('pc-result-' + where);
    let fault = '', kb = null;
    if (where === 'r') {
        if (!lastDiag) return;
        fault = lastDiag.title + (lastDiag.text ? ' — ' + lastDiag.text : '') + (followups.length ? ' — ' + followups.map(f => f.q + ' ' + f.a).join('، ') : '');
        kb = lastDiag.kb;
    } else {
        fault = $('pc-fault-p').value.trim();
        if (fault.length < 3) { alert('اكتب وصف العطل أولاً.'); $('pc-fault-p').focus(); return; }
        const sc = Object.entries(scoreDescription(fault)).sort((a, b) => b[1] - a[1]);
        if (sc.length && sc[0][1] >= 3) kb = kbById(sc[0][0]);
    }
    if (part.length < 2) { alert('اكتب اسم القطعة.'); $('pc-part-' + where).focus(); return; }
    box.classList.remove('hidden'); box.className = 'rounded-lg p-2.5 text-[11px] leading-relaxed border space-y-1 bg-slate-50 border-slate-200'; box.textContent = '🤖 جاري التحقق…';
    let r = null;
    if (aiUsable() && location.protocol !== 'file:') {
        try {
            const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 34000);
            const res = await fetch(AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
                body: JSON.stringify({ mode: 'partcheck', wid: walletId(), did: diagId(), car: carLabel(), fault, part, known_parts: kb ? kb.parts.map(p => p[0]) : [] }) });
            clearTimeout(t);
            if (res.status === 503 || res.status === 404) aiOff();
            else if (res.ok) r = await res.json();
        } catch (e) {}
    }
    if (!r || !r.verdict) r = localPartVerdict(part, kb);
    box.innerHTML = '';
    if (!r) { box.textContent = 'لم أستطع الحكم على هذه القطعة لهذا الوصف. اطلب من الفني أن يوضح سبب تبديلها ويريك التلف قبل الدفع.'; return; }
    const V = { needed: ['✅ غالباً لازمة لهذا العطل', 'bg-emerald-50 border-emerald-200 text-emerald-900'],
                maybe: ['⚠️ قد تكون لازمة، تأكد أولاً', 'bg-amber-50 border-amber-200 text-amber-900'],
                unlikely: ['❌ غالباً غير مرتبطة بهذا العطل', 'bg-red-50 border-red-200 text-red-900'] }[r.verdict] || ['❔ غير واضح', 'bg-slate-50 border-slate-200 text-slate-800'];
    box.className = 'rounded-lg p-2.5 text-[11px] leading-relaxed border space-y-1 ' + V[1];
    box.appendChild(el('p', 'font-black', V[0] + ': ' + part));
    if (r.reason) box.appendChild(el('p', null, r.reason));
    if (r.how_to_verify) box.appendChild(el('p', null, '🔍 ' + r.how_to_verify));
    if (r.cheaper_first) box.appendChild(el('p', 'font-bold', '💡 جرّب أولاً: ' + r.cheaper_first));
}

function goAudit() {
    switchTab('prices');
    if (lastDiag && lastDiag.kb) {
        const first = lastDiag.kb.parts[0] && matchPart(lastDiag.kb.parts[0][0]);
        if (first) $('audit-part').value = first;
    }
    setTimeout(() => $('audit-part').scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
}

function copyNegotiator() {
    const txt = $('negotiator-script').textContent;
    const done = () => alert('تم النسخ ✓');
    const fallback = () => {
        const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { alert('انسخ النص يدوياً.'); }
        ta.remove();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done).catch(fallback); else fallback();
}
// حقائق التقرير من نتيجة الفحص: النموذج يصوغها فقط ولا يغيّرها (والخادم يرفض أي رقم أو قطعة مختلفة)
function reportFacts() {
    const r = lastDiag; if (!r || !r.title) return null;
    return {
        car: carLabel(), km: $('car-km').value || '', place: C().name + ' - ' + cityName(), title: r.title, severity: SEV[r.sev] ? SEV[r.sev][2] : '', code: r.code || '',
        parts: r.kb ? r.kb.parts.map(p => p[0]) : (r.intl ? r.intl.parts.map(p => p.name) : []), total: r.kb && r.totalSar ? fmtSar(r.totalSar) : (r.intl && r.intl.hi && window.SD ? SD.range(r.intl.lo, r.intl.hi) : ''),
        description: r.text && r.text !== r.code ? r.text : '', structured: (lastMeta && lastMeta.structured) || '',
        explanation: r.explanation || '', advice: r.advice || '', checks: (r.checks || []).slice(0, 6), followups: followups.slice(-6).map(f => f.q + ' ← ' + f.a)
    };
}
const polishCache = {};
async function polishReport(type) {
    const facts = reportFacts(); if (!facts || location.protocol === 'file:') return null;
    const key = diagId() + ':' + type; if (polishCache[key]) return polishCache[key];
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
    try {
        const res = await fetch(AI_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify({ mode: 'report_write', wid: walletId(), did: diagId(), type, facts }) });
        if (!res.ok) return null;
        const j = await res.json(); if (!j || !j.body) return null;
        return (polishCache[key] = j);
    } catch (e) { return null; } finally { clearTimeout(t); }
}
async function exportReportPDF() {
    if (!fullUnlocked()) return blockFull('حفظ التقرير PDF ضمن الفحص الوافي.');
    const btn = document.querySelector('[onclick="exportReportPDF()"]'), old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري كتابة التقرير ومراجعته…'; }
    const p = await polishReport('pdf');
    if (btn) { btn.disabled = false; btn.textContent = old; }
    if (p && p.issues && p.issues.length && !confirm('ملاحظات المراجعة قبل الحفظ:\n• ' + p.issues.join('\n• ') + '\n\nحفظ التقرير كما هو؟')) return;
    const pr = $('print-report'); pr.innerHTML = '';
    if (p) {
        pr.appendChild(el('h1', null, 'تقرير فحص السيارة · الفاحص الذكي')); pr.firstChild.style.cssText = 'font-size:20px;margin:0 0 4px';
        pr.appendChild(el('p', null, new Date().toLocaleString('ar'))); pr.lastChild.style.cssText = 'color:#475569;margin:0 0 12px';
        if (p.summary) { const sm = el('p', null, p.summary); sm.style.cssText = 'background:#EFF6FF;border-radius:8px;padding:8px 10px;margin:0 0 12px'; pr.appendChild(sm); }
        const bd = el('div', null, p.body); bd.style.whiteSpace = 'pre-wrap'; pr.appendChild(bd);
        const ft = el('p', null, 'تقدير يساعدك قبل الورشة ولا يغني عن فحص الفني. alfahis.pages.dev'); ft.style.cssText = 'color:#64748B;font-size:12px;margin-top:16px;border-top:1px solid #E2E8F0;padding-top:8px'; pr.appendChild(ft);
        document.body.classList.add('print-polished');
        window.addEventListener('afterprint', () => document.body.classList.remove('print-polished'), { once: true });
    }
    alert('ستفتح نافذة الطباعة. اختر "حفظ كـ PDF" لحفظ التقرير.');
    window.print();
    setTimeout(() => document.body.classList.remove('print-polished'), 3000);
}

// ---------- الذكاء الاصطناعي (اختياري عبر Vercel) ----------
// الذكاء الاصطناعي: عند خطأ 503/404 نوقفه دقيقتين فقط ثم نعيد المحاولة (بدل إيقافه حتى إعادة تحميل الصفحة)
let aiRetryAfter = 0;
const aiUsable = () => Date.now() >= aiRetryAfter;
const aiOff = () => { aiRetryAfter = Date.now() + 120000; };
async function aiDiagnose(meta, local) {
    if (!aiUsable() || location.protocol === 'file:') return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 38000);
    try {
        const res = await fetch(AI_ENDPOINT, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
            body: JSON.stringify({
                wid: walletId(), did: diagIdFor(meta), level: diagLevel(),
                mode: 'diagnose', car: carLabel(), country: C().name, city: cityName(), mileage: $('car-km').value || '',
                description: meta.text || '', code: meta.code || '', sound: meta.soundSummary || '', context: meta.context || '',
                structured: meta.structured || '', followups: followups.slice(-6),
                localGuess: local.kb ? local.kb.id : null,
                reference: Object.entries(meta._scores || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => kbById(id)).filter(k => k && k.remote)
                    .map(k => ({ title: k.title + (k.auto ? ' (تلقائي غير معتمد بعد)' : ''), parts: k.parts.map(p => p[0]).join('، '), advice: k.advice.slice(0, 200), models: (k.models || []).join('، ') })),
                catalog: CAR_KB.map(k => ({ id: k.id, title: k.title }))
            })
        });
        if (res.status === 402) { Wallet.state = Object.assign({}, Wallet.state, { freeAvailable: false }); return { paywall: true }; }
        if (res.status === 503 || res.status === 404) { aiOff(); return null; }
        if (!res.ok) return null;
        onFreeUsed(diagIdFor(meta));
        return await res.json();
    } catch (e) { return null; }
    finally { clearTimeout(t); }
}
// أعطال كبيرة: إذا ذكرها الذكاء الاصطناعي ولم تكن في العطل المرتبط فلا نعرض تكلفة قد تكون مضللة
const MAJOR_TERMS = ['وجه الراس', 'وجه راس', 'جوان الراس', 'جوان راس', 'كاسكيت', 'head gasket', 'عمره', 'تخبيط', 'تبديل القير', 'قير كامل', 'كمبيوتر القير', 'دبه التلوث', 'بلوف', 'سبيكه'];
function kbMatchesAi(kb, ai) {
    if (!kb) return false;
    const aiText = normalizeAr((ai.title || '') + ' ' + (ai.explanation || '')).toLowerCase();
    const kbText = normalizeAr(kb.title + ' ' + Object.keys(kb.kw).join(' ') + ' ' + kb.parts.map(p => p[0]).join(' ') + ' ' + (kb.advice || '')).toLowerCase();
    return !MAJOR_TERMS.some(t => { const n = normalizeAr(t).toLowerCase(); return aiText.includes(n) && !kbText.includes(n); });
}
// الخطورة لا تنزل أبداً عن خطورة العطل المعروف في القاعدة: safe < caution < stop
const SEV_RANK = { safe: 0, caution: 1, stop: 2 };
const maxSev = (a, b) => (b && (SEV_RANK[b] || 0) > (SEV_RANK[a] || 0)) ? b : a;
function mergeAi(local, ai) {
    if (!ai || typeof ai.title !== 'string' || !ai.title.trim()) return local;
    let kb = ai.kb_id ? kbById(ai.kb_id) : null;
    let costNote = '';
    // خارج الشرق الأوسط: لا جدول أسعار محلي، فالخادم يعيد نطاقات تقديرية بعملة الدولة
    const num = v => Math.max(0, Math.round(Number(v) || 0));
    const intl = ai.estimate ? {
        parts: (Array.isArray(ai.parts) ? ai.parts : []).filter(p => p && typeof p === 'object').slice(0, 5).map(p => ({ name: String(p.name || '').slice(0, 70), lo: num(p.cost_low), hi: num(p.cost_high) })).filter(p => p.name),
        laborLo: num(ai.labor_low), laborHi: num(ai.labor_high), lo: num(ai.cost_low), hi: num(ai.cost_high)
    } : null;
    if (intl) kb = null;
    if (kb && !kbMatchesAi(kb, ai)) { costNote = 'التكلفة تعتمد على نتيجة الفحص؛ هذا النوع من الأعطال قد تختلف تكلفته كثيراً.'; kb = null; }
    const confMap = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
    return Object.assign({}, local, {
        ai: true,
        cached: !!ai.cached,
        kb,
        title: String(ai.title).slice(0, 120),
        sev: maxSev(SEV[ai.severity] ? ai.severity : 'caution', kb ? kb.sev : null),
        conf: confMap[ai.confidence] || local.conf || 'متوسطة',
        explanation: [local.codeInfo, String(ai.explanation || '').slice(0, 600)].filter(Boolean).join('\n'),
        advice: String(ai.advice || (kb ? kb.advice : '')).slice(0, 500),
        checks: Array.isArray(ai.checks) ? ai.checks.slice(0, 5).map(c => String(c).slice(0, 140)) : [],
        question: (typeof ai.question === 'string' && ai.question.trim().length > 3 && !/^(null|none|n\/a|undefined|لا يوجد|لا شيء)$/i.test(ai.question.trim())) ? ai.question.slice(0, 200) : '',
        alts: intl ? [] : local.alts.filter(a => !kb || a !== kb.title),
        costNote, intl
    });
}

// ---------- الفحص بالوصف ----------
function descMeta() {
    const text = $('car-desc').value.trim();
    const sel = selectedChips();
    const structured = contextText(sel);
    return { source: 'desc', text, structured, lightIds: sel.lightIds || [], kw: sel.kw.join(' ') };
}
function runDescriptionDiagnosis() {
    const meta = descMeta();
    if (meta.text.length < 3 && !meta.structured) { alert('اكتب وصفاً للمشكلة، أو اختر من الخيارات تحت الوصف، أو اضغط 🎤 وتحدث.'); $('car-desc').focus(); return; }
    if (!canStart(diagIdFor(meta))) return blockService();
    clearTimeout(ivTimer); followups = []; postAsks = 0; ivSeq++; iv = null; $('interview').classList.add('hidden'); ivLastText = meta.text;
    runDiagnosis(scoreDescription(meta.text + ' ' + meta.kw), meta);
}
// =====================================================================
