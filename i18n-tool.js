// i18n-tool.js  v2  (শুধু Node.js, কোনো প্যাকেজ লাগে না)
//
// ধাপ ১ (স্ক্যান, সোর্স কোড বদলায় না):  node i18n-tool.js scan "C:\path\to\project"
// ধাপ ২ (ফিক্স, .bak ব্যাকআপ সহ):        node i18n-tool.js fix  "C:\path\to\project"

const fs = require('fs');
const path = require('path');

const cmd = process.argv[2];
const ROOT = path.resolve(process.argv[3] || '.');
if (!['scan', 'fix'].includes(cmd)) {
  console.log('Usage: node i18n-tool.js scan|fix <project-folder>');
  process.exit(1);
}

// public ফোল্ডার থাকলে lang ও i18n.js সেখানে যাবে (যাতে ব্রাউজার থেকে /lang/bn.json পাওয়া যায়)
const PUBLIC = path.join(ROOT, 'public');
const HAS_PUBLIC = fs.existsSync(PUBLIC);
const LANG_DIR = path.join(HAS_PUBLIC ? PUBLIC : ROOT, 'lang');
const OLD_LANG_DIR = path.join(ROOT, 'lang');
const RUNTIME_PATH = HAS_PUBLIC
  ? path.join(PUBLIC, 'assets', 'js', 'i18n.js')
  : path.join(ROOT, 'i18n.js');
const RUNTIME_URL = HAS_PUBLIC ? '/assets/js/i18n.js' : '/i18n.js';

const SKIP = new Set(['node_modules', '.git', 'lang', 'dist', 'build', 'vendor']);
const enPath = path.join(LANG_DIR, 'en.json');
const bnPath = path.join(LANG_DIR, 'bn.json');

fs.mkdirSync(LANG_DIR, { recursive: true });
// আগের স্ক্যানের lang ফাইল থাকলে নতুন জায়গায় আনা
for (const n of ['en.json', 'bn.json']) {
  const o = path.join(OLD_LANG_DIR, n), d = path.join(LANG_DIR, n);
  if (OLD_LANG_DIR !== LANG_DIR && fs.existsSync(o) && !fs.existsSync(d)) fs.copyFileSync(o, d);
}

const load = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {});
const en = load(enPath);
const bn = load(bnPath);
const rev = {};
Object.keys(en).forEach(k => (rev[en[k]] = k));

const hasLatin = s => /[A-Za-z]{2,}/.test(s);
const clean = s => s.replace(/\s+/g, ' ').trim();
const slug = s =>
  clean(s).toLowerCase().replace(/&[a-z#0-9]+;/g, ' ').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'text';

function keyFor(text) {
  text = clean(text);
  if (rev[text]) return rev[text];
  const base = slug(text);
  let k = base, i = 2;
  while (en[k] !== undefined) k = base + '_' + i++;
  en[k] = text;
  if (bn[k] === undefined) bn[k] = '';
  rev[text] = k;
  return k;
}

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    if (SKIP.has(f)) continue;
    const p = path.join(dir, f);
    fs.statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

const NO_TEXT_TAGS = /^(script|style|title|textarea|code|pre|select)$/i;

function processMarkup(src, found, file) {
  // <script>, <style>, <!-- --> এর ভেতরে কিছুই বদলানো হবে না
  return src
    .split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->)/gi)
    .map((seg, idx) => (idx % 2 === 1 ? seg : processSeg(seg, found, file)))
    .join('');
}

