/* ============================================================
   Fixed top-right menu.
   The grey corner marks live inside the .stage and scroll away with the
   page. This button is position:fixed and the same grey, parked exactly
   over those marks at the top — so it's invisible there, but stays put
   (and becomes visible) once you scroll past them. Works with or without
   the animation layer; uses Lenis for smooth scroll when available.
   ============================================================ */
(function () {
  "use strict";
  var btn = document.getElementById("menuBtn");
  var nav = document.getElementById("menuNav");
  var stage = document.querySelector(".stage");
  if (!btn || !nav || !stage) return;

  // Position + scale the fixed menu to match the artboard. The two grey
  // marks sit at artboard x 448.8 (w12) and y 0 / 24 (w12); their shared
  // centre is ~ (454.8, 18) in artboard points.
  function place() {
    var k = stage.getBoundingClientRect().width / 460.807; // px per artboard pt
    document.documentElement.style.setProperty("--mk", k);
    btn.style.left = (454.8 * k) + "px";
    btn.style.top = (18 * k) + "px";
    btn.style.right = "auto";
    // drop the menu just below the button, right edges aligned
    var r = btn.getBoundingClientRect();
    nav.style.top = (r.bottom + 6 * k) + "px";
    nav.style.right = Math.max(0, window.innerWidth - r.right) + "px";
  }
  place();
  window.addEventListener("resize", place);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);

  function setOpen(open) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Menu");
    nav.setAttribute("aria-hidden", open ? "false" : "true");
    nav.classList.toggle("open", open);
  }

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    setOpen(btn.getAttribute("aria-expanded") !== "true");
  });

  nav.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var target = document.querySelector(a.getAttribute("href"));
      if (target) {
        e.preventDefault();
        if (window.__lenis) window.__lenis.scrollTo(target, { offset: -48, duration: 1.3 });
        else target.scrollIntoView({ behavior: "smooth" });
      }
      setOpen(false);
    });
  });

  // close on Escape or a click outside
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
  document.addEventListener("click", function (e) {
    if (nav.classList.contains("open") && !nav.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });
})();
