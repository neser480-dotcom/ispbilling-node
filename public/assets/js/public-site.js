"use strict";
/* Public website renderer: builds the whole page from CMS JSON. All text is set via textContent (XSS-safe). */
(function () {
  var BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "" : "https://app.amaderbill.com";
  var API = BASE + "/api/website-management/content";
  var bn = function (n) { return Number(n || 0).toLocaleString("bn-BD"); };

  /* Latest published APKs (Admin / Customer) — one shared request */
  var appsInfoPromise = null;
  function appsInfo() {
    if (!appsInfoPromise) {
      appsInfoPromise = fetch(BASE + "/api/app-download", { headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return (j && j.success && j.apps) || {}; })
        .catch(function () { return {}; });
    }
    return appsInfoPromise;
  }

  var safeUrl = function (u) { u = String(u || "").trim(); return /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(u) ? u : "#"; };
  function h(tag, attrs) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]; if (v === undefined || v === null || v === "") return;
      if (k === "text") e.textContent = v;
      else if (k === "href" || k === "src") e.setAttribute(k, safeUrl(v));
      else e.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c) e.append(c); }
    return e;
  }
  var list = function (x) { return Array.isArray(x) ? x : []; };
  var btn = function (label, url, style) { return label ? h("a", { href: url, "class": "btn btn-" + (style === "outline" ? "outline" : "primary"), text: label }) : null; };

  function heading(d) {
    if (!d.title && !d.label) return null;
    return h("div", { "class": "section-heading" }, d.label && h("span", { text: d.label }), d.title && h("h2", { text: d.title }), d.subtitle && h("p", { text: d.subtitle }));
  }
  function wrap(s, cls, inner) {
    return h("section", { "class": "section" + (cls ? " " + cls : ""), id: s.id }, h("div", { "class": "container" }, heading(s.data), inner));
  }
  function grid(cls, items, fn) { var g = h("div", { "class": cls }); list(items).forEach(function (i) { g.append(fn(i)); }); return g; }

  var R = {
    hero: function (s) {
      var d = s.data, t = h("h1", { text: d.title ? d.title + " " : "" });
      if (d.highlight) t.append(h("strong", { text: d.highlight }));
      var btns = h("div", { "class": "hero-buttons" });
      list(d.buttons).forEach(function (b) { btns.append(btn(b.label, b.url, b.style)); });
      var visual = d.image
        ? h("div", { "class": "hero-visual" }, h("img", { src: d.image, alt: d.title || "", style: "max-width:100%;border-radius:16px" }))
        : null;
      return h("section", { "class": "hero", id: s.id }, h("div", { "class": "container hero-grid" },
        h("div", {}, d.label && h("span", { "class": "hero-label", text: d.label }), t, h("p", { "class": "hero-description", text: d.description }), btns), visual));
    },
    about: function (s) {
      var d = s.data, pts = h("div", { "class": "about-points" });
      list(d.points).forEach(function (p) { pts.append(h("div", {}, h("span", { "class": "check", text: "✓" }), " " + p)); });
      var c = h("div", { "class": "about-content" }, d.label && h("span", { style: "color:var(--primary);font-weight:700;", text: d.label }), h("h2", { text: d.title }));
      list(d.paragraphs).forEach(function (p) { c.append(h("p", { text: p })); });
      c.append(pts, btn(d.button_label, d.button_url));
      return h("section", { "class": "section", id: s.id }, h("div", { "class": "container about-grid" },
        h("div", { "class": "about-visual" }, d.image ? h("img", { src: d.image, alt: d.title || "", style: "max-width:100%;border-radius:16px" }) : h("div", { "class": "about-symbol", text: (d.title || "A").charAt(0) })), c));
    },
    features: function (s) {
      return wrap(s, "section-light", grid("features-grid", s.data.items, function (i) {
        return h("article", { "class": "feature-card" }, h("div", { "class": "feature-icon", text: i.icon }), h("h3", { text: i.title }), h("p", { text: i.description }));
      }));
    },
    stats: function (s) {
      return wrap(s, "stats-section", grid("numbers-grid", s.data.items, function (i) {
        return h("div", { "class": "number-card" }, h("h3", { text: i.value }), h("p", { text: i.label }));
      }));
    },
    pricing: function (s) {
      var d = s.data, g = h("div", { "class": "pricing-grid" }), note = d.note && h("p", { "class": "price-note", text: d.note });
      function card(i) {
        var ul = h("ul", { "class": "price-list" });
        list(i.features).forEach(function (f) {
          var k = String(f).indexOf(": "), li = h("li", {});
          if (k > 0) li.append(f.slice(0, k) + " ", h("strong", { text: f.slice(k + 2) })); else li.textContent = f;
          ul.append(li);
        });
        return h("article", { "class": "price-card" + (i.popular ? " popular" : "") }, i.popular && h("span", { "class": "popular-tag", text: "জনপ্রিয়" }),
          h("h3", { text: i.name }), h("p", { "class": "price-limit", text: i.limit }),
          h("div", { "class": "price" }, i.price + " ", h("small", { text: i.period })), ul, btn(i.button_label, i.button_url, i.popular ? "primary" : "outline"));
      }
      function manual() { g.replaceChildren(); list(d.items).forEach(function (i) { g.append(card(i)); }); }

      if (d.source === "manual") { manual(); return wrap(s, "", h("div", {}, g, note)); }

      /* default: registration packages (software_packages) — always the live prices */
      g.classList.add("packages");
      g.append(h("p", { "class": "price-note", text: "প্যাকেজ লোড হচ্ছে..." }));
      fetch(BASE + "/api/website-management/packages", { headers: { Accept: "application/json" } })
        .then(function (r) { if (!r.ok) throw new Error("packages " + r.status); return r.json(); })
        .then(function (j) {
          var pk = list(j && j.packages);
          if (!pk.length) throw new Error("no packages");
          var pop = String(d.popular_code || "").trim().toUpperCase();
          g.replaceChildren();
          pk.forEach(function (p) {
            g.append(card({
              name: p.package_code, limit: bn(p.customer_limit) + " গ্রাহক পর্যন্ত",
              price: "৳ " + bn(p.monthly_fee), period: "/ মাস", popular: !!pop && String(p.package_code).toUpperCase() === pop,
              features: ["রেজিস্ট্রেশন ফি: ৳ " + bn(p.signup_fee), "মাসিক ফি: ৳ " + bn(p.monthly_fee)],
              button_label: d.button_label || "শুরু করুন", button_url: d.button_url || "#contact"
            }));
          });
        })
        .catch(function (e) {
          console.error("[Website]", e);
          if (list(d.items).length) { g.classList.remove("packages"); manual(); }
          else g.replaceChildren(h("p", { "class": "price-note", text: "মূল্য তালিকা এখন দেখানো যাচ্ছে না।" }));
        });
      return wrap(s, "", h("div", {}, g, note));
    },
    team: function (s) {
      return wrap(s, "section-light", grid("team-grid", s.data.items, function (i) {
        return h("article", { "class": "team-card" }, i.image ? h("img", { src: i.image, alt: i.name || "", "class": "team-avatar", style: "object-fit:cover" }) : h("div", { "class": "team-avatar", text: i.avatar || (i.name || "?").charAt(0) }),
          h("h3", { text: i.name }), h("span", { "class": "team-role", text: i.role }), h("p", { text: i.description }), btn("যোগাযোগ", "#contact", "outline"));
      }));
    },
    gallery: function (s) {
      return wrap(s, "", grid("gallery-grid", s.data.items, function (i) {
        return h("div", { "class": "gallery-item" }, h("img", { src: i.image, alt: i.alt || "", loading: "lazy" }));
      }));
    },
    contact: function (s) {
      var d = s.data, info = h("div", { "class": "contact-info" }, h("h3", { text: "যোগাযোগের তথ্য" }));
      [["ইমেইল", d.email, "mailto:"], ["ফোন", d.phone, "tel:"], ["WhatsApp", d.whatsapp, ""], ["অফিস", d.address, ""]].forEach(function (r) {
        if (!r[1]) return;
        info.append(h("div", { "class": "contact-item" }, h("small", { text: r[0] }), h("p", {}, r[2] ? h("a", { href: r[2] + r[1], text: r[1] }) : r[1])));
      });
      return wrap(s, "section-light", h("div", { "class": "contact-grid" }, info));
    },
    apps: function (s) {
      return wrap(s, "", grid("apps-grid", s.data.items, function (i) {
        var card = h("article", { "class": "app-card" }, h("div", { "class": "app-icon", text: i.icon }), h("h3", { text: i.name }), h("p", { text: i.description }));
        if (i.release !== "admin" && i.release !== "customer") { card.append(btn(i.button_label || "ডাউনলোড", i.url)); return card; }

        /* linked to the real APK release (Super Admin → APK management) */
        var meta = h("p", { "class": "app-meta", text: "..." }), slot = h("div", {});
        card.append(meta, slot);
        appsInfo().then(function (apps) {
          var rel = apps[i.release];
          if (!rel) {
            meta.textContent = "শীঘ্রই আসছে";
            slot.append(h("span", { "class": "btn btn-outline", "aria-disabled": "true", style: "opacity:.55;pointer-events:none", text: i.button_label || "ডাউনলোড" }));
            return;
          }
          var when = rel.published_at ? new Date(rel.published_at).toLocaleDateString("bn-BD", { day: "numeric", month: "long", year: "numeric" }) : "";
          meta.textContent = "সংস্করণ v" + rel.version_name + " · " + rel.file_size_label + (when ? " · " + when : "");
          slot.append(btn(i.button_label || "ডাউনলোড", rel.latest_download_url));
        });
        return card;
      }));
    },
    faq: function (s) {
      var l = h("div", { "class": "faq-list" });
      list(s.data.items).forEach(function (i) { l.append(h("details", { "class": "faq-item" }, h("summary", { text: i.question }), h("p", { text: i.answer }))); });
      return wrap(s, "", l);
    },
    testimonials: function (s) {
      return wrap(s, "section-light", grid("testi-grid", s.data.items, function (i) {
        return h("article", { "class": "testi-card" }, h("p", { text: "“" + (i.quote || "") + "”" }), h("strong", { text: i.name }), h("span", { text: i.role }));
      }));
    },
    cta: function (s) {
      var d = s.data;
      return h("section", { "class": "section cta-band", id: s.id }, h("div", { "class": "container" }, h("h2", { text: d.title }), d.text && h("p", { text: d.text }), btn(d.button_label, d.button_url)));
    },
    custom: function (s) {
      var d = s.data, c = h("div", { "class": "about-content" }, h("h2", { text: d.title }));
      String(d.body || "").split(/\n+/).forEach(function (p) { if (p.trim()) c.append(h("p", { text: p })); });
      c.append(btn(d.button_label, d.button_url));
      return h("section", { "class": "section", id: s.id }, h("div", { "class": "container" }, d.image && h("img", { src: d.image, alt: d.title || "", style: "max-width:100%;border-radius:16px;margin-bottom:20px" }), c));
    }
  };


  /* ---------- Open-site access: APK download (no login) + Customer / Admin credentials ---------- */
  function field(id, type, ph, ac, icon) {
    return h("div", { "class": "auth-field" }, h("span", { "class": "auth-ico", text: icon }),
      h("input", { id: id, type: type, placeholder: ph, autocomplete: ac, required: "required" }));
  }
  function authCard(title, sub, form, extra) {
    return h("div", { "class": "auth-card" }, h("h3", { text: title }), h("p", { "class": "auth-sub", text: sub }), form, extra);
  }
  function showErr(box, m) { box.textContent = m; box.style.display = "block"; }
  function busy(b, on) { b.disabled = on; b.textContent = on ? "অপেক্ষা করুন..." : "লগইন"; }
  function post(url, body, json) {
    return fetch(url, { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": json ? "application/json" : "application/x-www-form-urlencoded;charset=UTF-8" },
      body: json ? JSON.stringify(body) : body })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); });
  }

  function loginSection() {
    /* Customer */
    var cErr = h("div", { "class": "auth-error" }), cBtn = h("button", { type: "submit", "class": "btn btn-primary", text: "লগইন" });
    var cForm = h("form", { autocomplete: "on" }, cErr, field("cust_id", "text", "গ্রাহক আইডি / মোবাইল", "username", "👤"), field("cust_pass", "password", "পাসওয়ার্ড", "current-password", "🔒"), cBtn);
    var cOk = h("div", { "class": "auth-ok" });
    cForm.onsubmit = function (e) {
      e.preventDefault(); cErr.style.display = "none";
      var id = cForm.querySelector("#cust_id").value.trim(), pw = cForm.querySelector("#cust_pass").value;
      if (!id || !pw) return showErr(cErr, "ইউজার আইডি ও পাসওয়ার্ড দিন।");
      busy(cBtn, true);
      post("/api/mobile/customer/login", { customer_id: id, password: pw, device_name: "web" }, true).then(function (x) {
        if (x.ok && x.d && x.d.success) {
          if (x.d.refresh_token) post("/api/mobile/customer/logout", { refresh_token: x.d.refresh_token }, true).catch(function () {});
          cForm.style.display = "none";
          cOk.textContent = "✔ " + (x.d.user && x.d.user.name ? "স্বাগতম, " + x.d.user.name + "। " : "") + "আপনার একাউন্ট যাচাই হয়েছে। বিল ও প্যাকেজ দেখতে কাস্টমার অ্যাপে এই আইডি ও পাসওয়ার্ড দিয়ে লগইন করুন।";
          cOk.style.display = "block"; return;
        }
        showErr(cErr, (x.d && x.d.message) || "তথ্য সঠিক নয়।"); busy(cBtn, false);
      }).catch(function () { showErr(cErr, "লগইন করা যায়নি। আবার চেষ্টা করুন।"); busy(cBtn, false); });
    };

    /* Admin: same flow as the existing /login page */
    var aErr = h("div", { "class": "auth-error" }), aBtn = h("button", { type: "submit", "class": "btn btn-primary", text: "লগইন" });
    var rem = h("input", { type: "checkbox", id: "adm_remember" });
    var aForm = h("form", { method: "POST", autocomplete: "on" }, aErr, field("adm_user", "text", "ইউজারনেম", "username", "👤"), field("adm_pass", "password", "পাসওয়ার্ড", "current-password", "🔒"),
      h("div", { "class": "auth-row" }, h("label", {}, rem, " মনে রাখুন"), h("a", { href: "/forgot", text: "পাসওয়ার্ড ভুলে গেছেন?" })), aBtn);
    var csrf = "";
    function loadCsrf() { return fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) { if (d && d.success && d.csrf_token) csrf = d.csrf_token; }).catch(function () {}); }
    loadCsrf();
    fetch("/api/auth/remembered", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json(); })
      .then(function (d) { var u = aForm.querySelector("#adm_user"); if (d && d.success && d.username && u && !u.value) u.value = d.username; }).catch(function () {});
    aForm.onsubmit = function (e) {
      e.preventDefault(); aErr.style.display = "none";
      var u = aForm.querySelector("#adm_user").value.trim(), pw = aForm.querySelector("#adm_pass").value;
      if (!u || !pw) return showErr(aErr, "ইউজারনেম ও পাসওয়ার্ড দিন।");
      busy(aBtn, true);
      (csrf ? Promise.resolve() : loadCsrf()).then(function () {
        var b = new URLSearchParams(); b.append("csrf_token", csrf); b.append("username", u); b.append("password", pw); b.append("login", "1");
        if (rem.checked) b.append("remember", "1");
        return post("/api/auth/login", b.toString(), false);
      }).then(function (x) {
        if (x.d && x.d.csrf_token) csrf = x.d.csrf_token;
        if (x.ok && x.d && x.d.success) { window.location.href = x.d.redirect || "/dashboard"; return; }
        showErr(aErr, (x.d && x.d.message) || "ইউজারনেম বা পাসওয়ার্ড সঠিক নয়।");
        busy(aBtn, false); if (x.d && x.d.locked) aBtn.disabled = true;
      }).catch(function () { showErr(aErr, "লগইন করা যায়নি। আবার চেষ্টা করুন।"); busy(aBtn, false); });
    };

    var reg = h("p", { "class": "auth-foot" }, "একাউন্ট নেই? ", h("a", { href: "/register", text: "রেজিস্ট্রেশন করুন" }));
    return h("section", { "class": "section section-light", id: "login" }, h("div", { "class": "container" },
      heading({ label: "লগইন", title: "আপনার একাউন্টে প্রবেশ করুন" }),
      h("div", { "class": "auth-grid" },
        authCard("কাস্টমার লগইন", "গ্রাহক আইডি / মোবাইল ও পাসওয়ার্ড", cForm, cOk),
        authCard("অ্যাডমিন লগইন", "ইউজারনেম ও পাসওয়ার্ড", aForm, reg))));
  }

  /* if the CMS has no APK cards, still show the two APK downloads (public, no login) */
  function downloadFallback() {
    return R.apps({ id: "download", data: { label: "ডাউনলোড", title: "অ্যাপ ডাউনলোড", subtitle: "কোনো লগইন ছাড়াই সরাসরি APK ডাউনলোড করুন", items: [
      { icon: "📱", name: "Amader Bill Admin", description: "ISP অ্যাডমিন অ্যাপ", release: "admin", button_label: "ডাউনলোড" },
      { icon: "👤", name: "Amader Bill Customer", description: "গ্রাহক অ্যাপ", release: "customer", button_label: "ডাউনলোড" }] } });
  }

  function render(c) {
    var site = c.site || {}, secs = list(c.sections).filter(function (s) { return s && s.enabled !== false && R[s.type]; });
    document.title = (site.name || "") + (site.tagline ? " - " + site.tagline : "");
    var md = document.querySelector('meta[name="description"]'); if (md && site.description) md.content = site.description;
    if (site.favicon) { var ic = document.querySelector('link[rel="icon"]') || document.head.appendChild(h("link", { rel: "icon" })); ic.href = safeUrl(site.favicon); }

    var logo = h("a", { href: "#home", "class": "logo" }, site.logo ? h("img", { src: site.logo, alt: site.name || "", style: "max-height:42px;max-width:180px;object-fit:contain" }) : h("span", { "class": "logo-icon", text: (site.name || "A").charAt(0) }), site.logo ? null : " " + (site.name || ""));
    var nav = h("ul", { "class": "nav-links", id: "navLinks" });
    /* Open site: no login button/links in the header (credentials are on the page itself) */
    secs.filter(function (s) { return s.nav_label; }).forEach(function (s) { nav.append(h("li", {}, h("a", { href: "#" + s.id, text: s.nav_label }))); });
    var toggle = h("button", { "class": "menu-toggle", "aria-label": "Menu", text: "☰" });
    toggle.onclick = function () { nav.classList.toggle("active"); };
    nav.onclick = function () { nav.classList.remove("active"); };
    var header = h("header", { "class": "header" }, h("div", { "class": "container navbar" }, logo, nav,
      h("div", { "class": "nav-actions" }, toggle)));

    var main = h("main", {}), contactAt = null;
    secs.forEach(function (s) { var el = R[s.type](s); if (s.type === "contact" && !contactAt) contactAt = el; main.append(el); });
    var hasApk = secs.some(function (s) { return s.type === "apps" && list(s.data && s.data.items).some(function (i) { return i.release === "admin" || i.release === "customer"; }); });
    var extra = []; if (!hasApk) extra.push(downloadFallback()); extra.push(loginSection());
    extra.forEach(function (el) { if (contactAt) main.insertBefore(el, contactAt); else main.append(el); });

    var f = c.footer || {}, contact = (secs.find(function (s) { return s.type === "contact"; }) || {}).data || {};
    var quick = h("ul", { "class": "footer-links" });
    secs.filter(function (s) { return s.nav_label; }).forEach(function (s) { quick.append(h("li", {}, h("a", { href: "#" + s.id, text: s.nav_label }))); });
    var imp = h("ul", { "class": "footer-links" });
    list(f.links).forEach(function (l) { imp.append(h("li", {}, h("a", { href: l.url, text: l.label }))); });
    var cl = h("ul", { "class": "footer-links" });
    if (contact.email) cl.append(h("li", {}, h("a", { href: "mailto:" + contact.email, text: contact.email })));
    if (contact.phone) cl.append(h("li", { text: "ফোন: " + contact.phone }));
    if (contact.whatsapp) cl.append(h("li", { text: "WhatsApp: " + contact.whatsapp }));
    var footer = h("footer", { "class": "footer" }, h("div", { "class": "container" },
      h("div", { "class": "footer-grid" }, h("div", {}, h("h3", { text: site.name }), h("p", { text: f.description })),
        h("div", {}, h("h3", { text: "দ্রুত লিংক" }), quick), h("div", {}, h("h3", { text: "গুরুত্বপূর্ণ" }), imp), h("div", {}, h("h3", { text: "যোগাযোগ" }), cl)),
      h("div", { "class": "footer-bottom" }, h("p", { text: f.copyright }))));

    document.getElementById("app").replaceChildren(header, main, footer);
    if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
  }

  fetch(API, { headers: { Accept: "application/json" }, cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("API " + r.status); return r.json(); })
    .then(function (r) { if (!r.success || !r.content || !r.content.sections) throw new Error("Bad content"); render(r.content); })
    .catch(function (e) { console.error("[Website]", e); document.getElementById("app").textContent = "Website is temporarily unavailable."; });
})();
