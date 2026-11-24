"use strict";
/* Public website renderer: builds the whole page from CMS JSON. All text is set via textContent (XSS-safe). */
(function () {
  var API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? "/api/website-management/content"
    : "https://app.amaderbill.com/api/website-management/content";

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
      var d = s.data;
      return wrap(s, "", h("div", {}, grid("pricing-grid", d.items, function (i) {
        var ul = h("ul", { "class": "price-list" });
        list(i.features).forEach(function (f) {
          var k = String(f).indexOf(": "), li = h("li", {});
          if (k > 0) li.append(f.slice(0, k) + " ", h("strong", { text: f.slice(k + 2) })); else li.textContent = f;
          ul.append(li);
        });
        return h("article", { "class": "price-card" + (i.popular ? " popular" : "") }, i.popular && h("span", { "class": "popular-tag", text: "জনপ্রিয়" }),
          h("h3", { text: i.name }), h("p", { "class": "price-limit", text: i.limit }),
          h("div", { "class": "price" }, i.price + " ", h("small", { text: i.period })), ul, btn(i.button_label, i.button_url, i.popular ? "primary" : "outline"));
      }), d.note && h("p", { "class": "price-note", text: d.note })));
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
        return h("article", { "class": "app-card" }, h("div", { "class": "app-icon", text: i.icon }), h("h3", { text: i.name }), h("p", { text: i.description }), btn(i.button_label || "ডাউনলোড", i.url));
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

  function render(c) {
    var site = c.site || {}, secs = list(c.sections).filter(function (s) { return s && s.enabled !== false && R[s.type]; });
    document.title = (site.name || "") + (site.tagline ? " - " + site.tagline : "");
    var md = document.querySelector('meta[name="description"]'); if (md && site.description) md.content = site.description;
    if (site.favicon) { var ic = document.querySelector('link[rel="icon"]') || document.head.appendChild(h("link", { rel: "icon" })); ic.href = safeUrl(site.favicon); }

    var logo = h("a", { href: "#home", "class": "logo" }, site.logo ? h("img", { src: site.logo, alt: site.name || "", style: "max-height:42px;max-width:180px;object-fit:contain" }) : h("span", { "class": "logo-icon", text: (site.name || "A").charAt(0) }), site.logo ? null : " " + (site.name || ""));
    var nav = h("ul", { "class": "nav-links", id: "navLinks" });
    secs.filter(function (s) { return s.nav_label; }).forEach(function (s) { nav.append(h("li", {}, h("a", { href: "#" + s.id, text: s.nav_label }))); });
    var toggle = h("button", { "class": "menu-toggle", "aria-label": "Menu", text: "☰" });
    toggle.onclick = function () { nav.classList.toggle("active"); };
    nav.onclick = function () { nav.classList.remove("active"); };
    var header = h("header", { "class": "header" }, h("div", { "class": "container navbar" }, logo, nav,
      h("div", { "class": "nav-actions" }, btn(site.login_label || "লগইন", site.login_url || "#"), toggle)));

    var main = h("main", {}); secs.forEach(function (s) { main.append(R[s.type](s)); });

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
