// الفاحص الذكي · أيقونات SVG موحّدة: تحوّل الرموز التعبيرية في نصوص الصفحة (حتى التي يكتبها الكود لاحقاً) إلى أيقونات خطية
// يُحمَّل في كل الصفحات. لا يمسّ حقول الإدخال ولا الخيارات ولا ما عليه data-noicons ولا لمبات الطبلون (#chips-light)
(() => {
    const ICONS = {"search":"<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M20 20l-4-4\"/>","unlock":"<rect x=\"4\" y=\"11\" width=\"16\" height=\"10\" rx=\"2\"/><path d=\"M8 11V7a4 4 0 0 1 7.5-2\"/>","lock":"<rect x=\"4\" y=\"11\" width=\"16\" height=\"10\" rx=\"2\"/><path d=\"M8 11V7a4 4 0 0 1 8 0v4\"/>","key":"<circle cx=\"8\" cy=\"15\" r=\"4\"/><path d=\"M11 12l9-9M16 7l3 3M14 9l2 2\"/>","wrench":"<path d=\"M15 4a5 5 0 0 0-4.8 6.4L3 17.6V21h3.4l7.2-7.2A5 5 0 0 0 20 9l-3 1-3-3 1-3z\"/>","siren":"<path d=\"M6 18v-6a6 6 0 0 1 12 0v6\"/><path d=\"M4 21h16M12 3V2M4.2 6.2l-.7-.7M19.8 6.2l.7-.7\"/><path d=\"M10 12a2 2 0 0 1 2-2\"/>","alert":"<path d=\"M12 3l10 18H2z\"/><path d=\"M12 10v5M12 18h.01\"/>","download":"<path d=\"M12 3v12M7 10l5 5 5-5M4 21h16\"/>","share":"<path d=\"M12 15V3M7 8l5-5 5 5M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5\"/>","mic":"<rect x=\"9\" y=\"2\" width=\"6\" height=\"12\" rx=\"3\"/><path d=\"M5 11a7 7 0 0 0 14 0M12 18v4\"/>","sparkle":"<path d=\"M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z\"/>","coin":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2\"/>","card":"<rect x=\"2\" y=\"5\" width=\"20\" height=\"14\" rx=\"2\"/><path d=\"M2 10h20M6 15h4\"/>","wallet":"<path d=\"M3 7a2 2 0 0 1 2-2h13v4\"/><rect x=\"3\" y=\"7\" width=\"18\" height=\"13\" rx=\"2\"/><path d=\"M16 13.5h.01\"/>","pin":"<path d=\"M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z\"/><circle cx=\"12\" cy=\"10\" r=\"2.5\"/>","check":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M8 12.5l2.7 2.7L16 10\"/>","xcircle":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9 9l6 6M15 9l-6 6\"/>","plug":"<path d=\"M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5\"/>","bulb":"<path d=\"M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z\"/>","doc":"<path d=\"M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z\"/><path d=\"M14 3v6h6M8 13h8M8 17h5\"/>","clipboard":"<rect x=\"5\" y=\"4\" width=\"14\" height=\"18\" rx=\"2\"/><path d=\"M9 4V2h6v2M9 11h6M9 15h4\"/>","edit":"<path d=\"M4 20h4L19 9l-4-4L4 16z\"/><path d=\"M13.5 6.5l4 4\"/>","plus":"<path d=\"M12 5v14M5 12h14\"/>","steth":"<path d=\"M5 3v6a5 5 0 0 0 10 0V3\"/><path d=\"M10 14v2a5 5 0 0 0 10 0v-3\"/><circle cx=\"20\" cy=\"11\" r=\"2\"/>","ticket":"<path d=\"M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z\"/><path d=\"M14 6v12\"/>","book":"<path d=\"M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3\"/><path d=\"M20 4v14h-7\"/>","save":"<path d=\"M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 1-2z\"/><path d=\"M8 3v5h7V3M8 21v-7h8v7\"/>","dot":"<circle cx=\"12\" cy=\"12\" r=\"5\" fill=\"currentColor\"/>","car":"<path d=\"M5 17h14M3 13l2-6a2 2 0 0 1 2-1.5h10A2 2 0 0 1 19 7l2 6v4a1 1 0 0 1-1 1h-2M6 18H4a1 1 0 0 1-1-1v-4h18\"/><circle cx=\"7.5\" cy=\"17.5\" r=\"1.8\"/><circle cx=\"16.5\" cy=\"17.5\" r=\"1.8\"/>","clock":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>","eye":"<path d=\"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","zap":"<path d=\"M13 2L4 14h7l-1 8 9-12h-7z\"/>","infinity":"<path d=\"M7 9a3 3 0 1 0 0 6c2.5 0 7.5-6 10-6a3 3 0 1 1 0 6c-2.5 0-7.5-6-10-6z\"/>","refresh":"<path d=\"M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4\"/>","up":"<path d=\"M12 19V5M6 11l6-6 6 6\"/>","camera":"<path d=\"M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z\"/><circle cx=\"12\" cy=\"13\" r=\"4\"/>","sound":"<path d=\"M4 9v6h4l5 4V5L8 9z\"/><path d=\"M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12\"/>","vibe":"<rect x=\"8\" y=\"3\" width=\"8\" height=\"18\" rx=\"2\"/><path d=\"M4 8v8M20 8v8M2 10v4M22 10v4\"/>","tire":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"3.5\"/><path d=\"M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21\"/>","hash":"<path d=\"M4 9h16M4 15h16M10 3L8 21M16 3l-2 18\"/>","paint":"<path d=\"M12 3a9 9 0 0 0 0 18c1 0 1.5-.7 1.5-1.5 0-1.3-1-1.5-1-2.5s.7-1.5 1.7-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5z\"/><circle cx=\"7.5\" cy=\"11\" r=\"1\"/><circle cx=\"10\" cy=\"7\" r=\"1\"/><circle cx=\"15\" cy=\"7.5\" r=\"1\"/>","window":"<rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\"/><path d=\"M4 12h16M12 4v16\"/>","scale":"<path d=\"M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z\"/>","chip":"<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4\"/>","mail":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M3 7l9 6 9-6\"/>","store":"<path d=\"M3 9l2-5h14l2 5M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8M10 21v-5h4v5\"/>","star":"<path d=\"M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z\"/>","chart":"<path d=\"M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6\"/>","hourglass":"<path d=\"M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9\"/>","stop":"<path d=\"M8 3h8l5 5v8l-5 5H8l-5-5V8z\"/><path d=\"M9 9l6 6M15 9l-6 6\"/>","trash":"<path d=\"M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3\"/>","robot":"<rect x=\"5\" y=\"8\" width=\"14\" height=\"11\" rx=\"3\"/><path d=\"M12 4v4M9 13h.01M15 13h.01M10 16h4\"/>","flag":"<path d=\"M5 21V4M5 4h11l-2 4 2 4H5\"/>","road":"<path d=\"M8 3L5 21M16 3l3 18M12 4v3M12 10v3M12 16v3\"/>","chat":"<path d=\"M4 5h16v11H9l-5 4z\"/>","link":"<path d=\"M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1\"/>","seat":"<path d=\"M7 3h4l1 9h6l1 5H8zM8 17l-1 4M17 17l1 4\"/>","hand":"<path d=\"M3 12l4-4 4 2 3-2 7 5-4 4-3-2-3 3-4-3z\"/>","gift":"<rect x=\"3\" y=\"8\" width=\"18\" height=\"5\" rx=\"1\"/><path d=\"M5 13v8h14v-8M12 8v13M12 8c-2-4-6-4-6-1s6 1 6 1zM12 8c2-4 6-4 6-1s-6 1-6 1z\"/>","phone":"<rect x=\"7\" y=\"2\" width=\"10\" height=\"20\" rx=\"2\"/><path d=\"M11 18h2\"/>","arrow":"<path d=\"M19 12H5M11 6l-6 6 6 6\"/>","party":"<path d=\"M4 20l5-14 9 9zM14 4l1 2M19 9l2 1M17 5l2-2\"/>","oil":"<path d=\"M3 14h4l3-3h7l4 3-4 5H7z\"/><path d=\"M10 11V8h4v3M21 9v2\"/>","temp":"<path d=\"M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z\"/><path d=\"M12 9v7\"/>","battery":"<rect x=\"3\" y=\"7\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M7 4v3M17 4v3M7 13h4M15 11v4M13 13h4\"/>","airbag":"<circle cx=\"12\" cy=\"7\" r=\"3\"/><path d=\"M6 21v-3a6 6 0 0 1 12 0v3\"/>"};
    const MAP = {"🔍":"search","🔎":"search","🔓":"unlock","🔐":"lock","🔑":"key","🔧":"wrench","🧰":"wrench","🧩":"store","🚨":"siren","🔴":"dot","🛑":"stop","⚠️":"alert","⚠":"alert","📥":"download","📤":"share","🎙️":"mic","🎤":"mic","🤖":"robot","💰":"coin","💳":"card","💼":"wallet","📍":"pin","✅":"check","🟢":"dot","🟡":"dot","🔶":"dot","❌":"xcircle","🔌":"plug","💡":"bulb","🧾":"doc","📋":"clipboard","📝":"edit","➕":"plus","🩺":"steth","🎟️":"ticket","📚":"book","💾":"save","🚗":"car","⏱️":"clock","🕒":"clock","⏳":"hourglass","👀":"eye","⚡":"zap","♾️":"infinity","🔄":"refresh","⬆️":"up","🎥":"camera","📷":"camera","🔊":"sound","📳":"vibe","🛞":"tire","🔢":"hash","🎨":"paint","🪟":"window","⚖️":"scale","📟":"chip","📨":"mail","🏢":"store","🏪":"store","⭐":"star","📊":"chart","🗑️":"trash","🚩":"flag","🛣️":"road","🛣":"road","🛠️":"wrench","🛠":"wrench","💬":"chat","🔗":"link","📄":"doc","💺":"seat","🎉":"party","⛔":"stop","🔁":"refresh","🤝":"hand","🎁":"gift","👉":"arrow","📲":"phone","🛢️":"oil","🛢":"oil","🌡️":"temp","🌡":"temp","🔋":"battery","🎈":"airbag"};
    const DOTS = {"🔴": "#DC2626", "🟢": "#16A34A", "🟡": "#EAB308", "🔶": "#F59E0B"};
    const NS = 'http://www.w3.org/2000/svg';
    const keys = Object.keys(MAP).concat(Object.keys(DOTS)).sort((a, b) => b.length - a.length);
    const RE = new RegExp('(' + keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\ufe0f?\\s?', 'g');
    const SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION|SELECT|TITLE|NOSCRIPT|svg|SVG|use)$/;
    function sprite() {
        if (!document.body) return;
        let host = document.getElementById('ui-icons-sprite');
        if (!host) { host = document.createElementNS(NS, 'svg'); host.id = 'ui-icons-sprite'; host.setAttribute('width', '0'); host.setAttribute('height', '0'); host.setAttribute('aria-hidden', 'true'); host.style.position = 'absolute'; document.body.prepend(host); }
        let html = '';
        Object.keys(ICONS).forEach(n => { if (!document.getElementById('i-' + n)) html += '<symbol id="i-' + n + '" viewBox="0 0 24 24">' + ICONS[n] + '</symbol>'; });
        if (html) host.insertAdjacentHTML('beforeend', html);
        if (!document.getElementById('ui-icons-css')) { const st = document.createElement('style'); st.id = 'ui-icons-css'; st.textContent = '.ic{width:1.15em;height:1.15em;display:inline-block;vertical-align:-0.2em;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;margin-inline-end:.3em}'; document.head.appendChild(st); }
    }
    function icon(name, color) {
        const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true');
        if (color) s.style.color = color;
        const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#i-' + name); s.appendChild(u); return s;
    }
    window.uiIcon = icon;
    function skipped(node) {
        for (let p = node.parentNode; p && p !== document.body; p = p.parentNode) {
            if (p.nodeType !== 1) continue;
            if (SKIP.test(p.nodeName) || p.isContentEditable || p.id === 'chips-light' || p.hasAttribute('data-noicons')) return true;
        }
        return false;
    }
    function fixText(t) {
        const v = t.nodeValue; if (!v) return; RE.lastIndex = 0; if (!RE.test(v)) return; if (skipped(t)) return;
        RE.lastIndex = 0; const frag = document.createDocumentFragment(); let last = 0, m;
        while ((m = RE.exec(v))) {
            if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
            const k = m[1]; frag.appendChild(DOTS[k] ? icon('dot', DOTS[k]) : icon(MAP[k]));
            last = m.index + m[0].length;
        }
        if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
        t.parentNode.replaceChild(frag, t);
    }
    function walk(root) {
        if (!root) return;
        if (root.nodeType === 3) return fixText(root);
        if (root.nodeType !== 1 || SKIP.test(root.nodeName)) return;
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const list = [];
        while (tw.nextNode()) list.push(tw.currentNode);
        list.forEach(fixText);
    }
    let queue = new Set(), scheduled = false;
    const flush = () => { scheduled = false; const q = queue; queue = new Set(); q.forEach(n => { if (n.isConnected) walk(n); }); };
    function start() {
        sprite(); walk(document.body);
        new MutationObserver(ms => {
            ms.forEach(m => { if (m.type === 'characterData') queue.add(m.target); else m.addedNodes.forEach(n => queue.add(n)); });
            if (!scheduled && queue.size) { scheduled = true; requestAnimationFrame(flush); }
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
