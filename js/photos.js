/* ============================================================
   KOKI TAKAMATSU — the front page's photos, as the owner sets them in the console
   Each photo holder on the page is a figure[data-slot]. data/front.json (written by
   console.html) can give one a new picture: a holder with a photo of its own (the
   portrait, the calligraphy) takes the new one in its place; a grey holder gets it
   as its first child, so it rides the holder's own wipe in (js/anim.js). A holder
   data/front.json doesn't name keeps what index.html gives it. The request starts
   in the page's head (window.__front); js/anim.js waits for this (window.__photos)
   before it lifts the curtain, so a new portrait is in before anyone sees it.
   ============================================================ */
(function () {
  "use strict";
  var slots = {};
  [].forEach.call(document.querySelectorAll("figure[data-slot]"), function (f) { slots[f.getAttribute("data-slot")] = f; });
  // (only the site's own pictures, as the console stores them)
  var OK = /^assets\/img\/(?!.*\.\.)[\w\/.-]+\.(webp|jpe?g|png|avif|gif)$/i;
  function apply(d) {
    var photos = d && d.photos;
    if (!photos || typeof photos !== "object") return;
    Object.keys(photos).forEach(function (id) {
      var f = slots[id], p = photos[id];
      if (!f || !p || typeof p.image !== "string" || !OK.test(p.image)) return;
      var img = f.querySelector("img");
      if (!img) { img = document.createElement("img"); img.decoding = "async"; f.insertBefore(img, f.firstChild); }
      img.alt = typeof p.alt === "string" ? p.alt : "";
      img.src = p.image;
    });
  }
  window.__photos = Promise.resolve(window.__front).then(apply).catch(function () {});
})();
