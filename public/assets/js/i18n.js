/* i18n runtime v3
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
