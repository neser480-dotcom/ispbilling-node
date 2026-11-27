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
      var preview = h("div", { "class": "product-preview", "aria-label": "AmaderBill ড্যাশবোর্ড প্রিভিউ" },
        h("div", { "class": "preview-window" },
          h("div", { "class": "preview-bar" }, h("div", { "class": "preview-brand" }, h("span", { "class": "preview-brand-mark", text: "A" }), h("strong", { text: "AmaderBill" })), h("span", { "class": "preview-live" }, h("i", {}), "লাইভ ড্যাশবোর্ড")),
          h("div", { "class": "preview-body" },
            h("aside", { "class": "preview-sidebar" }, h("span", { "class": "preview-side-logo", text: "AB" }), h("i", {}), h("i", {}), h("i", {}), h("i", {}), h("i", {})),
            h("div", { "class": "preview-main" }, h("div", { "class": "preview-welcome" }, h("div", {}, h("small", { text: "স্বাগতম" }), h("strong", { text: "আপনার ISP ব্যবসা, এখন আরও সহজ" })), h("span", { text: "● Online" })),
              h("div", { "class": "preview-stats" }, h("div", {}, h("small", { text: "মোট গ্রাহক" }), h("strong", { text: "১,২৫০" }), h("span", { text: "↗ ১২.৮%" })), h("div", {}, h("small", { text: "অনলাইন" }), h("strong", { text: "১,০৮৬" }), h("span", { text: "● Live" })), h("div", {}, h("small", { text: "মাসিক আয়" }), h("strong", { text: "৳ ২.৪৫ লাখ" }), h("span", { text: "↗ ৮.৪%" }))),
              h("div", { "class": "preview-chart" }, h("div", { "class": "preview-chart-head" }, h("strong", { text: "আয়ের সারসংক্ষেপ" }), h("small", { text: "শেষ ৭ দিন" })), h("div", { "class": "preview-chart-bars" }, ...[34,55,43,72,52,88,66].map(function(v){return h("i",{style:"--bar:"+v+"%"});})))))),
        h("div", { "class": "preview-phone" }, h("div", { "class": "phone-speaker" }), h("div", { "class": "phone-screen" }, h("span", { "class": "phone-mark", text: "A" }), h("small", { text: "AmaderBill" }), h("strong", { text: "হ্যালো! 👋" }), h("p", { text: "আপনার বিল ও সংযোগ এক জায়গায়" }), h("div", { "class": "phone-bill" }, h("small", { text: "চলতি মাসের বিল" }), h("strong", { text: "৳ ৫০০" }), h("span", { text: "পরিশোধ করুন →" })), h("div", { "class": "phone-status" }, h("i", {}), "সংযোগ সচল"))));
      var visual = h("div", { "class": "hero-visual" }, d.image
        ? h("img", { src: d.image, alt: d.title || "", style: "max-width:100%;border-radius:22px" })
        : preview);
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

  function render(c) {
    var site = c.site || {}, secs = list(c.sections).filter(function (s) { return s && s.enabled !== false && R[s.type]; });
    document.title = (site.name || "") + (site.tagline ? " - " + site.tagline : "");
    var md = document.querySelector('meta[name="description"]'); if (md && site.description) md.content = site.description;
    if (site.favicon) { var ic = document.querySelector('link[rel="icon"]') || document.head.appendChild(h("link", { rel: "icon" })); ic.href = safeUrl(site.favicon); }

    var logo = h("a", { href: "#home", "class": "logo" }, site.logo ? h("img", { src: site.logo, alt: site.name || "", style: "max-height:42px;max-width:180px;object-fit:contain" }) : h("span", { "class": "logo-icon", text: (site.name || "A").charAt(0) }), site.logo ? null : " " + (site.name || ""));
    var nav = h("ul", { "class": "nav-links", id: "navLinks" });
    /* Customer / Admin login links take the place of "Home" in the header */
    var logins = list(site.login_links).filter(function (l) { return l && l.label && l.url; });
    logins.forEach(function (l) { nav.append(h("li", {}, h("a", { href: l.url, "class": "nav-login", text: l.label }))); });
    secs.filter(function (s) { return s.nav_label && !(logins.length && s.type === "hero"); }).forEach(function (s) { nav.append(h("li", {}, h("a", { href: "#" + s.id, text: s.nav_label }))); });
    var toggle = h("button", { "class": "menu-toggle", "type": "button", "aria-label": "মেনু খুলুন", "aria-expanded": "false", text: "☰" });
    toggle.onclick = function () {
      var open = nav.classList.toggle("active");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "মেনু বন্ধ করুন" : "মেনু খুলুন");
      toggle.textContent = open ? "×" : "☰";
    };
    nav.onclick = function () { nav.classList.remove("active"); toggle.setAttribute("aria-expanded", "false"); toggle.textContent = "☰"; };
    var theme = h("button", { "class": "theme-toggle", "type": "button", "aria-label": "ডার্ক মোড চালু করুন", title: "থিম পরিবর্তন", text: "☾" });
    var savedTheme = "";
    try { savedTheme = localStorage.getItem("amaderbill_public_theme") || ""; } catch (_) {}
    var preferredDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    function setTheme(mode) {
      var dark = mode === "dark";
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
      theme.textContent = dark ? "☀" : "☾";
      theme.setAttribute("aria-label", dark ? "লাইট মোড চালু করুন" : "ডার্ক মোড চালু করুন");
      try { localStorage.setItem("amaderbill_public_theme", dark ? "dark" : "light"); } catch (_) {}
    }
    setTheme(savedTheme || (preferredDark ? "dark" : "light"));
    theme.onclick = function () { setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); };
    var header = h("header", { "class": "header" }, h("div", { "class": "container navbar" }, logo, nav,
      h("div", { "class": "nav-actions" }, logins.length ? null : btn(site.login_label || "লগইন", site.login_url || "https://app.amaderbill.com"), theme, toggle)));

    var main = h("main", {}); secs.forEach(function (s) { main.append(R[s.type](s)); });

    var f = c.footer || {}, contact = (secs.find(function (s) { return s.type === "contact"; }) || {}).data || {};
    var quick = h("ul", { "class": "footer-links" });
    secs.filter(function (s) { return s.nav_label; }).forEach(function (s) { quick.append(h("li", {}, h("a", { href: "#" + s.id, text: s.nav_label }))); });
    var imp = h("ul", { "class": "footer-links" });
    list(f.links).forEach(function (l) { imp.append(h("li", {}, h("a", { href: l.url, text: l.label }))); });
    var cl = h("ul", { "class": "footer-links" });
    if (contact.email) cl.append(h("li", {}, h("a", { href: "mailto:" + contact.email, text: contact.email })));
    cl.append(h("li", {}, h("a", { href: "tel:01627078607", text: "01627078607" })));
    cl.append(h("li", {}, h("a", { href: "tel:01936516717", text: "01936516717" })));
    cl.append(h("li", {}, h("a", { href: "https://wa.me/8801627078607", target: "_blank", rel: "noopener noreferrer", text: "WhatsApp: " + (contact.whatsapp || "01627078607") })));
    cl.append(h("li", {}, h("a", { href: "https://www.facebook.com/share/1DzwL8xumG/", target: "_blank", rel: "noopener noreferrer", text: "Facebook পেজ" })));
    var footer = h("footer", { "class": "footer" }, h("div", { "class": "container" },
      h("div", { "class": "footer-grid" }, h("div", {}, h("h3", { text: site.name }), h("p", { text: f.description })),
        h("div", {}, h("h3", { text: "দ্রুত লিংক" }), quick), h("div", {}, h("h3", { text: "গুরুত্বপূর্ণ" }), imp), h("div", {}, h("h3", { text: "যোগাযোগ" }), cl)),
      h("div", { "class": "footer-bottom" }, h("p", { text: "© IRFAN IT - 2026" }), h("div", { "class": "footer-social" }, h("a", { href: "https://www.facebook.com/share/1DzwL8xumG/", target: "_blank", rel: "noopener noreferrer", "aria-label": "Facebook", text: "f" }), h("a", { href: "https://wa.me/8801627078607", target: "_blank", rel: "noopener noreferrer", "aria-label": "WhatsApp", text: "◉" })) )));

    document.getElementById("app").replaceChildren(header, main, footer);

