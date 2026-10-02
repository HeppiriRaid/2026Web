/* ============================================================
   KOKI TAKAMATSU — the front page's photos and captions, as the owner sets them in the console
   Each photo holder on the page is a figure[data-slot]. data/front.json (written by
   console.html) can give one a new picture: a holder with a photo of its own (the
   portrait, the calligraphy) takes the new one in its place; a grey holder gets it
   as its first child, so it rides the holder's own wipe in (js/anim.js). A photo's
   "focus" is the part the holder shows, as the owner dragged it in the console
   (object-position, % across and down; the middle when it has none). A caption
   marked data-caption-for="<holder>" can be rewritten too ("captions": its title,
   date, medium and location; an empty one is left out). Whatever data/front.json
   doesn't name keeps what index.html gives it. The request starts in the page's
   head (window.__front: the newest copy there is, js/fresh.js — GitHub's the
   moment the console saves, with its new pictures straight from the repository
   until the site has them); js/anim.js waits for this (window.__photos) before
   it lifts the curtain, so a new portrait is in before anyone sees it.
   ============================================================ */
(function () {
  "use strict";
  var slots = {}, caps = {};
  [].forEach.call(document.querySelectorAll("figure[data-slot]"), function (f) { slots[f.getAttribute("data-slot")] = f; });
  [].forEach.call(document.querySelectorAll("[data-caption-for]"), function (c) { caps[c.getAttribute("data-caption-for")] = c; });
  // (only the site's own pictures, as the console stores them)
  var OK = /^assets\/img\/(?!.*\.\.)[\w\/.-]+\.(webp|jpe?g|png|avif|gif)$/i;
  function pc(v) { return typeof v === "number" && v >= 0 && v <= 100; }
  function part(v) { return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 60) : ""; }
  // a caption's words, as the page writes them (the console previews the same: js/console.js)
  function caption(c) {
    return [["Title: \u201c", part(c.title), "\u201d"], ["Date: ", part(c.date), ""], ["Made with: ", part(c.medium), ""], ["Location: ", part(c.location), ""]]
      .filter(function (p) { return p[1]; })
      .map(function (p) { return p.join(""); }).join(" | ");
  }
  function apply(d, site) {
    var photos = d && typeof d.photos === "object" && d.photos || {};
    Object.keys(photos).forEach(function (id) {
      var f = slots[id], p = photos[id];
      if (!f || !p || typeof p.image !== "string" || !OK.test(p.image)) return;
      var img = f.querySelector("img");
      if (!img) { img = document.createElement("img"); img.decoding = "async"; f.insertBefore(img, f.firstChild); }
      img.alt = typeof p.alt === "string" ? p.alt : "";
      if (Array.isArray(p.focus) && pc(p.focus[0]) && pc(p.focus[1])) img.style.objectPosition = p.focus[0] + "% " + p.focus[1] + "%";
      if (window.__fresh) window.__fresh.put(img, p.image, site);
      else if (img.getAttribute("src") !== p.image) img.src = p.image;
    });
    var captions = d && typeof d.captions === "object" && d.captions || {};
    Object.keys(captions).forEach(function (id) {
      var el = caps[id], c = captions[id];
      if (el && c && typeof c === "object") el.textContent = caption(c);
    });
  }
  window.__photos = Promise.resolve(window.__front).then(function (r) { if (r) apply(r.data, r.site); }).catch(function () {});
})();
