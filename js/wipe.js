/* ============================================================
   KOKI TAKAMATSU — moving between pages: a white wipe
   Your name plays when someone arrives at the site (or reloads a page).
   Moving from one of its pages to another is only a white wipe: the paper
   rises over the page being left, and lifts off the page arrived on.
   A link here leaves a note for the next page (sessionStorage, read once,
   good for 15 s); anim.js and illustration.js read window.__arrive and skip
   the name. Stepping back / forward through the pages counts as moving too.
   ============================================================ */
(function () {
  "use strict";
  var KEY = "kt-wipe";
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

  if (!pre || !gsap || REDUCE) return;
  var name = pre.querySelector(".pl-name");
  var leaving = false;

  // leaving: the paper rises over the page (no name), then the next page opens
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    if (a.getAttribute("aria-current") === "page") return;          // this page (menu.js just closes the menu)
    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
    e.preventDefault();
    if (leaving) return;
    leaving = true;
    if (name) { gsap.killTweensOf(name); gsap.set(name, { y: "110%" }); }
    pre.style.display = "flex";
    gsap.fromTo(pre, { yPercent: 100 }, { yPercent: 0, duration: 0.7, ease: "power4.inOut", overwrite: true,
      onComplete: function () {
        try { sessionStorage.setItem(KEY, String(Date.now())); } catch (err) {}
        location.href = url.href;
      } });
  }, true);

  // back / forward straight from the browser's page cache: the page returns still
  // under the sheet it left with, so lift it off
  window.addEventListener("pageshow", function (ev) {
    if (!ev.persisted) return;
    leaving = false;
    if (getComputedStyle(pre).display === "none") return;
    gsap.to(pre, { yPercent: -100, duration: 0.85, ease: "power4.inOut", overwrite: true,
      onComplete: function () { pre.style.display = "none"; } });
  });
})();
