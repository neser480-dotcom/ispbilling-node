// i18n-lite.js  (শুধু Node.js লাগে, কোনো প্যাকেজ নয়)
//
// এই টুল আপনার পেজের লেখা/HTML বদলায় না। শুধু প্রতিটি পেজের </body>-এর আগে একটা লাইন বসায়:
//     <script src="/assets/js/i18n.js?v=..."></script>
// আর public\assets\js\i18n.js ফাইলটা তৈরি করে।
//
// ব্যবহার:
//   node i18n-lite.js check     "C:\path\to\project"   # কী কী বদলাবে দেখায়, কিছু লেখে না
//   node i18n-lite.js install   "C:\path\to\project"
//   node i18n-lite.js uninstall "C:\path\to\project"   # সব আগের অবস্থায়

const fs = require('fs');
const path = require('path');

const cmd = process.argv[2];
const ROOT = path.resolve(process.argv[3] || '.');
if (!['check', 'install', 'uninstall'].includes(cmd)) {
  console.log('Usage: node i18n-lite.js check|install|uninstall <project-folder>');
  process.exit(1);
}
if (!fs.existsSync(ROOT)) { console.log('ফোল্ডার পাওয়া যায়নি: ' + ROOT); process.exit(1); }

const PUBLIC = fs.existsSync(path.join(ROOT, 'public')) ? path.join(ROOT, 'public') : ROOT;
const RUNTIME_PATH = path.join(PUBLIC, 'assets', 'js', 'i18n.js');
const LANG_DIR = path.join(PUBLIC, 'lang');
const SKIP = new Set(['node_modules', '.git', 'dist', 'build']);
const STAMP = Date.now().toString(36);

