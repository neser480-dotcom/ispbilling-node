// i18n runtime (i18n-tool.js à¦¦à¦¿à¦¯à¦¼à§‡ à¦¤à§ˆà¦°à¦¿)
(function () {
  var translations = {}, en = {}, current = 'en';
  var dec = function (s) { var d = document.createElement('textarea'); d.innerHTML = s; return d.value; };
  var norm = function (s) { return dec(s || '').replace(/\s+/g, ' ').trim(); };
  function i18nT(key) { return dec(translations[key] || en[key] || key); }

  // JS à¦¯à§‡ à¦²à§‡à¦–à¦¾ à¦¨à¦¿à¦œà§‡ à¦¬à¦¦à¦²à§‡à¦›à§‡ (à¦¯à§‡à¦®à¦¨ 'Page 2 of 5') à¦¸à§‡à¦Ÿà¦¾ à¦›à§‹à¦à¦¯à¦¼à¦¾ à¦¹à¦¯à¦¼ à¦¨à¦¾
  function update(el, prop, key) {
    if (prop !== 'textContent') {
        var cur = norm(el[prop]);
        if (cur !== norm(en[key]) && cur !== el['__ap_' + prop]) return;

        var v = i18nT(key);
        el['__ap_' + prop] = norm(v);

        if (el[prop] !== v) el[prop] = v;
        return;
    }

    var nodes = Array.from(el.childNodes).filter(function (node) {
        return node.nodeType === 3 && node.nodeValue.trim();
    });

    var cur = norm(nodes.map(function (node) {
        return node.nodeValue;
    }).join(' '));

    var previous = el.__ap_textContent;

    if (cur !== norm(en[key]) && cur !== previous) return;

    var v = i18nT(key);

    if (nodes.length) {
        nodes[0].nodeValue = v;

        for (var i = 1; i < nodes.length; i++) {
            nodes[i].nodeValue = '';
        }
    } else {
        el.appendChild(document.createTextNode(v));
    }

    el.__ap_textContent = norm(v);
}

  function applyLang() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) { update(el, 'textContent', el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) { update(el, 'placeholder', el.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) { update(el, 'title', el.dataset.i18nTitle); });
    syncSwitch(); syncButton();
  }

  var SWITCH = '#langSwitch, select[data-i18n-title="language"]';
  function toLang(v) { return /^(bn|bangla|bengali)/i.test(v) || v === '\u09ac\u09be\u0982\u09b2\u09be' ? 'bn' : 'en'; }
  function syncSwitch() {
    document.querySelectorAll(SWITCH).forEach(function (sel) {
      for (var i = 0; i < sel.options.length; i++) {
        if (toLang(sel.options[i].value) === current && sel.selectedIndex !== i) { sel.selectedIndex = i; break; }
      }
    });
  }

  // à¦Ÿà¦ªà¦¬à¦¾à¦°à§‡à¦° #langBtn à¦à¦° à¦²à§‡à¦–à¦¾ (EN / à¦¬à¦¾à¦‚) à¦†à¦ªà¦¡à§‡à¦Ÿ
  function syncButton() {
    var b = document.getElementById('langBtn');
    if (!b) return;
    for (var i = 0; i < b.childNodes.length; i++) {
      var n = b.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.trim()) {
        var v = current === 'bn' ? '\u09ac\u09be\u0982' : 'EN';
        if (n.nodeValue.trim() !== v) n.nodeValue = ' ' + v + ' ';
        break;
      }
    }
  }

  function setLang(lang) {
    var get = function (l) { return fetch('/lang/' + l + '.json').then(function (r) { return r.json(); }); };
    return get('en').then(function (e) { en = e; return lang === 'en' ? e : get(lang); }).then(function (t) {
      translations = t; current = lang;
      document.documentElement.lang = lang;
      try { localStorage.setItem('lang', lang); } catch (x) {}
      applyLang();
    });
  }

  function init() {
    var saved = 'en';
    try { saved = localStorage.getItem('lang') || 'en'; } catch (x) {}
    document.addEventListener('change', function (e) {
      if (e.target && e.target.matches && e.target.matches(SWITCH)) setLang(toLang(e.target.value));
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-lang]');
      if (a) { e.preventDefault(); setLang(toLang(a.getAttribute('data-lang'))); }
    });
    setLang(saved);
    var pending = false;
    new MutationObserver(function () {
      if (pending) return; pending = true;
      requestAnimationFrame(function () { pending = false; applyLang(); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.i18nT = i18nT; window.setLang = setLang; window.applyLang = applyLang;
})();