// Three selectable visual designs; CMS sections and live data are rendered once and preserved.
var preview = h("div", { "class": "design-preview-bar" },
  h("div", { "class": "design-preview-note", text: "অটো-রোটেশন চালু · প্রতিদিন ডিজাইন পরিবর্তন হবে · " }),
  h("div", { "class": "design-preview-actions" },
    [1,2,3].map(function(n){
      var b = h("button", { type: "button", text: ["Classic Light","Royal Blue","Orange Accent"][n-1] });
      b.onclick = function(){ applyDesign(n, true); };
      b.setAttribute("data-design-button", String(n));
      return b;
    })
  )
);
var topbar = h("div", { "class": "public-topbar" },
  h("div", { "class": "container public-topbar-inner" },
    h("div", { "class": "public-topbar-contact" },
      h("a", { href: "tel:01627078607", text: "☎ 01627078607" }),
      h("a", { href: "tel:01936516717", text: "☎ 01936516717" }),
      contact.email && h("a", { href: "mailto:" + contact.email, text: contact.email })
    ),
    h("div", { "class": "public-topbar-social" },
      h("a", { href: "https://wa.me/8801627078607", target: "_blank", rel: "noopener noreferrer", text: "WhatsApp" }),
      h("a", { href: "https://www.facebook.com/share/1DzwL8xumG/", target: "_blank", rel: "noopener noreferrer", text: "Facebook" })
    )
  )
);
document.getElementById("app").prepend(topbar, preview);
function applyDesign(n, manual) {
  n = Math.max(1, Math.min(3, Number(n) || 1));
  document.body.setAttribute("data-design", String(n));
  preview.querySelectorAll("button").forEach(function(b){
    var active = b.getAttribute("data-design-button") === String(n);
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });
  var note = preview.querySelector(".design-preview-note");
  note.textContent = "অটো-রোটেশন চালু · প্রতিদিন ডিজাইন পরিবর্তন হবে · সক্রিয়: ডিজাইন " + n;
  if (manual) {
    try { sessionStorage.setItem("amaderbill_design_override", String(n)); } catch (_) {}
  }
}
var dailyDesign = (Math.floor(Date.now() / 86400000) % 3) + 1;
var chosenDesign = dailyDesign;
try {
  var override = Number(sessionStorage.getItem("amaderbill_design_override"));
  if (override >= 1 && override <= 3) chosenDesign = override;
} catch (_) {}
applyDesign(chosenDesign, false);

    /* Reveal content as it enters the viewport; gracefully falls back without IntersectionObserver. */
    var revealTargets = Array.prototype.slice.call(document.querySelectorAll(
      "main > .section, main > .hero, .feature-card, .price-card, .team-card, .app-card, .testi-card, .faq-item, .gallery-item"
    ));
    if ("IntersectionObserver" in window && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -35px 0px" });
      revealTargets.forEach(function (el) { el.classList.add("reveal"); observer.observe(el); });
    } else {
      revealTargets.forEach(function (el) { el.classList.add("is-visible"); });
    }

    /* CMS-managed active promotions appear automatically below the navigation. */
    fetch(BASE + "/api/app-download/promotions", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (r) {
        var promos = list(r && r.success && r.promotions);
        if (!promos.length) return;
        var p = promos[0];
        var inner = h("div", { "class": "promo-inner" });
        if (p.banner_url) inner.append(h("img", { src: p.banner_url, alt: p.title || "প্রমোশন", loading: "lazy" }));
        inner.append(h("div", { "class": "promo-copy" }, h("strong", { text: p.title }), p.message && h("p", { text: p.message })));
        if (p.button_text && p.button_link) inner.append(btn(p.button_text, p.button_link));
        var strip = h("aside", { "class": "promo-strip", "aria-label": "বিশেষ অফার" }, inner);
        header.after(strip);
      })
      .catch(function (e) { console.warn("[Website] Promotion unavailable:", e); });

    var scrollHeader = function () { header.classList.toggle("is-scrolled", window.scrollY > 12); };
    window.addEventListener("scroll", scrollHeader, { passive: true });
    scrollHeader();
    if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
  }

  fetch(API, { headers: { Accept: "application/json" }, cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("API " + r.status); return r.json(); })
    .then(function (r) { if (!r.success || !r.content || !r.content.sections) throw new Error("Bad content"); render(r.content); })
    .catch(function (e) { console.error("[Website]", e); document.getElementById("app").textContent = "Website is temporarily unavailable."; });
})();
