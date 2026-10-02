/* ============================================================
   KOKI TAKAMATSU — moving between pages: a white wipe
   Your name plays when someone arrives at the site (or reloads a page).
   Moving from one of its pages to another is only a white wipe, one quick
   motion: the paper rises over the page being left (speeding up), and on
   the page arrived on it lifts straight off again (slowing down) while that
   page's own intro rises in behind it, at once and 1.6x faster than on a
   first visit — the same rhythm, quicker.
   A link here leaves a note for the next page (sessionStorage, read once,
   good for 15 s); anim.js and illustration.js read window.__arrive, skip
   the name and hand their intro to window.__wipe.arrive(). Stepping back /
   forward through the pages counts as moving too. The cursor goes with the
   page: it hears "kt:leave" as the sheet starts to rise and "kt:arrive" as
   it starts to lift (js/cursor.js).
   The next page comes into this same window, not as a new page load: see
   "leaving" below for why (the system's plain arrow).
   ============================================================ */
(function () {
  "use strict";
  var KEY = "kt-wipe";
  var COVER = 0.45, LIFT = 0.5, PACE = 1.6;     // seconds (real time); arrival speed-up
  var pre = document.getElementById("preloader");
  var gsap = window.gsap;
  var REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // arriving from another page of the site, or stepping back / forward through them
  var arrive = false;
  try {
    var t = +sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    arrive = t > 0 && Date.now() - t < 15000;
  } catch (e) {}
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    if (nav && nav.type === "back_forward") arrive = true;
  } catch (e) {}
  window.__arrive = arrive;
  // stepping back / forward to a page: where it was when it was left (its scroll, its row:
  // js/anim.js, js/illustration.js put them back; noted below as it was left)
  var was = null;
  try { was = arrive && history.state && history.state.kt; } catch (e) {}
  window.__arriveAt = was && typeof was === "object" ? was : null;

  // back / forward between pages that came into this window (below): to another page, that
  // page comes in the same way; a step within this page (a #section) is the page's own. (Where
  // the wipe doesn't run — reduced motion — the page opens the usual way.)
  var here = location.pathname + location.search;            // the page in this window
  // (a page that another has replaced in the window hears nothing more: the browser takes its
  // listeners away with it, document.open(); this keeps to that should one not)
  var mine = document.documentElement, gone = function () { return document.documentElement !== mine; };
  var stepped = null;
  window.addEventListener("popstate", function () {
    if (gone()) return;
    var url = new URL(location.href);
    if (stepped) stepped(url);
    else if (url.pathname + url.search !== here) location.replace(url.href);
  });

  if (!pre || !gsap || REDUCE) return;
  var name = pre.querySelector(".pl-name");
  var leaving = false;
  // the cursor (js/cursor.js) goes with the page: out as the sheet rises, back in as it lifts
  function tell(what) { try { document.dispatchEvent(new CustomEvent(what)); } catch (e) {} }

  // Every move of the sheet goes through this (as GSAP modifiers): it lands on whole
  // device pixels, so its edge is never a blurred half pixel, and it tells its own copy
  // of the cursor's under-squares how far it has moved (--sheet-y, css/anim.css), so they
  // stay exactly under the square. Inside the square a blurred edge, or a square
  // that slipped, would show as a dark line.
  var SHEET = { yPercent: function (v) {
    var h = pre.getBoundingClientRect().height || 1, r = window.devicePixelRatio || 1;
    var y = Math.round(v / 100 * h * r) / r;
    pre.style.setProperty("--sheet-y", y + "px");
    return y / h * 100;
  } };

  // ---- arriving: the sheet lifts off at once and the page's intro rises in behind it.
  // The whole animation clock runs PACE x faster until everything has settled (so the
  // intro keeps its exact rhythm, only quicker), then returns to normal speed.
  window.__wipe = {
    sheet: SHEET,
    arrive: function (intro, done) {
      var clock = gsap.globalTimeline, t0 = performance.now();
      clock.timeScale(PACE);
      tell("kt:arrive");                                         // (the cursor springs back in: js/cursor.js)
      gsap.timeline()
        .to(pre, { yPercent: -100, duration: LIFT * PACE, ease: "power3.out", modifiers: SHEET }, 0)
        .add(function () { intro(); }, 0.06 * PACE)
        .add(function () { pre.style.display = "none"; if (done) done(); }, LIFT * PACE);
      (function settle() {
        var elapsed = performance.now() - t0;
        var moving = clock.getChildren(true, true, false).some(function (tw) { return !tw.paused() && tw.progress() < 1; });
        if ((!moving && elapsed > 1500) || elapsed > 4000) clock.timeScale(1);
        else setTimeout(settle, 120);
      })();
    }
  };

  // ---- leaving: start loading the next page under the sheet — the page itself, its data
  // (the newest copy there is, js/fresh.js: the front page's photos, or the list of works)
  // and, for the illustration page, its first pictures. The data is handed over in
  // sessionStorage, so the next page doesn't wait for GitHub again.
  function prefetch(href) {
    var l = document.createElement("link");
    l.rel = "prefetch"; l.href = href;
    document.head.appendChild(l);
  }
  function warm(url) {
    var fresh = window.__fresh, works = /illustration\.html$/.test(url.pathname);
    if (!fresh || !(works || /(\/|index\.html)$/.test(url.pathname))) return;
    fresh.hand(works ? "data/illustration.json" : "data/front.json").then(function (r) {
      var d = r.data;
      if (works && d && Array.isArray(d.works)) d.works.slice(0, 4).forEach(function (w) { if (w && w.image) prefetch(new URL(fresh.url(w.image, r.site), url).href); });
    });
  }

  // ---- …into this same window. A page opened the usual way gets a new surface from the
  // browser (Chrome gives every page its own), and until that page has drawn its first frame
  // and seen the mouse move, the surface shows the system's plain arrow — over the white
  // sheet, whenever the mouse moves in that moment (measured: 50-130 ms on a fast machine,
  // more on a slow one or a slow connection). Nothing in a page can hide it there. So the
  // next page comes into this window instead: fetched while the sheet rises; once the sheet
  // covers, this page's clocks stop, document.open() takes the page away (its listeners
  // with it), and the next page is written in, its scripts running as on any page load (its
  // head hides the arrow at once: cursor-ready); the address moves on (history). Back /
  // forward between the site's pages do the same (popstate). Its pages only (each carries
  // this wipe); anything else, or a page that doesn't come, opens the usual way.
  var SITE = /\/(index\.html|illustration\.html)?$/;
  var next = null;                                           // where the sheet is going
  function fetchPage(url) {
    return fetch(url.href, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok || !/^text\/html/.test(r.headers.get("content-type") || "")) throw new Error("page " + r.status);
      return r.text();
    });
  }
  function swap(url, html, push) {
    // This page lets go of all it set going, or it would live on beside the next, page after
    // page: what outlives its document hears "kt:gone" (a media query's listener, observers,
    // the works' smooth scroll); the front page's smooth scroll, the scroll triggers (with their
    // own frame loop and timer) and GSAP's ticker (the menu, the hamburger's colours and the
    // works' row run on it) stop. The next page's timings start afresh.
    tell("kt:gone");
    try { if (window.__lenis) window.__lenis.destroy(); } catch (e) {}
    try { if (window.ScrollTrigger) window.ScrollTrigger.disable(false, true); } catch (e) {}
    try { gsap.globalTimeline.clear(); gsap.ticker.sleep(); } catch (e) {}
    try { delete window.__lenis; performance.clearResourceTimings(); } catch (e) {}
    if (push) history.pushState(null, "", url.href);
    document.open();
    document.write(html);
    document.close();
  }
  // the paper rises over the page (no name, speeding up), then the next page comes in
  function leave(url, push) {
    leaving = true;
    next = url;
    tell("kt:leave");
    warm(url);
    var soft = SITE.test(url.pathname), page = soft ? fetchPage(url) : null;
    // where this page is, for back / forward to it; the browser's own putting back of the scroll
    // off (it would jump this page about before the sheet covers it: the next page does it)
    try {
      var row = document.getElementById("strip");
      history.scrollRestoration = "manual";
      if (push) history.replaceState({ kt: { y: Math.round(window.scrollY), x: row ? Math.round(row.scrollLeft) : 0 } }, "");
    } catch (err) {}
    gsap.globalTimeline.timeScale(1);
    if (name) { gsap.killTweensOf(name); gsap.set(name, { y: "110%" }); }
    pre.style.display = "flex";
    gsap.fromTo(pre, { yPercent: 100 }, { yPercent: 0, duration: COVER, ease: "power3.in", overwrite: true, modifiers: SHEET,
      onComplete: function () {
        try { sessionStorage.setItem(KEY, String(Date.now())); } catch (err) {}
        var to = next, again = to !== url;                     // (back / forward pressed meanwhile: that page)
        var usual = function () { if (push && !again) location.href = to.href; else location.replace(to.href); };
        if (!SITE.test(to.pathname) || (!again && !page)) { usual(); return; }
        (again ? fetchPage(to) : page).then(function (html) {
          try { swap(to, html, push && !again); } catch (err) { usual(); }
        }, usual);
      } });
  }
  document.addEventListener("click", function (e) {
    if (gone()) return;
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    if (a.getAttribute("aria-current") === "page") return;          // this page (menu.js just closes the menu)
    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
    e.preventDefault();
    if (!leaving) leave(url, true);
  }, true);
  stepped = function (url) {
    if (leaving) next = url;                                   // (already going: to this one instead)
    else if (url.pathname + url.search !== here) leave(url, false);
  };

  // back / forward straight from the browser's page cache: the page returns still
  // under the sheet it left with, so lift it off. Two frames later: the animation clock
  // first jumps by the time the page sat in the cache, which would finish a lift started
  // now in its first frame.
  window.addEventListener("pageshow", function (ev) {
    if (!ev.persisted || gone()) return;
    leaving = false;
    gsap.globalTimeline.timeScale(1);
    if (getComputedStyle(pre).display === "none") return;
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      tell("kt:arrive");
      gsap.to(pre, { yPercent: -100, duration: LIFT, ease: "power3.out", overwrite: true, modifiers: SHEET,
        onComplete: function () { pre.style.display = "none"; } });
    }); });
  });
})();
