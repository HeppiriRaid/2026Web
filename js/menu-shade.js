/* ============================================================
   KOKI TAKAMATSU — the hamburger's colours over the picture
   Over the BACK GROUND picture (index.html, [data-menu-shade]) the grey
   hamburger used to vanish: grey on grey. There it now takes its colour
   from the picture right beneath it, through Chinese colour harmony —
   live as the page scrolls, like the cursor's inverse square, only
   harmonious instead of inverted.

   How: every frame the hamburger is over the picture, each bar is coloured
   along its length from a small, softened copy of the picture, read at the
   bar's own place on screen, through one of the mappings in VARIATIONS.
   Whether the bars go deep (on a light picture) or light (on a dark one) is
   decided once for the whole hamburger, from the picture under all of it,
   so a bar never flickers between the two along its length; the hues follow
   the picture point by point. Where the picture's edge crosses a bar, the
   part off the picture keeps the plain grey, split exactly at the edge.
   Away from the picture nothing is touched: the bars keep their own CSS
   grey (only inline background-images are set, and all cleared again).
   The open menu's panel takes the same harmony as one deep colour, so its
   white labels read; their hover colour follows (and its mirror for the
   cursor's square: css/anim.css, .menu-nav a:hover::after).
   Every bar colour stays at or below #DCCBC3 in each channel — the cursor
   square's rule (CLAUDE.md) — so inside the square the bars stay clean.

   index.html?shader opens a small test panel: point at a variation to try
   it on the hamburger, click to keep it (or keys 0-7); try them over a real
   painting in the picture's place (P); jump to the picture. A choice made
   there is remembered in that browser only; everyone else sees DEFAULT.
   ============================================================ */