const RUNTIME = String.raw`/* i18n runtime v3
 * পেজের HTML/JS কিছুই বদলায় না।
 * EN মোড  : কিছুই করে না (পেজ হুবহু আগের মতো)।
 * বাংলা মোড: DOM-এর লেখা (text, placeholder, title) en.json -> bn.json মিলিয়ে অনুবাদ করে।
 * EN-এ ফিরলে সব লেখা হুবহু আগের অবস্থায় ফেরত আসে।
 * টপবারে data-lang="en|bn" যুক্ত যেকোনো লিংক/বাটন, অথবা #langSwitch সিলেক্ট দিয়ে ভাষা বদলায়।
 * কোনো এলিমেন্টে অনুবাদ বন্ধ রাখতে: data-no-i18n লিখুন।
 */
(function () {
  'use strict';
  if (window.__ispI18n) return;

  var KEY = 'ispLang';
  var CACHE = 'ispLangMap.v1';
  var SKIP = 'script,style,textarea,noscript,code,pre,[data-no-i18n],[translate="no"],[contenteditable="true"]';
  var ATTRS = ['placeholder', 'title'];
  var BN_LABEL = 'বাং'; /* বাং */

  var lang = 'en';
  var map = null, mapLower = null;
  var origText = new WeakMap();
  var origAttr = new WeakMap();
  var initialDocLang = document.documentElement.getAttribute('lang');
  var initialHadClass = document.documentElement.hasAttribute('class');
  var ta = document.createElement('textarea');

  function decode(s) { ta.innerHTML = s; return ta.value; }
  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }

  /* ---------- অনুবাদ ম্যাপ ---------- */
  function buildMap(pairs) {
    map = new Map(); mapLower = new Map();
    pairs.forEach(function (p) {
      var e = p[0], t = p[1];
      if (!e || !t) return;
      if (!map.has(e)) map.set(e, t);
      var l = e.toLowerCase();
      if (!mapLower.has(l)) mapLower.set(l, t);
    });
  }

  function pairsFrom(en, bn) {
    var out = [];
    Object.keys(en).forEach(function (k) {
      var b = bn[k];
      if (!b) return;
      var e = norm(decode(String(en[k])));
      var t = decode(String(b)).trim();
      if (e && t) out.push([e, t]);
    });
    return out;
  }

  function lookup(text) {
    if (!map) return null;
    var n = norm(text);
    if (!n) return null;
    return map.get(n) || mapLower.get(n.toLowerCase()) || null;
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
      return r.json();
    });
  }

  var mapPromise = null;
  function ensureMap() {
    if (map) return Promise.resolve();
    if (mapPromise) return mapPromise;

    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch (e) {}

    var fresh = Promise.all([fetchJson('/lang/en.json'), fetchJson('/lang/bn.json')])
      .then(function (r) {
        var pairs = pairsFrom(r[0], r[1]);
        buildMap(pairs);
        try { localStorage.setItem(CACHE, JSON.stringify(pairs)); } catch (e) {}
        if (lang === 'bn') applyAll();
      })
      .catch(function (err) {
        if (!map) { buildMap([]); }
        console.warn('[i18n] ভাষা ফাইল লোড হয়নি:', err && err.message);
      });

    if (Array.isArray(cached) && cached.length) {
      buildMap(cached);
      mapPromise = Promise.resolve();
    } else {
      mapPromise = fresh;
    }
    return mapPromise;
  }

  /* ---------- অনুবাদ প্রয়োগ ---------- */
  function skipped(el) { return !el || (el.closest && el.closest(SKIP)); }

  function tNode(n) {
    var v = n.nodeValue;
    if (!v || !v.trim()) return;
    var rec = origText.get(n);
    if (rec && rec.t === v) return;           /* আমারই করা অনুবাদ, অপরিবর্তিত */
    var p = n.parentElement;
    if (skipped(p)) return;
    var bn = lookup(v);
    if (!bn) { if (rec) origText.delete(n); return; }
    var lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
    var nv = lead + bn + trail;
    origText.set(n, { o: v, t: nv });
    n.nodeValue = nv;
  }

  function tAttrs(el) {
    if (!el.getAttribute || (el.closest && el.closest('[data-no-i18n],[translate="no"]'))) return;
    ATTRS.forEach(function (a) {
      var v = el.getAttribute(a);
      if (v == null || !v.trim()) return;
      var all = origAttr.get(el) || {};
      var rec = all[a];
      if (rec && rec.t === v) return;
      var bn = lookup(v);
      if (!bn) { if (rec) { delete all[a]; } return; }
      all[a] = { o: v, t: bn };
      origAttr.set(el, all);
      el.setAttribute(a, bn);
    });
  }

  function textNodesOf(root) {
    var list = [];
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = w.nextNode())) list.push(n);
    return list;
  }

  function processTree(node) {
    if (!node) return;
    if (node.nodeType === 3) { tNode(node); return; }
    if (node.nodeType !== 1) return;
    textNodesOf(node).forEach(tNode);
    tAttrs(node);
    var els = node.querySelectorAll('[placeholder],[title]');
    for (var i = 0; i < els.length; i++) tAttrs(els[i]);
  }

  function applyAll() {
    if (!document.body) return;
    processTree(document.body);
    syncSwitch();
  }

  function restoreAll() {
    if (!document.body) return;
    textNodesOf(document.body).forEach(function (n) {
      var r = origText.get(n);
      if (r) { if (n.nodeValue === r.t) n.nodeValue = r.o; origText.delete(n); }
    });
    var els = document.body.querySelectorAll('[placeholder],[title]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], all = origAttr.get(el);
      if (!all) continue;
      ATTRS.forEach(function (a) {
        var r = all[a];
        if (r && el.getAttribute(a) === r.t) el.setAttribute(a, r.o);
      });
      origAttr.delete(el);
    }
  }

  /* ---------- টপবারের বাটন/সিলেক্ট ---------- */
  function toLang(v) {
    v = String(v || '');
    return (/^(bn|bangla|bengali)/i.test(v) || v.indexOf(BN_LABEL) === 0 || v === 'বাংলা') ? 'bn' : 'en';
  }

  function syncSwitch() {
    var b = document.getElementById('langBtn');
    if (b) {
      for (var i = 0; i < b.childNodes.length; i++) {
        var n = b.childNodes[i];
        if (n.nodeType === 3 && n.nodeValue.trim()) {
          var want = lang === 'bn' ? BN_LABEL : 'EN';
          var cur = n.nodeValue.trim();
          if (cur !== want) n.nodeValue = n.nodeValue.replace(cur, want);
          break;
        }
      }
    }
    var sels = document.querySelectorAll('#langSwitch');
    for (var s = 0; s < sels.length; s++) {
      var sel = sels[s];
      for (var j = 0; j < sel.options.length; j++) {
        if (toLang(sel.options[j].value) === lang) {
          if (sel.selectedIndex !== j) sel.selectedIndex = j;
          break;
        }
      }
    }
  }

  /* ---------- ভাষা বদল ---------- */
  function setLang(l) {
    l = (l === 'bn') ? 'bn' : 'en';
    try { localStorage.setItem(KEY, l); } catch (e) {}
    if (l === 'bn') {
      return ensureMap().then(function () {
        lang = 'bn';
        document.documentElement.setAttribute('lang', 'bn');
        document.documentElement.classList.add('lang-bn');
        applyAll();
      });
    }
    lang = 'en';
    restoreAll();
    document.documentElement.classList.remove('lang-bn');
    if (!initialHadClass && !document.documentElement.getAttribute('class')) document.documentElement.removeAttribute('class');
    if (initialDocLang == null) document.documentElement.removeAttribute('lang');
    else document.documentElement.setAttribute('lang', initialDocLang);
    syncSwitch();
    return Promise.resolve();
  }

  /* ---------- পরে যোগ হওয়া কনটেন্ট (JS দিয়ে বানানো টেবিল/মেনু/মোডাল) ---------- */
  var queue = [], scheduled = false;
  function flush() {
    scheduled = false;
    if (lang !== 'bn' || !map) { queue = []; return; }
    var q = queue; queue = [];
    q.forEach(function (it) {
      var n = it.n;
      if (!n || !n.isConnected) return;
      if (it.k === 'a') tAttrs(n);
      else processTree(n);
    });
    syncSwitch();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    (window.requestAnimationFrame || setTimeout)(flush);
  }

  function observe() {
    var mo = new MutationObserver(function (muts) {
      if (lang !== 'bn') return;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) queue.push({ k: 't', n: m.addedNodes[j] });
        } else if (m.type === 'characterData') {
          queue.push({ k: 't', n: m.target });
        } else if (m.type === 'attributes') {
          queue.push({ k: 'a', n: m.target });
        }
      }
      if (queue.length) schedule();
    });
    mo.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS
    });
  }

  function onClick(e) {
    var a = e.target && e.target.closest ? e.target.closest('[data-lang]') : null;
    if (!a) return;
    if (a.tagName === 'A') {
      var h = a.getAttribute('href');
      if (!h || h === '#') e.preventDefault();
    }
    setLang(toLang(a.getAttribute('data-lang')));
  }

  function onChange(e) {
    var t = e.target;
    if (t && t.id === 'langSwitch') setLang(toLang(t.value));
  }

  function init() {
    var saved = 'en';
    try { saved = localStorage.getItem(KEY) || 'en'; } catch (e) {}
    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onChange, true);
    observe();
    if (saved === 'bn') setLang('bn');
  }

  window.__ispI18n = { setLang: setLang, getLang: function () { return lang; } };
  window.setLang = setLang;
  window.i18nT = function (text) {
    if (lang !== 'bn') return text;
    return lookup(String(text)) || text;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
`;

