"use strict";
/* AmaderBill public site — CMS-driven content with the approved reference layout. */
(function () {
  var BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "" : "https://app.amaderbill.com";
  var API = BASE + "/api/website-management/content";
  var list = function (v) { return Array.isArray(v) ? v : []; };
  var bn = function (v) { return Number(v || 0).toLocaleString("bn-BD"); };
  var safeUrl = function (u) { u = String(u || "").trim(); return /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(u) ? u : "#"; };
  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === undefined || value === null || value === "") return;
      if (key === "text") el.textContent = value;
      else if (key === "href" || key === "src") el.setAttribute(key, safeUrl(value));
      else el.setAttribute(key, value);
    });
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) el.append(arguments[i]);
    return el;
  }
  function btn(label, url, kind) {
    return label ? h("a", { href: url, "class": "btn btn-" + (kind === "outline" ? "outline" : "primary"), text: label }) : null;
  }
  var appsPromise;
  var activeSite = {};
  function loginUrl(kind, fallback) {
    var pattern = kind === "customer" ? /customer|কাস্টমার/i : /admin|অ্যাডমিন/i;
    var item = list(activeSite.login_links).find(function (x) { return x && pattern.test(x.label || ""); });
    return item && item.url || fallback;
  }
  function appsInfo() {
    if (!appsPromise) appsPromise = fetch(BASE + "/api/app-download", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.success && j.apps || {}; }).catch(function () { return {}; });
    return appsPromise;
  }
  function sectionHeading(d) {
    if (!d || (!d.title && !d.label && !d.subtitle)) return null;
    var title = d.title === "Why Choose AmaderBill?"
      ? h("h2", {}, "Why Choose ", h("strong", { text: "AmaderBill?" }))
      : d.title && h("h2", { text: d.title });
    return h("div", { "class": "section-heading" },
      d.label && h("span", { text: d.label }), title,
      d.subtitle && h("p", { text: d.subtitle }));
  }
  function wrap(s, cls, inner) {
    var box = h("section", { "class": "section " + (cls || ""), id: s.id });
    var container = h("div", { "class": "container" });
    var head = sectionHeading(s.data || {});
    if (head) container.append(head);
    if (inner) container.append(inner);
    box.append(container);
    return box;
  }
  function grid(cls, items, renderItem) {
    var el = h("div", { "class": cls });
    list(items).forEach(function (item) { el.append(renderItem(item)); });
    return el;
  }
  function illustrationRouterPhone() {
    return h("div", { "class": "hero-art", "aria-label": "Wi-Fi router and AmaderBill mobile app illustration" },
      h("div", { "class": "hero-map" }),
      h("div", { "class": "wifi-signal" }, h("i", {}), h("i", {}), h("i", {})),
      h("div", { "class": "router-device" }, h("span", { "class": "router-antenna left" }), h("span", { "class": "router-antenna right" }), h("span", { "class": "router-light" }), h("span", { "class": "router-brand", text: "AmaderBill" })),
      h("div", { "class": "secure-badge" }, h("strong", { text: "✓" }), h("span", { text: "Fast" }), h("span", { text: "Reliable" }), h("span", { text: "Secure" })),
      h("div", { "class": "hero-phone" }, h("div", { "class": "hero-phone-notch" }),
        h("div", { "class": "hero-phone-screen" }, h("span", { "class": "phone-logo-mark", text: "A" }), h("strong", { text: "AmaderBill" }),
          h("small", { text: "Smart ISP Billing Solution" }), h("span", { "class": "phone-login", text: "Login" }), h("span", { "class": "phone-register", text: "Register" }), h("div", { "class": "phone-wave" }))));
  }
  var R = {
    hero: function (s) {
      var d = s.data || {}, title = h("h1", {});
      title.append(d.title || "Amader");
      title.append(h("strong", { text: d.highlight || "Bill" }));
      var points = list(d.points);
      if (!points.length) points = ["Easy Customer Management", "Automated Billing & Recharge", "Powerful Reports & Analytics"];
      var checks = h("ul", { "class": "hero-checks" });
      points.slice(0, 3).forEach(function (p) { checks.append(h("li", {}, h("span", { text: "✓" }), p)); });
      var buttons = h("div", { "class": "hero-buttons" });
      buttons.append(btn("ডাউনলোড করুন", loginUrl("customer", "https://app.amaderbill.com/customer/login"), "primary"));
      buttons.append(btn("ডেমো দেখুন", activeSite.register_url || "https://app.amaderbill.com/register", "outline"));
      return h("section", { "class": "hero", id: s.id },
        h("div", { "class": "container hero-grid" },
          h("div", { "class": "hero-copy" },
            d.label && h("span", { "class": "hero-label", text: d.label }),
            title,
            h("h2", { "class": "hero-subtitle", text: d.subtitle || "Smart ISP Billing Solution" }),
            h("p", { "class": "hero-description", text: d.description || "Manage your Customers, Billing and Network with ease and efficiency." }),
            checks, buttons),
          illustrationRouterPhone()));
    },
    features: function (s) {
      return wrap(s, "feature-strip-section", grid("features-grid", s.data && s.data.items, function (i) {
        return h("article", { "class": "feature-card" }, h("div", { "class": "feature-icon", text: i.icon || "✓" }),
          h("h3", { text: i.title }), i.description && h("p", { text: i.description }));
      }));
    },
    apps: function (s) {
      var d = s.data || {};
      var downloadHeading = h("h2", {});
      var downloadLabel = d.label || "Download AmaderBill App";
      var brandAt = downloadLabel.indexOf("AmaderBill");
      if (brandAt >= 0) downloadHeading.append(downloadLabel.slice(0, brandAt), h("strong", { text: downloadLabel.slice(brandAt) }));
      else downloadHeading.textContent = downloadLabel;
      var panel = h("section", { "class": "section download-panel-section", id: s.id },
        h("div", { "class": "download-panel" },
          h("div", { "class": "download-copy" },
            downloadHeading,
            h("p", { text: d.subtitle || "Get the best ISP billing experience on your mobile." }),
            h("div", { "class": "apk-badges" }, h("a", { href: "#", "class": "apk-badge", "data-release": "admin" }, h("span", { "class": "apk-symbol", text: "▶" }), h("span", {}, h("small", { text: "DOWNLOAD ADMIN" }), h("strong", { text: "Android App" }))),
              h("a", { href: "#", "class": "apk-badge", "data-release": "customer" }, h("span", { "class": "apk-symbol apple", text: "●" }), h("span", {}, h("small", { text: "DOWNLOAD CUSTOMER" }), h("strong", { text: "Android App" })))),
            h("small", { "class": "apk-release-note", text: "সর্বশেষ APK ভার্সন স্বয়ংক্রিয়ভাবে পাওয়া যাবে" })),
          h("div", { "class": "qr-area" }, h("img", { src: "https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=https%3A%2F%2Fapp.amaderbill.com%2Fapp-download", alt: "Scan to download AmaderBill" }), h("span", { text: "Scan to Download" }))));
      appsInfo().then(function (apps) {
        ["admin", "customer"].forEach(function (key) {
          var slot = panel.querySelector('[data-release="' + key + '"]');
          var release = apps[key];
          if (!slot) return;
          if (release && release.latest_download_url) {
            slot.href = safeUrl(release.latest_download_url);
            slot.setAttribute("target", "_blank");
            slot.setAttribute("rel", "noopener noreferrer");
            slot.setAttribute("download", "");
          } else {
            slot.classList.add("is-unavailable");
            slot.setAttribute("aria-label", "APK is not published yet");
          }
        });
      });
      return panel;
    },
    about: function (s) {
      var d = s.data || {}, content = h("div", { "class": "about-copy" },
        h("span", { "class": "about-eyebrow", text: d.label || "About AmaderBill" }),
        h("h2", {}, "About ", h("strong", { text: d.title || "AmaderBill" })));
      list(d.paragraphs).forEach(function (p) { content.append(h("p", { text: p })); });
      if (d.button_label) content.append(btn(d.button_label, d.button_url, "primary"));
      return h("section", { "class": "section about-panel-section", id: s.id },
        h("div", { "class": "about-panel" }, content,
          h("div", { "class": "about-laptop-art" }, h("div", { "class": "about-plant" }, h("i", {}), h("i", {}), h("i", {})),
            h("div", { "class": "laptop-screen" }, h("div", { "class": "laptop-topbar" }, h("i", {}), h("i", {}), h("i", {})),
              h("div", { "class": "laptop-chart" }, h("span", { text: "Revenue Overview" }), h("div", {}, [35,60,44,78,55,90].map(function (v) { return h("i", { style: "height:" + v + "%" }); }))),
              h("div", { "class": "laptop-stats" }, h("i", {}), h("i", {}), h("i", {}))),
            h("div", { "class": "laptop-base" }))));
    },
    stats: function (s) {
      var icons = ["🚀", "🛡️", "☺", "🎧"];
      return wrap(s, "why-section", grid("why-grid", s.data && s.data.items, function (i, n) {
        return h("article", { "class": "why-card" }, h("div", { "class": "why-icon", text: i.icon || icons[n] || "✓" }),
          h("h3", { text: i.value || i.title }), h("p", { text: i.label || i.description }));
      }));
    },
    contact: function (s) {
      var d = s.data || {};
      return h("section", { "class": "contact-strip-section", id: s.id },
        h("div", { "class": "container contact-strip" },
          h("div", { "class": "contact-block" }, h("span", { "class": "contact-symbol", text: "⌖" }), h("div", {}, h("strong", { text: "Our Location" }), h("span", { text: d.address || "Bangladesh" }))),
          h("div", { "class": "contact-block" }, h("span", { "class": "contact-symbol", text: "✉" }), h("div", {}, h("strong", { text: "Email Us" }), h("a", { href: "mailto:" + (d.email || "support@amaderbill.com"), text: d.email || "support@amaderbill.com" }))),
          h("div", { "class": "contact-block" }, h("span", { "class": "contact-symbol", text: "🎧" }), h("div", {}, h("strong", { text: "Support Hours" }), h("span", { text: d.phone || "24/7 Online Support" })))));
    },
    pricing: function (s) {
      var d = s.data || {}, cards = h("div", { "class": "pricing-grid" });
      function card(i) {
        var ul = h("ul", { "class": "price-list" });
        list(i.features).forEach(function (f) { ul.append(h("li", { text: f })); });
        return h("article", { "class": "price-card" + (i.popular ? " popular" : "") }, h("h3", { text: i.name }),
          h("p", { text: i.limit }), h("div", { "class": "price", text: i.price + " " + (i.period || "") }), ul, btn(i.button_label || "শুরু করুন", i.button_url || "#contact"));
      }
      if (d.source === "manual") list(d.items).forEach(function (i) { cards.append(card(i)); });
      else {
        cards.append(h("p", { "class": "price-note", text: "প্যাকেজ লোড হচ্ছে..." }));
        fetch(BASE + "/api/website-management/packages", { headers: { Accept: "application/json" } })
          .then(function (r) { if (!r.ok) throw new Error("packages"); return r.json(); })
          .then(function (j) {
            cards.replaceChildren();
            list(j.packages).forEach(function (p) { cards.append(card({ name: p.package_name || p.package_code, limit: bn(p.customer_limit) + " গ্রাহক পর্যন্ত", price: "৳ " + bn(p.monthly_fee), period: "/ মাস", features: ["রেজিস্ট্রেশন ফি: ৳ " + bn(p.signup_fee), "মাসিক ফি: ৳ " + bn(p.monthly_fee)], button_label: d.button_label || "শুরু করুন", button_url: d.button_url || "https://app.amaderbill.com/register" })); });
            if (!cards.children.length) cards.textContent = "প্যাকেজ এখন পাওয়া যাচ্ছে না।";
          }).catch(function () { cards.textContent = "প্যাকেজ এখন পাওয়া যাচ্ছে না।"; });
      }
      return wrap(s, "", cards);
    },
    team: function (s) { return wrap(s, "section-light", grid("team-grid", s.data.items, function (i) { return h("article", { "class": "team-card" }, h("h3", { text: i.name }), h("p", { text: i.role }), h("p", { text: i.description })); })); },
    gallery: function (s) { return wrap(s, "", grid("gallery-grid", s.data.items, function (i) { return h("img", { src: i.image, alt: i.alt || "", loading: "lazy" }); })); },
    faq: function (s) { return wrap(s, "", grid("faq-list", s.data.items, function (i) { return h("details", {}, h("summary", { text: i.question }), h("p", { text: i.answer })); })); },
    testimonials: function (s) { return wrap(s, "section-light", grid("testi-grid", s.data.items, function (i) { return h("article", { "class": "testi-card" }, h("p", { text: i.quote }), h("strong", { text: i.name }), h("span", { text: i.role })); })); },
    cta: function (s) { var d = s.data || {}; return h("section", { "class": "section cta-band", id: s.id }, h("div", { "class": "container" }, h("h2", { text: d.title }), h("p", { text: d.text }), btn(d.button_label, d.button_url))); },
    custom: function (s) { var d = s.data || {}; return wrap(s, "", h("div", {}, h("h2", { text: d.title }), h("p", { text: d.body }), btn(d.button_label, d.button_url))); }
  };

  function render(content) {
    var site = content.site || {}, sections = list(content.sections).filter(function (s) { return s && s.enabled !== false && R[s.type]; });
    activeSite = site;
    document.title = (site.name || "AmaderBill") + (site.tagline ? " - " + site.tagline : "");
    var meta = document.querySelector('meta[name="description"]');
    if (meta && site.description) meta.content = site.description;
    var customerLogin = list(site.login_links).find(function (x) { return x && /customer|কাস্টমার/i.test(x.label || ""); });
    var adminLogin = list(site.login_links).find(function (x) { return x && /admin|অ্যাডমিন/i.test(x.label || ""); });
    var themeButton = h("button", { "class": "theme-toggle", type: "button", "aria-label": "ডার্ক মোড চালু করুন", text: "☾" });
    function setTheme(mode) {
      var dark = mode === "dark";
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
      themeButton.textContent = dark ? "☀" : "☾";
      themeButton.setAttribute("aria-label", dark ? "লাইট মোড চালু করুন" : "ডার্ক মোড চালু করুন");
      try { localStorage.setItem("amaderbill_public_theme", dark ? "dark" : "light"); } catch (_) {}
    }
    var stored = "";
    try { stored = localStorage.getItem("amaderbill_public_theme") || ""; } catch (_) {}
    setTheme(stored || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
    themeButton.onclick = function () { setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); };

    var topbar = h("div", { "class": "public-topbar" }, h("div", { "class": "container public-topbar-inner" },
      h("div", { "class": "topbar-support" },
        h("a", { href: "mailto:" + (site.support_email || "support@amaderbill.com"), text: site.support_email || "support@amaderbill.com" }),
        h("a", { href: "tel:" + (site.support_phone || "+8801627078607"), text: site.support_phone || "+880 1627 078607" })),
      h("div", { "class": "topbar-actions" },
        h("a", { href: "#contact", text: "Help" }), h("a", { href: "#contact", text: "Support" }),
        h("a", { href: "#apps", text: "Download App ↓" }), themeButton)));
    var logo = h("a", { href: "#home", "class": "logo" },
      site.logo ? h("img", { src: site.logo, alt: site.name || "AmaderBill", style: "max-height:48px;max-width:190px;object-fit:contain" }) :
        h("span", { "class": "logo-mark", text: "A" }),
      h("span", { "class": "logo-copy" }, h("strong", {}, "Amader", h("b", { text: "Bill" })), h("small", { text: site.tagline || "Smart ISP Billing Solution" })));
    var nav = h("ul", { "class": "nav-links", id: "navLinks" });
    nav.append(h("li", {}, h("a", { href: "#home", "class": "active", text: "⌂  Home" })));
    sections.filter(function (s) { return s.nav_label && s.type !== "hero"; }).forEach(function (s) {
      nav.append(h("li", {}, h("a", { href: "#" + s.id, text: s.nav_label })));
    });
    nav.append(h("li", {}, h("a", { href: "#contact", text: "Contact" })));
    nav.append(h("li", {}, h("a", { href: loginUrl("admin", "https://app.amaderbill.com/login"), "class": "nav-login", text: "Login" })));
    var menu = h("button", { "class": "menu-toggle", type: "button", "aria-label": "মেনু খুলুন", "aria-expanded": "false", text: "☰" });
    menu.onclick = function () {
      var opened = nav.classList.toggle("active");
      menu.textContent = opened ? "×" : "☰";
      menu.setAttribute("aria-expanded", opened ? "true" : "false");
    };
    nav.onclick = function () { nav.classList.remove("active"); menu.textContent = "☰"; menu.setAttribute("aria-expanded", "false"); };
    var header = h("header", { "class": "header" }, h("div", { "class": "container navbar" }, logo, nav, menu));

    var main = h("main", {});
    var used = {};
    var appsSection = sections.find(function (s) { return s.type === "apps"; });
    var aboutSection = sections.find(function (s) { return s.type === "about"; });
    sections.forEach(function (s) {
      if (used[s.id]) return;
      if (s.type === "apps" || s.type === "about") {
        if (appsSection && aboutSection) {
          main.append(h("div", { "class": "download-about-row" }, R.apps(appsSection), R.about(aboutSection)));
          used[appsSection.id] = true; used[aboutSection.id] = true;
        } else { main.append(R[s.type](s)); used[s.id] = true; }
      } else { main.append(R[s.type](s)); used[s.id] = true; }
    });

    var contact = (sections.find(function (s) { return s.type === "contact"; }) || {}).data || {};
    var footerData = content.footer || {};
    var quick = h("nav", { "class": "footer-nav" });
    [["Home", "#home"], ["Features", "#features"], ["Download", "#apps"], ["Support", "#contact"], ["About", "#about"], ["Contact", "#contact"]].forEach(function (x) {
      quick.append(h("a", { href: x[1], text: x[0] }));
    });
    var footer = h("footer", { "class": "footer" }, h("div", { "class": "container footer-inner" },
      h("a", { href: "#home", "class": "footer-brand" }, h("span", { "class": "logo-mark", text: "A" }), h("span", {}, h("strong", {}, "Amader", h("b", { text: "Bill" })), h("small", { text: site.tagline || "Smart ISP Billing Solution" }))),
      h("span", { "class": "footer-separator" }), quick,
      h("div", { "class": "footer-right" }, h("span", { text: footerData.copyright || "© IRFAN IT - 2026" }),
        h("div", { "class": "footer-social" }, h("a", { href: "https://www.facebook.com/share/1DzwL8xumG/", target: "_blank", rel: "noopener noreferrer", "aria-label": "Facebook", text: "f" }),
          h("a", { href: "https://wa.me/8801627078607", target: "_blank", rel: "noopener noreferrer", "aria-label": "WhatsApp", text: "◉" })))));
    document.getElementById("app").replaceChildren(topbar, header, main, footer);

    fetch(BASE + "/api/app-download/promotions", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (r) {
        var promos = list(r && r.success && r.promotions);
        if (!promos.length) return;
        var p = promos[0], inner = h("div", { "class": "container promo-inner" });
        if (p.banner_url) inner.append(h("img", { src: p.banner_url, alt: p.title || "প্রমোশন", loading: "lazy" }));
        inner.append(h("div", { "class": "promo-copy" }, h("strong", { text: p.title }), p.message && h("p", { text: p.message })));
        if (p.button_text && p.button_link) inner.append(btn(p.button_text, p.button_link));
        header.after(h("aside", { "class": "promo-strip", "aria-label": "বিশেষ অফার" }, inner));
      }).catch(function () {});
    if ("IntersectionObserver" in window && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } });
      }, { threshold: 0.1 });
      Array.prototype.slice.call(main.querySelectorAll(".section, .hero, .feature-card, .why-card")).forEach(function (el) { el.classList.add("reveal"); observer.observe(el); });
    }
    if (location.hash) { var target = document.getElementById(location.hash.slice(1)); if (target) target.scrollIntoView(); }
  }

  fetch(API, { headers: { Accept: "application/json" }, cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("Website API " + r.status); return r.json(); })
    .then(function (r) { if (!r.success || !r.content || !r.content.sections) throw new Error("Invalid website content"); render(r.content); })
    .catch(function (e) { console.error("[Website]", e); document.getElementById("app").textContent = "Website is temporarily unavailable."; });
})();