(function () {
  "use strict";
  var btn = document.getElementById("menuBtn"), nav = document.getElementById("menuNav");
  var pics = [].slice.call(document.querySelectorAll("[data-menu-shade]"));
  if (!btn || !nav || !pics.length || !window.getComputedStyle || !Math.cbrt) return;
  var bars = [].slice.call(btn.children);
  var panel = nav.querySelector(".menu-bg");          // made by menu.js (loaded first)

  /* ---------- colour: sRGB <-> OKLab (perceptual, so mixes and contrasts look even) ---------- */
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function gam(c) { c = Math.max(0, Math.min(1, c)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); }
  function lab(rgb) {
    var r = lin(rgb[0]), g = lin(rgb[1]), b = lin(rgb[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function linOf(c) {                                  // OKLab -> linear sRGB (unclamped)
    var l = c[0] + 0.3963377774 * c[1] + 0.2158037573 * c[2];
    var m = c[0] - 0.1055613458 * c[1] - 0.0638541728 * c[2];
    var s = c[0] - 0.0894841775 * c[1] - 1.2914855480 * c[2];
    l *= l * l; m *= m * m; s *= s * s;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  function rgbOf(c) { var p = linOf(c); return [gam(p[0]), gam(p[1]), gam(p[2])].map(Math.round); }   // (no cap)
  function hexLab(h) { return lab([parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]); }
  function sm(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function mixLab(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function css(c) { return "rgb(" + c.map(Math.round).join(",") + ")"; }

  // No channel above #DCCBC3 (the cursor square's rule): darken, and in a pinch desaturate,
  // until the colour fits. Returns sRGB 0-255.
  var CAP = [lin(220), lin(203), lin(195)];
  function fit(c) {
    c = c.slice();
    for (var i = 0; i < 80; i++) {
      var p = linOf(c);
      if (p[0] <= CAP[0] && p[1] <= CAP[1] && p[2] <= CAP[2] && p[0] >= -1e-4 && p[1] >= -1e-4 && p[2] >= -1e-4) break;
      if (p[0] > CAP[0] || p[1] > CAP[1] || p[2] > CAP[2]) c[0] -= 0.01; else { c[1] *= 0.9; c[2] *= 0.9; }
    }
    var q = linOf(c);
    return [gam(q[0]), gam(q[1]), gam(q[2])];
  }
  // Lightness far enough from the ground's to read at a glance (a strong colour needs a little
  // less): below it when the bars are deep, above it when they are light.
  function contrast(o, g, deep) {
    var need = Math.max(0.18, 0.30 - 0.5 * Math.sqrt(o[1] * o[1] + o[2] * o[2]));
    return [deep ? Math.max(0.06, Math.min(o[0], g[0] - need)) : Math.min(0.98, Math.max(o[0], g[0] + need)), o[1], o[2]];
  }

  /* ---------- the five phases (五行) ------------------------------------------------
     Each colour of the picture is read as a blend of the five phases and their five
     colours: wood 青 (greens to blues), fire 赤 (reds), earth 黄 (yellows to browns),
     metal 白 (light, colourless), water 黑 (dark). */
  function win(h, c, w) { var d = Math.abs(((h - c + 540) % 360) - 180); return d < w ? Math.pow(Math.cos(Math.PI / 2 * d / w), 2) : 0; }
  function phases(c) {
    var L = c[0], C = Math.sqrt(c[1] * c[1] + c[2] * c[2]), h = Math.atan2(c[2], c[1]) * 180 / Math.PI;
    var grey = 1 - sm(0.03, 0.08, C), light = sm(0.40, 0.64, L);
    var w = { wood: 0, fire: 0, earth: 0, metal: grey * light, water: grey * (1 - light) };
    var f = win(h, 25, 55), e = win(h, 85, 45), wd = win(h, 200, 95), v = win(h, 315, 45), s = f + e + wd + v || 1;
    var hue = 1 - grey, dark = 1 - sm(0.24, 0.40, L), k = hue * (1 - dark);
    w.fire += k * (f + 0.5 * v) / s; w.earth += k * e / s; w.wood += k * wd / s;
    w.water += k * 0.5 * v / s + hue * dark;           // violet is half fire, half water; deep colours are water
    var pale = sm(0.86, 0.96, L) * hue;                  // pastels lean to metal
    w.wood *= 1 - pale; w.fire *= 1 - pale; w.earth *= 1 - pale; w.metal += pale;
    var t = w.wood + w.fire + w.earth + w.metal + w.water;
    for (var p in w) w[p] /= t;
    return w;
  }
  var GEN = { wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood" };   // 相生: the child
  var CTRL = { wood: "metal", fire: "water", earth: "wood", metal: "fire", water: "earth" };  // 相克: the controller
  // a palette: per phase, its colour on a light ground (deep) and on a dark ground (light)
  function palette(o) { var p = {}; for (var k in o) p[k] = [hexLab(o[k][0]), hexLab(o[k][1])]; return p; }
  function byPhase(g, map, pal, deep) {
    var w = phases(g), o = [0, 0, 0];
    for (var k in w) {
      if (!w[k]) continue;
      var c = pal[map ? map[k] : k][deep ? 0 : 1];
      for (var i = 0; i < 3; i++) o[i] += w[k] * c[i];
    }
    return o;
  }
  var P_GEN = palette({
    fire: ["#9D2933", "#DB5A6B"],    // 胭脂 rouge · 海棠红 crab-apple
    earth: ["#9C5333", "#D9B611"],   // 赭 ochre · 秋香 autumn fragrance
    metal: ["#7397AB", "#BACAC6"],   // 苍青 slate blue · 老银 old silver
    water: ["#425066", "#88ADA6"],   // 黛蓝 dusk blue · 水色 water
    wood: ["#426666", "#48C0A3"]     // 黛绿 dusk green · 青碧 jade
  });
  var P_CTRL = palette({
    metal: ["#7397AB", "#BACAC6"],   // 苍青 · 老银
    water: ["#3D3B4F", "#758A99"],   // 玄青 black-blue · 墨灰 ink grey
    wood: ["#177CB0", "#48C0A3"],    // 靛青 indigo · 青碧 jade
    fire: ["#C3272B", "#DC3023"],    // 赤 red · 酡红 flushed red
    earth: ["#9C5333", "#D9B611"]    // 赭 · 秋香
  });
  var P_JIAN = palette({             // 间色: each phase mixed with the one it overcomes
    wood: ["#0C8918", "#9ED048"],    // 绿 green (青+黄): 绿沈 · 豆绿
    fire: ["#DB5A6B", "#EF7A82"],    // 红 rose (赤+白): 海棠红 · 嫣红
    metal: ["#549688", "#48C0A3"],   // 碧 jade (白+青): 铜绿 verdigris · 青碧
    water: ["#8C4356", "#B0A4E3"],   // 紫 purple (黑+赤): 绛紫 · 雪青
    earth: ["#896C39", "#C89B40"]    // 骝黄 umber (黄+黑): 秋色 · 昏黄
  });
  var INKS = ["#1C1A19", "#34302C", "#514B45", "#8A847C", "#C2BCB3"].map(hexLab);   // 焦 浓 重 淡 清
  var ZI = ["#8C4356", "#574266", "#E4C6D0", "#B0A4E3"].map(hexLab);   // 绛紫 黛紫 · 藕荷 雪青
  var QH = ["#22408E", "#D6ECF0"].map(hexLab);                         // 青花 cobalt · 月白 glaze

  /* ---------- the variations: the picture's colour g (OKLab) -> the bar's ----------------
     x = the whole hamburger's state: x.deep (deep bars on a light picture, light on a dark
     one) and x.ink (the ink tone opposite the picture under it). "local" ones decide light
     or dark point by point instead. */
  var VARIATIONS = [
    { zh: "灰", en: "Off", note: "the plain grey, as before" },
    { zh: "阴阳", py: "yīnyáng", en: "Yin and yang", note: "the picture's own colours, its light and dark swapped, point by point",
      local: true, map: function (g) { return [0.16 + 0.68 * (1 - g[0]), g[1] * 1.15, g[2] * 1.15]; } },
    { zh: "相生", py: "xiāngshēng", en: "Mother and child", note: "five phases, generating: wood feeds fire, fire earth, earth metal, metal water, water wood",
      map: function (g, x) { return byPhase(g, GEN, P_GEN, x.deep); } },
    { zh: "相克", py: "xiāngkè", en: "Opposition", note: "five phases, overcoming: each colour meets the one that masters it",
      map: function (g, x) { return byPhase(g, CTRL, P_CTRL, x.deep); } },
    { zh: "间色", py: "jiānsè", en: "In-between colours", note: "green, rose, jade, purple, umber: the classical mixes of two phases",
      map: function (g, x) { return byPhase(g, null, P_JIAN, x.deep); } },
    { zh: "墨分五色", py: "mò fēn wǔ sè", en: "Five tones of ink", note: "scorched, thick, heavy, light, clear: the ink tone opposite the picture's",
      map: function (g, x) { return INKS[x.ink]; } },
    { zh: "紫气", py: "zǐqì", en: "Purple aura", note: "the noble mixed colour, cooling over warm colours and warming over cool ones",
      map: function (g, x) {
        var warm = (Math.max(-1, Math.min(1, (0.6 * g[1] + 0.8 * g[2]) / 0.08)) + 1) / 2;
        return x.deep ? mixLab(ZI[0], ZI[1], warm) : mixLab(ZI[2], ZI[3], warm);
      } },
    { zh: "青花", py: "qīnghuā", en: "Blue and white", note: "porcelain: cobalt on light colours, glaze white on dark",
      map: function (g, x) { return x.deep ? QH[0] : QH[1]; } }
  ];
  var DEFAULT = 2;                                       // 相生 (provisional, until one is chosen)
  var KEY = "kt-shade";
  var mode = DEFAULT;
  try { var saved = localStorage.getItem(KEY); if (saved !== null && VARIATIONS[+saved]) mode = +saved; } catch (e) {}

  // the hamburger's state, from the mean lightness of the picture under it; a little
  // hysteresis so it doesn't flicker while the page scrolls over mid tones
  function stateFor(Lm, was) {
    var x = { deep: was ? was.deep : Lm >= 0.5, ink: was ? was.ink : 1 };
    if (x.deep && Lm < 0.46) x.deep = false; else if (!x.deep && Lm > 0.54) x.deep = true;
    var want = 1 - Lm, d0 = Math.abs(INKS[x.ink][0] - want);
    INKS.forEach(function (c, i) { var d = Math.abs(c[0] - want); if (d + 0.03 < d0) { x.ink = i; d0 = d; } });
    return x;
  }
  var state = stateFor(0.77, null);

  function shadeLab(rgb, x, m) {                         // ground sRGB -> bar OKLab (before the cap)
    var v = VARIATIONS[m], g = lab(rgb);
    return contrast(v.map(g, x), g, v.local ? g[0] >= 0.55 : x.deep);
  }
  var memo = {}, memoN = 0;
  function shade(rgb, x, m) {                            // ground sRGB -> "rgb(…)" for a bar
    var k = m + (x.deep ? "d" : "l") + x.ink + ":" + Math.round(rgb[0]) + "," + Math.round(rgb[1]) + "," + Math.round(rgb[2]);
    var v = memo[k];
    if (v) return v;
    if (++memoN > 6000) { memo = {}; memoN = 0; }
    return (memo[k] = css(fit(shadeLab(rgb, x, m))));
  }

  /* ---------- the picture's colours: a small, softened copy, read where the bars are ---------- */
  function sourceOf(fig, r) {
    var img = fig.querySelector("img");
    if (img && img.complete && img.naturalWidth) {
      var key = (img.currentSrc || img.src) + "|" + Math.round(r.width) + "x" + Math.round(r.height);
      if (fig.__shade && fig.__shade.key === key) return fig.__shade;
      var W = 96, H = Math.max(1, Math.round(W * r.height / r.width));
      var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      var cx = cv.getContext("2d", { willReadFrequently: true });
      var nw = img.naturalWidth, nh = img.naturalHeight, k = Math.max(W / nw, H / nh);   // as object-fit: cover
      cx.imageSmoothingQuality = "high";
      cx.filter = "blur(1px)";
      cx.drawImage(img, (W - nw * k) / 2, (H - nh * k) / 2, nw * k, nh * k);
      try { return (fig.__shade = { key: key, w: W, h: H, data: cx.getImageData(0, 0, W, H).data }); } catch (e) {}
    }
    var m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(fig).backgroundColor), c = m ? m[1].split(",").map(parseFloat) : [179, 179, 179];
    return (fig.__shade = { key: "flat:" + c.join(), flat: [c[0], c[1], c[2]] });
  }
  function sample(src, r, x, y) {
    if (src.flat) return src.flat;
    var u = Math.max(0, Math.min(src.w - 1, (x - r.left) / r.width * src.w - 0.5));
    var v = Math.max(0, Math.min(src.h - 1, (y - r.top) / r.height * src.h - 0.5));
    var x0 = Math.floor(u), y0 = Math.floor(v), x1 = Math.min(src.w - 1, x0 + 1), y1 = Math.min(src.h - 1, y0 + 1);
    var fx = u - x0, fy = v - y0, d = src.data, o = [0, 0, 0];
    for (var i = 0; i < 3; i++) {
      var a = d[(y0 * src.w + x0) * 4 + i] * (1 - fx) + d[(y0 * src.w + x1) * 4 + i] * fx;
      var b = d[(y1 * src.w + x0) * 4 + i] * (1 - fx) + d[(y1 * src.w + x1) * 4 + i] * fx;
      o[i] = a * (1 - fy) + b * fy;
    }
    return o;
  }
  // The part of the picture actually showing: it wipes in when first scrolled to (a clip-path
  // inset, js/anim.js), and before that it is all hidden.
  function visible(fig, r) {
    var m = /^inset\(([^)]*)\)/.exec(getComputedStyle(fig).clipPath || "");
    if (!m) return r;
    var v = m[1].split(/\s+round\s+/)[0].trim().split(/\s+/), t = [v[0], v[1] || v[0], v[2] || v[0], v[3] || v[1] || v[0]];
    function len(x, ref) { return /%$/.test(x) ? parseFloat(x) / 100 * ref : parseFloat(x) || 0; }
    var o = { left: Math.max(r.left, r.left + len(t[3], r.width)), right: Math.min(r.right, r.right - len(t[1], r.width)),
              top: Math.max(r.top, r.top + len(t[0], r.height)), bottom: Math.min(r.bottom, r.bottom - len(t[2], r.height)) };
    o.width = o.right - o.left; o.height = o.bottom - o.top;
    return o;
  }
  function mean(src, r, x0, y0, w, h) {                  // the picture's mean colour over a box
    var acc = [0, 0, 0];
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      var c = sample(src, r, x0 + w * (i + 0.5) / 4, y0 + h * (j + 0.5) / 4);
      acc[0] += c[0] / 16; acc[1] += c[1] / 16; acc[2] += c[2] / 16;
    }
    return acc;
  }

  /* ---------- painting ---------------------------------------------------------------------- */
  var written = new WeakMap();                           // element -> { property: the value we last wrote }
  function put(el, prop, v) {
    if (!el) return;
    var w = written.get(el) || {};
    if ((w[prop] || "") === v) return;
    if (prop.charAt(0) === "-") { if (v) el.style.setProperty(prop, v); else el.style.removeProperty(prop); }
    else el.style[prop] = v;
    w[prop] = v; written.set(el, w);
  }
  function clearAll() {
    bars.forEach(function (b) { put(b, "backgroundImage", ""); });
    put(panel, "backgroundColor", "");
    put(nav, "--nav-hover", ""); put(nav, "--nav-hover-m", "");
  }

  // Where a bar is on screen (it may be mid-transition, or turned into half of the X), and the
  // points along its length where the picture is read.
  var N = 12;
  function barAt(span, br, s, W, vr) {
    var cs = getComputedStyle(span), top = parseFloat(cs.top), h = parseFloat(cs.height), op = parseFloat(cs.opacity);
    if (!(h > 0) || !(op > 0.01)) return null;
    var th = 0, m = cs.transform;
    if (m && m !== "none") { var v = m.match(/-?[\d.]+(e-?\d+)?/g); th = Math.atan2(+v[1], +v[0]); }
    var co = Math.cos(th), si = Math.sin(th), hl = s * W / 2, ht = s * h / 2;
    var b = { grey: cs.backgroundColor, h: h, th: th, cx: br.left + hl, cy: br.top + s * (top + h / 2),
              ey: Math.abs(hl * si) + Math.abs(ht * co), ex: Math.abs(hl * co) + Math.abs(ht * si), pts: [] };
    if (b.cy + b.ey <= vr.top || b.cy - b.ey >= vr.bottom || b.cx + b.ex <= vr.left || b.cx - b.ex >= vr.right) return null;
    for (var k = 0; k < N; k++) {
      var f = (k + 0.5) / N - 0.5;
      b.pts.push([Math.max(vr.left, Math.min(vr.right, b.cx + 2 * hl * f * co)), Math.max(vr.top, Math.min(vr.bottom, b.cy + 2 * hl * f * si))]);
    }
    return b;
  }
  // A hard-edged layer of the bar's own grey over its part beyond a line on screen — a
  // horizontal one at y = v (axis "y") or a vertical one at x = v — on the side where the
  // screen coordinate is below v (less) or above it; in the bar's own, possibly rotated, frame.
  function beyond(b, s, W, axis, v, less) {
    var phi = (axis === "y" ? 180 : 90) - b.th * 180 / Math.PI, rad = phi * Math.PI / 180;
    var len = Math.abs(W * Math.sin(rad)) + Math.abs(b.h * Math.cos(rad));
    var at = (len / 2 + (v - (axis === "y" ? b.cy : b.cx)) / s).toFixed(3) + "px";
    return "linear-gradient(" + phi.toFixed(3) + "deg," + (less ? b.grey + " " + at + ",transparent " + at : "transparent " + at + "," + b.grey + " " + at) + ")";
  }
  // One bar: its colours along its length; where an edge of the picture crosses it, the part
  // off the picture keeps the bar's own grey, split exactly on that edge.
  function paintBar(span, b, s, W, vr) {
    if (!b) { put(span, "backgroundImage", ""); return; }
    var stops = [], first = null, same = true;
    b.pts.forEach(function (p, k) {
      var c = shade(p[2], state, mode);
      if (first === null) first = c; else if (c !== first) same = false;
      stops.push(c + " " + ((k + 0.5) / N * 100).toFixed(2) + "%");
    });
    var layers = [same ? "linear-gradient(" + first + "," + first + ")" : "linear-gradient(90deg," + stops.join(",") + ")"];
    if (b.cy - b.ey < vr.top) layers.unshift(beyond(b, s, W, "y", vr.top, true));
    if (b.cy + b.ey > vr.bottom) layers.unshift(beyond(b, s, W, "y", vr.bottom, false));
    if (b.cx - b.ex < vr.left) layers.unshift(beyond(b, s, W, "x", vr.left, true));
    if (b.cx + b.ex > vr.right) layers.unshift(beyond(b, s, W, "x", vr.right, false));
    put(span, "backgroundImage", layers.join(","));
  }

  // The open menu's panel (it grows out of the middle bar): the same harmony as one colour,
  // always deep so the white labels read, once it is mostly over the picture. Kept up to date
  // while closed too, so it is already right the moment it opens.
  function paintPanel(pr, vr, src) {
    var nr = nav.getBoundingClientRect();
    var ix = Math.min(nr.right, vr.right) - Math.max(nr.left, vr.left), iy = Math.min(nr.bottom, vr.bottom) - Math.max(nr.top, vr.top);
    if (ix <= 0 || iy <= 0 || ix * iy < 0.4 * nr.width * nr.height) {
      put(panel, "backgroundColor", ""); put(nav, "--nav-hover", ""); put(nav, "--nav-hover-m", "");
      return;
    }
    var avg = mean(src, pr, Math.max(nr.left, vr.left), Math.max(nr.top, vr.top), ix, iy);
    var o = shadeLab(avg, { deep: true, ink: 1 }, mode);
    o = [Math.min(o[0], 0.46), o[1], o[2]];
    // (the hover colour may be light: inside the cursor's square a label shows as a copy in
    // the hover colour's mirror about #DCCBC3, which keeps it clean — css/anim.css)
    var hover = rgbOf(mixLab(o, [0.97, 0, 0], 0.7)), C3 = [220, 203, 195];
    put(panel, "backgroundColor", css(fit(o)));
    put(nav, "--nav-hover", css(hover));
    put(nav, "--nav-hover-m", css(hover.map(function (v, i) { return v > C3[i] ? 2 * C3[i] - v : v; })));
  }

  /* ---------- every frame (after menu.js has placed the button) -------------------------- */
  var lastSig = "";
  function frame() {
    var br = btn.getBoundingClientRect(), nr = nav.getBoundingClientRect(), hit = null, pr = null, vr = null;
    for (var i = 0; i < pics.length && !hit; i++) {
      var r = pics[i].getBoundingClientRect();
      if ((r.bottom > br.top - 2 && r.top < br.bottom + 2 && r.right > br.left && r.left < br.right) ||
          (r.bottom > nr.top && r.top < nr.bottom && r.right > nr.left && r.left < nr.right)) {
        var v = visible(pics[i], r);
        if (v.width > 0 && v.height > 0) { hit = pics[i]; pr = r; vr = v; }
      }
    }
    if (lab_) lab_.over(!!(hit && br.width));
    if (!VARIATIONS[mode].map) { if (lastSig !== "off") { clearAll(); lastSig = "off"; } return; }
    if (!hit || !br.width) { if (lastSig !== "none") { clearAll(); lastSig = "none"; } return; }
    var src = sourceOf(hit, pr), W = parseFloat(getComputedStyle(btn).width), s = br.width / W;
    var sig = [mode, src.key, br.left, br.top, br.width, pr.left, pr.top, pr.width, pr.height, vr.left, vr.right, vr.top, vr.bottom, nr.top, nr.left].map(function (v) { return typeof v === "number" ? v.toFixed(2) : v; }).join("|") +
      bars.map(function (b) { var c = getComputedStyle(b); return c.top + c.height + c.opacity + c.transform; }).join("|");
    if (sig === lastSig) return;
    lastSig = sig;
    var geo = bars.map(function (b) { return barAt(b, br, s, W, vr); }), sum = 0, n = 0;
    geo.forEach(function (b) { if (b) b.pts.forEach(function (p) { p.push(sample(src, pr, p[0], p[1])); sum += lab(p[2])[0]; n++; }); });
    if (n) state = stateFor(sum / n, state);
    bars.forEach(function (b, k) { paintBar(b, geo[k], s, W, vr); });
    paintPanel(pr, vr, src);
  }
  if (window.gsap && window.gsap.ticker) window.gsap.ticker.add(frame);
  else (function loop() { frame(); requestAnimationFrame(loop); })();

  var lab_ = null, chosen = mode;
  // what the bars show: the chosen variation, or one being tried for a moment (the test panel)
  function show(n) {
    if (!VARIATIONS[n] || n === mode) return;
    mode = n; lastSig = "";
    if (lab_) lab_.update();
  }
  function setMode(n, keep) {
    if (!VARIATIONS[n]) return;
    chosen = n; show(n);
    if (keep) try { localStorage.setItem(KEY, String(n)); } catch (e) {}
    if (lab_) lab_.update();
  }
  // for automated checks (tests/fold-check.mjs) and the test panel
  window.__menuShade = { set: function (n) { setMode(n, false); }, get: function () { return mode; },
    names: VARIATIONS.map(function (v) { return v.zh + " " + v.en; }) };

  /* ---------- the test panel (index.html?shader) ----------------------------------------- */
  var wantLab = /[?&]shader\b/.test(location.search);
  try { if (wantLab) sessionStorage.setItem("kt-shade-lab", "1"); else wantLab = sessionStorage.getItem("kt-shade-lab") === "1"; } catch (e) {}
  if (wantLab) lab_ = testPanel();

  function testPanel() {
    var fig = pics[0], previews = [{ name: "Grey box", src: "" }], pick = 0;
    var style = document.createElement("style");
    // The panel lies above the cursor's under-squares, so every colour in it is #DCCBC3 or
    // darker in every channel (CLAUDE.md), or inside the square its soft edges would fold into
    // dark outlines: ink, with light text that stays under #DCCBC3. (tests/colour-audit.mjs
    // holds the code to it; tests/fold-check.mjs, flow "shader", shows the panel's states.)
    style.textContent =
      ".shade-lab{position:fixed;left:12px;bottom:12px;z-index:96;box-sizing:border-box;width:min(330px,calc(100vw - 24px));" +
      "background:#434343;color:#d2c8c0;font:12px/1.4 'Gothic','Century Gothic',system-ui,sans-serif}" +
      ".shade-lab .in{padding:12px 12px 10px}.shade-lab.small .in{padding:8px 10px}" +
      ".shade-lab b{font-weight:400;letter-spacing:.06em}.shade-lab .hd{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px}" +
      ".shade-lab button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-align:left}" +
      ".shade-lab :focus-visible{outline:1px solid #d2c8c0;outline-offset:1px}" +                     /* (not the browser's white-haloed ring) */
      ".shade-lab ol{list-style:none;margin:0 0 10px;padding:0}.shade-lab li button{display:flex;gap:8px;align-items:flex-start;width:100%;padding:5px 4px}" +
      ".shade-lab li button:hover{background:#504d4b}.shade-lab li button[aria-pressed=true]{background:#5e5a57}" +
      ".shade-lab .sw{flex:0 0 auto;display:grid;gap:2px;width:22px;padding:5px 4px;background:var(--sw-ground,#b3b3b3)}" +
      ".shade-lab .sw i{display:block;height:3px;background:var(--sw-bar,#b3b1b1)}" +
      ".shade-lab .t{flex:1 1 auto}.shade-lab .zh{font-size:14px;margin-right:6px}.shade-lab .n{display:block;color:#a0958f;font-size:11px}" +
      ".shade-lab .k{flex:0 0 auto;color:#a0958f;width:10px}.shade-lab [aria-pressed=true] .k{color:#dccbc3}" +
      ".shade-lab .row{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;margin:0 0 8px}.shade-lab .row button{text-decoration:underline;text-underline-offset:2px}" +
      ".shade-lab .row button[aria-pressed=true]{text-decoration:none;color:#dccbc3}.shade-lab .go{border:1px solid #a0958f;padding:5px 10px}" +
      ".shade-lab .st,.shade-lab .keys{color:#a0958f;font-size:11px;margin:8px 0 0}" +
      ".shade-lab .hd b{cursor:pointer}.shade-lab.small ol{display:flex;flex-wrap:wrap;gap:2px;margin:0 0 6px}" +
      ".shade-lab.small li button{width:auto;padding:4px}.shade-lab.small .t,.shade-lab.small .keys,.shade-lab.small .go{display:none}";
    document.head.appendChild(style);
    var box = document.createElement("div");
    box.className = "shade-lab";
    box.setAttribute("role", "region");
    box.setAttribute("aria-label", "Menu colour test");
    box.innerHTML = '<div class="in"><div class="hd"><b role="button" tabindex="0" title="Show or hide the descriptions">MENU COLOURS · 菜单色</b><button class="x" aria-label="Close the test panel">✕</button></div>' +
      '<ol></ol><div class="row pics"><span>Picture:</span></div>' +
      '<button class="go">Go to the picture ↓</button><p class="st"></p><p class="keys">Keys: 0–7 colours · P next picture</p></div>';
    var inner = box.firstChild, list = box.querySelector("ol"), picRow = box.querySelector(".pics"), head = box.querySelector(".hd b"), st = box.querySelector(".st");
    if (window.innerWidth < 640) box.classList.add("small");             // a phone: one compact row (and a short window, below)
    function fold() { box.classList.toggle("small"); }
    head.addEventListener("click", fold);
    head.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fold(); } });
    // Try a variation with the cursor: while the pointer (or keyboard focus) is on one, the
    // hamburger shows it; click to keep it. Off the list it goes back to the one kept.
    var hov = null, foc = null;
    function tryOut() { show(hov !== null ? hov : foc !== null ? foc : chosen); }
    VARIATIONS.forEach(function (v, i) {
      var li = document.createElement("li"), b = document.createElement("button");
      b.title = v.zh + " " + v.en;
      b.innerHTML = '<span class="k">' + i + '</span><span class="sw"><i></i><i></i><i></i></span><span class="t"><span class="zh"></span><span class="en"></span><span class="n"></span></span>';
      b.querySelector(".zh").textContent = v.zh;
      b.querySelector(".en").textContent = v.en + (v.py ? " (" + v.py + ")" : "");
      b.querySelector(".n").textContent = v.note;
      b.addEventListener("click", function () { setMode(i, true); });
      b.addEventListener("mouseenter", function () { hov = i; tryOut(); });
      b.addEventListener("mouseleave", function () { hov = null; tryOut(); });
      b.addEventListener("focus", function () { foc = b.matches(":focus-visible") ? i : null; tryOut(); });
      b.addEventListener("blur", function () { foc = null; tryOut(); });
      li.appendChild(b); list.appendChild(li);
    });
    function addPic(p, i) {
      var b = document.createElement("button");
      b.textContent = p.name;
      b.addEventListener("click", function () { showPic(i); });
      picRow.appendChild(b);
    }
    previews.forEach(addPic);
    // a few of the illustration works, to try the colours over a real painting
    if (window.fetch) fetch("data/illustration.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        (d && d.works || []).filter(function (w) { return w && w.image; }).slice(0, 4).forEach(function (w, i) {
          var p = { name: "Work " + (i + 1), src: w.image };
          previews.push(p); addPic(p, previews.length - 1);
        });
        update();
      }, function () {});
    // (a painting tried here only goes into this page, for this visit: nothing is saved)
    function showPic(i) {
      pick = i;
      var old = fig.querySelector("img[data-shade-preview]");
      if (old) old.parentNode.removeChild(old);
      if (previews[i].src) {
        var im = new Image();
        im.alt = ""; im.setAttribute("data-shade-preview", "");
        im.onload = function () { lastSig = ""; update(); };
        im.src = previews[i].src;
        fig.appendChild(im);
      }
      lastSig = ""; update();
    }
    box.querySelector(".go").addEventListener("click", function () {
      var y = fig.getBoundingClientRect().top + window.pageYOffset - 6;
      if (window.__lenis) window.__lenis.scrollTo(y, { duration: 1.2 }); else window.scrollTo({ top: y, behavior: "smooth" });
    });
    box.querySelector(".x").addEventListener("click", function () {
      box.style.display = "none";
      try { sessionStorage.removeItem("kt-shade-lab"); } catch (e) {}
    });
    document.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey || box.style.display === "none" || /input|textarea/i.test(e.target.tagName)) return;
      if (/^[0-7]$/.test(e.key) && VARIATIONS[+e.key]) setMode(+e.key, true);
      else if (e.key === "p" || e.key === "P") showPic((pick + 1) % previews.length);
    });
    document.body.appendChild(box);
    // The box on whole device pixels: over a bright photo its edges stay crisp, where a soft
    // edge between it and the photo would fold (CLAUDE.md). Kept so as its contents change.
    function snap() {
      if (box.style.display === "none") return;
      var d = window.devicePixelRatio || 1, s = box.style;
      s.width = Math.floor(Math.min(330, window.innerWidth - 24) * d) / d + "px";
      var h = Math.ceil(inner.getBoundingClientRect().height * d - 0.01) / d;
      s.height = h + "px";
      s.left = Math.round(12 * d) / d + "px";
      s.top = Math.max(Math.round(12 * d), Math.round((window.innerHeight - 12 - h) * d)) / d + "px";
      s.bottom = "auto";
    }
    if (window.ResizeObserver) new ResizeObserver(snap).observe(inner);
    window.addEventListener("resize", snap);
    function fits() { snap(); if (inner.getBoundingClientRect().height > window.innerHeight - 24) box.classList.add("small"); }
    // each swatch: three bars in that variation's colour, over the picture's mean colour (held
    // under #DCCBC3 like everything in the panel: a bright painting's mean would fold)
    function update() {
      var r = fig.getBoundingClientRect(), avg = mean(sourceOf(fig, r), r, r.left, r.top, r.width, r.height);
      var x = stateFor(lab(avg)[0], null), ground = css(fit(lab(avg)));
      [].forEach.call(list.children, function (li, i) {
        var b = li.firstChild;
        b.setAttribute("aria-pressed", i === chosen ? "true" : "false");
        b.style.setProperty("--sw-ground", ground);
        b.style.setProperty("--sw-bar", VARIATIONS[i].map ? shade(avg, x, i) : getComputedStyle(bars[0]).backgroundColor);
      });
      [].forEach.call(picRow.querySelectorAll("button"), function (b, i) { b.setAttribute("aria-pressed", i === pick ? "true" : "false"); });
    }
    // whether the hamburger is over the picture right now (only there does it take the colours)
    var wasOver = null;
    function over(on) {
      if (on === wasOver) return;
      wasOver = on;
      st.textContent = on ? "The hamburger is over the picture: point at a colour to try it, click to keep it."
        : "The hamburger is not over the picture: go to the picture, then point at a colour to try it.";
    }
    over(false);
    update();
    fits();                                                              // a window too short for it all: compact
    return { update: update, over: over };
  }
})();