const TAG_RE = /[ \t]*<script\b[^>]*assets\/js\/i18n\.js[^>]*><\/script>[ \t]*(\r?\n)?/gi;
const HAS_TAG = /<script\b[^>]*assets\/js\/i18n\.js[^>]*><\/script>/i;
const BODY_END = /<\/body>(?![\s\S]*<\/body>)/i;

function walk(dir, out) {
  out = out || [];
  for (const f of fs.readdirSync(dir)) {
    if (SKIP.has(f)) continue;
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(html|htm|ejs|hbs)$/i.test(f)) out.push(p);
  }
  return out;
}

// ভাষা ফাইল যাচাই
function checkLang() {
  let ok = true;
  for (const n of ['en.json', 'bn.json']) {
    const p = path.join(LANG_DIR, n);
    if (!fs.existsSync(p)) {
      const old = path.join(ROOT, 'lang', n);
      if (cmd === 'install' && fs.existsSync(old)) {
        fs.mkdirSync(LANG_DIR, { recursive: true });
        fs.copyFileSync(old, p);
        console.log('কপি করা হলো: lang\\' + n + ' -> ' + path.relative(ROOT, p));
      } else {
        console.log('নেই: ' + path.relative(ROOT, p));
        ok = false;
      }
    }
  }
  if (!ok) return false;
  try {
    const en = JSON.parse(fs.readFileSync(path.join(LANG_DIR, 'en.json'), 'utf8'));
    const bn = JSON.parse(fs.readFileSync(path.join(LANG_DIR, 'bn.json'), 'utf8'));
    const filled = Object.keys(en).filter(k => bn[k]).length;
    console.log('ভাষা ফাইল ঠিক আছে: ' + Object.keys(en).length + ' key, বাংলা আছে ' + filled + 'টার');
  } catch (e) {
    console.log('JSON ভুল আছে: ' + e.message);
    return false;
  }
  return true;
}