function processSeg(src, found, file) {
  // ১) placeholder / title অ্যাট্রিবিউট
  let out = src.replace(/<([a-zA-Z][\w-]*)\b([^<>]*)>/g, (m, tag, attrs) => {
    if (/^(script|style)$/i.test(tag)) return m;
    let add = '';
    for (const a of ['placeholder', 'title']) {
      const mm = attrs.match(new RegExp('(?:^|\\s)' + a + '="([^"{}<>%]+)"'));
      if (mm && hasLatin(mm[1]) && !attrs.includes('data-i18n-' + a)) {
        const key = keyFor(mm[1]);
        found.push({ file, kind: a, text: clean(mm[1]), key });
        add += ' data-i18n-' + a + '="' + key + '"';
      }
    }
    return add ? m.replace(/\s*\/?>$/, s => add + s) : m;
  });

  // ২) শুধু-টেক্সট এলিমেন্ট: <button>Save</button>
  out = out.replace(/<([a-zA-Z][\w-]*)\b([^<>]*)>([^<>{}%]+)<\/\1>/g, (m, tag, attrs, inner) => {
    if (NO_TEXT_TAGS.test(tag) && tag.toLowerCase() !== 'select') return m;
    if (tag.toLowerCase() === 'option' &&
        (/value="(en|bn)"/.test(attrs) || /^(English|Bangla|Bengali)$/i.test(clean(inner)))) return m;
    if (attrs.includes('data-i18n=') || /data-lang=/.test(attrs)) return m;
    const txt = clean(inner);
    if (/^(EN|BN|English|Bangla|Bengali)$/i.test(txt)) return m; // ভাষা বাটন/মেনু বাদ
    if (!hasLatin(txt.replace(/&[a-zA-Z#0-9]+;/g, ' ')) || txt.length > 120) return m;
    const key = keyFor(txt);
    found.push({ file, kind: 'text', text: txt, key });
    return '<' + tag + attrs + ' data-i18n="' + key + '">' + inner + '</' + tag + '>';
  });

  // ৩) মিক্সড কনটেন্ট: <a><i class="fa"></i> Dashboard</a>  → টেক্সট অংশ <span> এ মোড়ানো
  const parts = out.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->)/gi);
  out = parts
    .map((seg, idx) => {
      if (idx % 2 === 1) return seg; // script / style / comment
      return seg.replace(/(<\/?([a-zA-Z][\w-]*)\b[^<>]*>)([^<>{}%]+)(?=<)/g, (m, prev, ptag, text) => {
        const isClose = prev.startsWith('</');
        if (!isClose && (/data-i18n=|data-lang=|id="langBtn"/.test(prev) || NO_TEXT_TAGS.test(ptag) || /^option$/i.test(ptag))) return m;
        if (!hasLatin(text.replace(/&[a-zA-Z#0-9]+;/g, ' '))) return m;
        const txt = clean(text);
        if (txt.length > 120 || /^(EN|BN|English|Bangla|Bengali)$/i.test(txt)) return m;
        const lead = text.match(/^\s*/)[0];
        const trail = text.match(/\s*$/)[0];
        const key = keyFor(txt);
        found.push({ file, kind: 'mixed', text: txt, key });
        return prev + lead + '<span data-i18n="' + key + '">' + text.trim() + '</span>' + trail;
      });
    })
    .join('');
  return out;
}

// ক্লায়েন্ট JS: alert / confirm / toastr / Swal এর প্রথম স্ট্রিং
function processJs(src, found, file) {
  const re = /\b(alert|confirm|toastr\.(?:success|error|warning|info)|Swal\.fire)\(\s*(['"])([^'"\n]*[A-Za-z]{2,}[^'"\n]*)\2/g;
  return src.replace(re, (m, fn, q, text) => {
    const key = keyFor(text);
    found.push({ file, kind: 'js:' + fn, text: clean(text), key });
    return fn + "(i18nT('" + key + "')";
  });
}

const RUNTIME = [
  "// i18n runtime (i18n-tool.js দিয়ে তৈরি)",
  "(function () {",
  "  var translations = {}, en = {}, current = 'en';",
  "  var dec = function (s) { var d = document.createElement('textarea'); d.innerHTML = s; return d.value; };",
  "  var norm = function (s) { return dec(s || '').replace(/\\s+/g, ' ').trim(); };",
  "  function i18nT(key) { return dec(translations[key] || en[key] || key); }",
  "",
  "  // JS যে লেখা নিজে বদলেছে (যেমন 'Page 2 of 5') সেটা ছোঁয়া হয় না",
  "  function update(el, prop, key) {",
  "    var cur = norm(el[prop]);",
  "    if (cur !== norm(en[key]) && cur !== el['__ap_' + prop]) return;",
  "    var v = i18nT(key);",
  "    el['__ap_' + prop] = norm(v);",
  "    if (el[prop] !== v) el[prop] = v;",
  "  }",
  "",
  "  function applyLang() {",
  "    document.querySelectorAll('[data-i18n]').forEach(function (el) { update(el, 'textContent', el.dataset.i18n); });",
  "    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) { update(el, 'placeholder', el.dataset.i18nPlaceholder); });",
  "    document.querySelectorAll('[data-i18n-title]').forEach(function (el) { update(el, 'title', el.dataset.i18nTitle); });",
  "    syncSwitch(); syncButton();",
  "  }",
  "",
  "  var SWITCH = '#langSwitch, select[data-i18n-title=\"language\"]';",
  "  function toLang(v) { return /^(bn|bangla|bengali)/i.test(v) || v === '\\u09ac\\u09be\\u0982\\u09b2\\u09be' ? 'bn' : 'en'; }",
  "  function syncSwitch() {",
  "    document.querySelectorAll(SWITCH).forEach(function (sel) {",
  "      for (var i = 0; i < sel.options.length; i++) {",
  "        if (toLang(sel.options[i].value) === current && sel.selectedIndex !== i) { sel.selectedIndex = i; break; }",
  "      }",
  "    });",
  "  }",
  "",
  "  // টপবারের #langBtn এর লেখা (EN / বাং) আপডেট",
  "  function syncButton() {",
  "    var b = document.getElementById('langBtn');",
  "    if (!b) return;",
  "    for (var i = 0; i < b.childNodes.length; i++) {",
  "      var n = b.childNodes[i];",
  "      if (n.nodeType === 3 && n.nodeValue.trim()) {",
  "        var v = current === 'bn' ? '\\u09ac\\u09be\\u0982' : 'EN';",
  "        if (n.nodeValue.trim() !== v) n.nodeValue = ' ' + v + ' ';",
  "        break;",
  "      }",
  "    }",
  "  }",
  "",
  "  function setLang(lang) {",
  "    var get = function (l) { return fetch('/lang/' + l + '.json').then(function (r) { return r.json(); }); };",
  "    return get('en').then(function (e) { en = e; return lang === 'en' ? e : get(lang); }).then(function (t) {",
  "      translations = t; current = lang;",
  "      document.documentElement.lang = lang;",
  "      try { localStorage.setItem('lang', lang); } catch (x) {}",
  "      applyLang();",
  "    });",
  "  }",
  "",
  "  function init() {",
  "    var saved = 'en';",
  "    try { saved = localStorage.getItem('lang') || 'en'; } catch (x) {}",
  "    document.addEventListener('change', function (e) {",
  "      if (e.target && e.target.matches && e.target.matches(SWITCH)) setLang(toLang(e.target.value));",
  "    });",
  "    document.addEventListener('click', function (e) {",
  "      var a = e.target.closest && e.target.closest('[data-lang]');",
  "      if (a) { e.preventDefault(); setLang(toLang(a.getAttribute('data-lang'))); }",
  "    });",
  "    setLang(saved);",
  "    var pending = false;",
  "    new MutationObserver(function () {",
  "      if (pending) return; pending = true;",
  "      requestAnimationFrame(function () { pending = false; applyLang(); });",
  "    }).observe(document.body, { childList: true, subtree: true });",
  "  }",
  "  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();",
  "",
  "  window.i18nT = i18nT; window.setLang = setLang; window.applyLang = applyLang;",
  "})();",
  ""
].join('\n');

const all = [];
const skippedServer = [];
let changed = 0, injected = 0;
const scriptTag = '<script src="' + RUNTIME_URL + '"></script>';

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  if (path.resolve(file) === path.resolve(RUNTIME_PATH)) continue;
  const isMarkup = /\.(html|ejs|hbs)$/i.test(file);
  const isJs = /\.js$/i.test(file) && !/(^|[\\/])(i18n|i18n-tool)\.js$|\.min\.js$/i.test(file);
  if (!isMarkup && !isJs) continue;

  const src = fs.readFileSync(file, 'utf8');
  const found = [];
  let out = src;

  if (isMarkup) {
    out = processMarkup(src, found, rel);
    if (cmd === 'fix' && /<\/body>/i.test(out) && !out.includes('i18n.js')) {
      out = out.replace(/<\/body>/i, '  ' + scriptTag + '\n</body>');
      injected++;
    }
  } else if (/require\(|module\.exports/.test(src)) {
    skippedServer.push(rel);
    continue;
  } else {
    out = processJs(src, found, rel);
  }

  all.push(...found);
  if (cmd === 'fix' && out !== src) {
    if (!fs.existsSync(file + '.bak')) fs.writeFileSync(file + '.bak', src);
    fs.writeFileSync(file, out);
    changed++;
  }
}

fs.writeFileSync(enPath, JSON.stringify(en, null, 2));
fs.writeFileSync(bnPath, JSON.stringify(bn, null, 2));

if (cmd === 'fix') {
  fs.mkdirSync(path.dirname(RUNTIME_PATH), { recursive: true });
  fs.writeFileSync(RUNTIME_PATH, RUNTIME);
}

const lines = all.map(f => '[' + f.kind + '] ' + f.file + '  =>  ' + f.key + '  |  ' + f.text);
fs.writeFileSync(path.join(ROOT, 'i18n-report.txt'), lines.join('\n'));

console.log('\n' + (cmd === 'scan' ? 'SCAN' : 'FIX') + ' সম্পন্ন');
console.log('পাওয়া হার্ডকোড লেখা : ' + all.length);
console.log('মোট key (' + path.relative(ROOT, enPath) + '): ' + Object.keys(en).length);
console.log('বাংলা বাকি (bn.json খালি): ' + Object.values(bn).filter(v => !v).length);
if (cmd === 'fix') {
  console.log('বদলানো ফাইল: ' + changed + ' (প্রতিটার .bak ব্যাকআপ আছে)');
  console.log('i18n.js যোগ হয়েছে ' + injected + ' টা পেজে: ' + scriptTag);
  console.log('রানটাইম ফাইল: ' + path.relative(ROOT, RUNTIME_PATH));
}
if (skippedServer.length) {
  console.log('\nসার্ভার-সাইড JS ' + skippedServer.length + 'টা (অটো বদলানো হয়নি, দরকার হলে হাতে)');
}
console.log('\nবিস্তারিত তালিকা: i18n-report.txt');
