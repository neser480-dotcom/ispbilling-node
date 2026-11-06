// i18n-tool.js  (শুধু Node.js, কোনো প্যাকেজ লাগে না)
//
// ধাপ ১ (স্ক্যান, কোড বদলায় না):  node i18n-tool.js scan  "C:\path\to\project"
// ধাপ ২ (ফিক্স, .bak ব্যাকআপ সহ):   node i18n-tool.js fix   "C:\path\to\project"

const fs = require('fs');
const path = require('path');

const cmd = process.argv[2];
const ROOT = path.resolve(process.argv[3] || '.');
if (!['scan', 'fix'].includes(cmd)) {
  console.log('Usage: node i18n-tool.js scan|fix <project-folder>');
  process.exit(1);
}

const LANG_DIR = path.join(ROOT, 'lang');
const SKIP = new Set(['node_modules', '.git', 'lang', 'dist', 'build', 'vendor']);
const enPath = path.join(LANG_DIR, 'en.json');
const bnPath = path.join(LANG_DIR, 'bn.json');
const load = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {});
const en = load(enPath);
const bn = load(bnPath);
const rev = {};
Object.keys(en).forEach(k => (rev[en[k]] = k));

const hasLatin = s => /[A-Za-z]{2,}/.test(s);
const clean = s => s.replace(/\s+/g, ' ').trim();
const slug = s =>
  clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'text';

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

// HTML / EJS / HBS: placeholder, title ও সাধারণ টেক্সট
function processMarkup(src, found, file) {
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

  out = out.replace(/<([a-zA-Z][\w-]*)\b([^<>]*)>([^<>{}%]+)<\/\1>/g, (m, tag, attrs, inner) => {
    if (/^(script|style|title|textarea|code|pre)$/i.test(tag)) return m;
    if (tag.toLowerCase() === 'option' && /value="(en|bn)"/.test(attrs)) return m; // ভাষার ড্রপডাউন বাদ
    if (attrs.includes('data-i18n=')) return m;
    const txt = clean(inner);
    if (!hasLatin(txt) || txt.length > 120) return m;
    const key = keyFor(txt);
    found.push({ file, kind: 'text', text: txt, key });
    return '<' + tag + attrs + ' data-i18n="' + key + '">' + inner + '</' + tag + '>';
  });
  return out;
}

// ক্লায়েন্ট JS: alert / confirm / toastr / Swal এর প্রথম স্ট্রিং
function processJs(src, found, file) {
  const re = /\b(alert|confirm|toastr\.(?:success|error|warning|info)|Swal\.fire)\(\s*(['"])([^'"\n]*[A-Za-z]{2,}[^'"\n]*)\2/g;
  return src.replace(re, (m, fn, q, text) => {
    const key = keyFor(text);
    found.push({ file, kind: 'js:' + fn, text: clean(text), key });
    return fn + "(t('" + key + "')";
  });
}

const RUNTIME = [
  "let translations = {};",
  "function t(key) { return translations[key] || (window.__en && window.__en[key]) || key; }",
  "function applyLang() {",
  "  const set = (el, prop, v) => { if (v && el[prop] !== v) el[prop] = v; };",
  "  document.querySelectorAll('[data-i18n]').forEach(el => set(el, 'textContent', t(el.dataset.i18n)));",
  "  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => set(el, 'placeholder', t(el.dataset.i18nPlaceholder)));",
  "  document.querySelectorAll('[data-i18n-title]').forEach(el => set(el, 'title', t(el.dataset.i18nTitle)));",
  "}",
  "async function setLang(lang) {",
  "  const get = async l => (await fetch('lang/' + l + '.json')).json();",
  "  window.__en = await get('en');",
  "  translations = lang === 'en' ? window.__en : await get(lang);",
  "  applyLang();",
  "  document.documentElement.lang = lang;",
  "  try { localStorage.setItem('lang', lang); } catch (e) {}",
  "}",
  "document.addEventListener('DOMContentLoaded', () => {",
  "  const sw = document.getElementById('langSwitch');",
  "  let saved = 'en';",
  "  try { saved = localStorage.getItem('lang') || 'en'; } catch (e) {}",
  "  if (sw) { sw.value = saved; sw.addEventListener('change', e => setLang(e.target.value)); }",
  "  setLang(saved);",
  "  new MutationObserver(applyLang).observe(document.body, { childList: true, subtree: true });",
  "});",
  ""
].join('\n');

const all = [];
const skippedServer = [];
let changed = 0;

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  const isMarkup = /\.(html|ejs|hbs)$/i.test(file);
  const isJs = /\.js$/i.test(file) && !/(^|[\\/])(i18n|i18n-tool)\.js$|\.min\.js$/i.test(file);
  if (!isMarkup && !isJs) continue;

  const src = fs.readFileSync(file, 'utf8');
  const found = [];
  let out = src;

  if (isMarkup) out = processMarkup(src, found, rel);
  else if (/require\(|module\.exports/.test(src)) { skippedServer.push(rel); continue; }
  else out = processJs(src, found, rel);

  all.push(...found);
  if (cmd === 'fix' && out !== src) {
    if (!fs.existsSync(file + '.bak')) fs.writeFileSync(file + '.bak', src);
    fs.writeFileSync(file, out);
    changed++;
  }
}

fs.mkdirSync(LANG_DIR, { recursive: true });
fs.writeFileSync(enPath, JSON.stringify(en, null, 2));
fs.writeFileSync(bnPath, JSON.stringify(bn, null, 2));

if (cmd === 'fix') {
  const rt = path.join(ROOT, 'i18n.js');
  if (!fs.existsSync(rt)) fs.writeFileSync(rt, RUNTIME);
}

const lines = all.map(f => '[' + f.kind + '] ' + f.file + '  =>  ' + f.key + '  |  ' + f.text);
fs.writeFileSync(path.join(ROOT, 'i18n-report.txt'), lines.join('\n'));

console.log('\n' + (cmd === 'scan' ? 'SCAN' : 'FIX') + ' সম্পন্ন');
console.log('পাওয়া হার্ডকোড লেখা : ' + all.length);
console.log('মোট key (lang/en.json): ' + Object.keys(en).length);
console.log('বাংলা বাকি (bn.json খালি): ' + Object.values(bn).filter(v => !v).length);
if (cmd === 'fix') console.log('বদলানো ফাইল: ' + changed + ' (প্রতিটার .bak ব্যাকআপ আছে)');
if (skippedServer.length) {
  console.log('\nসার্ভার-সাইড JS (নিজে হাতে দেখতে হবে):');
  skippedServer.forEach(f => console.log('  - ' + f));
}
console.log('\nবিস্তারিত তালিকা: i18n-report.txt');