const tag = '<script src="/assets/js/i18n.js?v=' + STAMP + '"></script>';
const files = walk(ROOT);
const willChange = [], already = [], noBody = [];

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (cmd === 'uninstall') {
    if (HAS_TAG.test(src)) willChange.push(f);
    continue;
  }
  if (!BODY_END.test(src)) { noBody.push(f); continue; }
  if (HAS_TAG.test(src)) already.push(f);
  willChange.push(f);
}

const rel = p => path.relative(ROOT, p);

if (cmd === 'check') {
  console.log('\nCHECK (কিছু লেখা হয়নি)');
  checkLang();
  console.log('\nযে পেজে লাইন বসবে/নতুন হবে: ' + willChange.length + 'টা');
  willChange.forEach(f => console.log('  ' + rel(f) + (already.includes(f) ? '   (আগের লাইন নতুন হবে)' : '')));
  console.log('\nপুরো পেজ নয় (</body> নেই), ছোঁয়া হবে না: ' + noBody.length + 'টা');
  noBody.slice(0, 40).forEach(f => console.log('  ' + rel(f)));
  process.exit(0);
}

if (cmd === 'install') {
  if (!checkLang()) {
    console.log('\nআগে public\\lang\\en.json ও bn.json বসান, তারপর আবার চালান।');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(RUNTIME_PATH), { recursive: true });
  fs.writeFileSync(RUNTIME_PATH, RUNTIME);

  let changed = 0;
  for (const f of willChange) {
    const src = fs.readFileSync(f, 'utf8');
    const eol = /\r\n/.test(src) ? '\r\n' : '\n';
    let out = src.replace(TAG_RE, '');                       // আগের লাইন থাকলে সরিয়ে
    out = out.replace(BODY_END, tag + eol + '</body>');      // নতুন লাইন বসানো
    if (out !== src) { fs.writeFileSync(f, out); changed++; }
  }
  console.log('\nINSTALL সম্পন্ন');
  console.log('রানটাইম: ' + rel(RUNTIME_PATH));
  console.log('পেজে লাইন বসেছে: ' + changed + 'টা');
  console.log('ছোঁয়া হয়নি (</body> নেই): ' + noBody.length + 'টা');
  console.log('\nব্রাউজারে Ctrl+F5 দিন। ভাষা: টপবারের EN/বাংলা বাটন।');
  process.exit(0);
}

if (cmd === 'uninstall') {
  let changed = 0;
  for (const f of willChange) {
    const src = fs.readFileSync(f, 'utf8');
    const out = src.replace(TAG_RE, '');
    if (out !== src) { fs.writeFileSync(f, out); changed++; }
  }
  if (fs.existsSync(RUNTIME_PATH)) fs.unlinkSync(RUNTIME_PATH);
  console.log('\nUNINSTALL সম্পন্ন: ' + changed + 'টা পেজ থেকে লাইন সরানো হয়েছে, i18n.js মুছেছে।');
}
