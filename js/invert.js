/* ============================================================
   KOKI TAKAMATSU — the inverse effect (see css/invert.css)
   Builds the two SVG filters [data-invert] uses, from --inv:
     #inv-lens  every painted pixel becomes --inv, its alpha kept: the lens's
                shape, which css/invert.css difference-blends with the page
     #inv-self  |pixel - --inv| per channel, alpha kept: a 256-step table per
                channel, exact for every 8-bit value
   Both work in sRGB, the space CSS blending uses, so the two modes agree pixel
   for pixel.
   Try it on any element: add ?invert to a page's address (index.html?invert),
   then click things. Shift-click inverts a thing's own pixels. Esc when done.
   ============================================================ */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg", root = document.documentElement;

  // --inv as [r, g, b] in 0..255 (#rgb, #rrggbb or rgb()); Maison Auge's #DCCBC3 otherwise
  function colour() {
    var s = getComputedStyle(root).getPropertyValue("--inv").trim().toLowerCase(), m;
    if ((m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s))) s = "#" + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
    if ((m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(s))) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    if ((m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s))) return [+m[1], +m[2], +m[3]];
    return [220, 203, 195];
  }

  function make(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function filters() {
    if (document.getElementById("inv-lens")) return;
    var c = colour(), svg = make("svg", { "aria-hidden": "true", focusable: "false", width: "0", height: "0" });
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    // The region is a wide field of px around the element rather than its box: text such
    // as the brand sits in a zero-width box, and a box-sized region would cut it off.
    function filter(id) {
      return make("filter", { id: id, "color-interpolation-filters": "sRGB", filterUnits: "userSpaceOnUse",
        x: "-10000", y: "-10000", width: "40000", height: "40000" }, svg);
    }
    // + a quarter step: Chrome truncates these to 8 bits (others round), and 41/255 as a
    // float can land a hair under 41 — the quarter keeps both ways on the exact value
    var f = function (v) { return +((v + 0.25) / 255).toFixed(6); };
    make("feColorMatrix", { type: "matrix", values:
      "0 0 0 0 " + f(c[0]) + "  0 0 0 0 " + f(c[1]) + "  0 0 0 0 " + f(c[2]) + "  0 0 0 1 0" }, filter("inv-lens"));
    var table = make("feComponentTransfer", {}, filter("inv-self"));
    ["R", "G", "B"].forEach(function (ch, i) {
      for (var v = [], k = 0; k < 256; k++) v.push(f(Math.abs(k - c[i])));
      make("feFunc" + ch, { type: "table", tableValues: v.join(" ") }, table);
    });
    document.body.insertBefore(svg, document.body.firstChild);
  }

  /* ---------- try it: ?invert in the address, then click any element ---------- */
  function tryMode() {
    // empty space and whole-page layers are not "an element" to try it on
    var SKIP = "html, body, main.stage, header.istage, .strip, .strip-track, .work, .zoom, .zoom-bg";
    var hl = document.createElement("div"), bar = document.createElement("div"), list, hover = null;
    hl.className = "inv-hl";
    bar.className = "inv-bar";
    bar.innerHTML = "<b>Inverse — try it.</b> Click any element to turn the effect on or off. " +
      "Shift-click inverts the element&#8217;s own pixels instead. Esc or Done to stop." +
      "<ol></ol><button type=\"button\">Done</button>";
    list = bar.querySelector("ol");
    document.body.appendChild(hl);
    document.body.appendChild(bar);
    root.classList.add("inv-try");

    function pick(t) {
      if (!t || !t.closest || t.closest(".inv-bar")) return null;
      var btn = t.closest(".menu-btn");                 // its bars sit on nothing: the button is the unit
      if (btn) return btn;
      return t.matches(SKIP) ? null : t;
    }
    function frame(t) {
      if (!t) { hl.style.display = "none"; return; }
      var r = t.getBoundingClientRect(), x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
      try {                                             // text that overflows its box (the brand) counts too
        var rg = document.createRange(); rg.selectNodeContents(t);
        var q = rg.getBoundingClientRect();
        if (q.width || q.height) { x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); }
      } catch (_) {}
      hl.style.cssText = "display:block;transform:translate(" + x0 + "px," + y0 + "px);width:" + (x1 - x0) + "px;height:" + (y1 - y0) + "px";
    }
    function label(e) {
      var cls = [].filter.call(e.classList, function (c) { return c !== "a" && c !== "wh" && c !== "j"; }).slice(0, 2);
      var s = e.tagName.toLowerCase() + (cls.length ? "." + cls.join(".") : "");
      var t = (e.textContent || "").replace(/\s+/g, " ").trim();
      if (t) s += " “" + (t.length > 30 ? t.slice(0, 30) + "…" : t) + "”";
      return s + (e.getAttribute("data-invert") === "self" ? " — own pixels" : "");
    }
    function refresh() {
      var on = [].filter.call(document.querySelectorAll("[data-invert]"), function (e) { return !e.matches(".cursor-ring"); });
      list.innerHTML = "";
      on.forEach(function (e) { var li = document.createElement("li"); li.textContent = label(e); list.appendChild(li); });
    }
    function move(e) { hover = pick(e.target); frame(hover); }
    function click(e) {
      if (e.target.closest && e.target.closest(".inv-bar")) return;
      e.preventDefault(); e.stopImmediatePropagation();
      var t = pick(e.target); if (!t) return;
      var cur = t.getAttribute("data-invert");
      if (e.shiftKey) { if (cur === "self") t.removeAttribute("data-invert"); else t.setAttribute("data-invert", "self"); }
      else if (cur !== null) t.removeAttribute("data-invert");
      else t.setAttribute("data-invert", "");
      refresh(); frame(t);
    }
    function key(e) { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); stop(); } }
    function stop() {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("click", click, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", rescroll, true);
      root.classList.remove("inv-try");
      hl.remove(); bar.remove();
    }
    function rescroll() { frame(hover); }
    bar.querySelector("button").addEventListener("click", stop);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("click", click, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("scroll", rescroll, true);
    refresh();
  }

  filters();
  if (/[?&]invert(?:[=&]|$)/.test(location.search)) tryMode();
})();
