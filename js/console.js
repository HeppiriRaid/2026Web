/* ============================================================
   KOKI TAKAMATSU — console (console.html)
   Edits data/illustration.json (the list the illustration page builds its row
   from) and the work images, then saves everything as ONE commit to Main
   through GitHub's API, with the owner's own fine-grained token (Contents:
   read and write). GitHub Pages publishes it about a minute later; the console
   watches the live file and says when the Save is on the site.
   ============================================================ */
(function () {
  "use strict";

  var OWNER = "HeppiriRaid", NAME = "2026Web", BRANCH = "Main";
  var REPO = "/repos/" + OWNER + "/" + NAME;
  var DATA = "data/illustration.json", DIR = "assets/img/illustration/";
  var ROW_MAX = 1200, FULL_MAX = 2400;      // px: the row picture's height / the zoom picture's long side
  var KEY = "kt-console-token";
  // The token is only ever sent to GitHub. A stand-in API (for testing) is honoured
  // only when this page itself is opened on this computer, never from a link.
  var API = "https://api.github.com";
  if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname) && typeof window.__CONSOLE_TEST_API__ === "string") API = window.__CONSOLE_TEST_API__;

  function $(id) { return document.getElementById(id); }
  var ui = {
    status: $("status"), save: $("saveBtn"), view: $("viewLink"), login: $("login"), form: $("loginForm"),
    token: $("token"), remember: $("remember"), loginError: $("loginError"), connect: $("connectBtn"),
    editor: $("editor"), row: $("row"), add: $("addBtn"), many: $("pickMany"), one: $("pickOne"),
    panel: $("panel"), pv: $("pv"), title: $("fTitle"), date: $("fDate"), medium: $("fMedium"), meta: $("fMeta"),
    replace: $("replaceBtn"), left: $("leftBtn"), right: $("rightBtn"), del: $("deleteBtn"), foot: $("foot"), signOut: $("signOut")
  };
  // works: [{ id, title, date, medium, width, height, image?, full?   (saved)
  //           _pend? (a new picture, uploaded on Save), _url? (its preview), _busy? }]
  var S = { token: "", works: [], sha: null, removed: [], dirty: false, saving: false, busy: 0, sel: -1, at: -1, watch: "" };

  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function say(msg, kind) { ui.status.textContent = msg || ""; ui.status.className = "status" + (kind ? " is-" + kind : ""); }
  function newId() { return "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- GitHub ---------------------------------------------------------- */
  async function gh(method, path, body, accept) {
    var headers = { "Authorization": "Bearer " + S.token, "Accept": accept || "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (body) headers["Content-Type"] = "application/json";
    var r;
    try {
      r = await fetch(API + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    } catch (err) {
      var n = new Error("could not reach GitHub (" + ((err && err.message) || "network") + ")"); n.status = 0; throw n;
    }
    if (r.ok && accept && /raw/.test(accept)) return r.blob();
    var text = await r.text(), j = null;
    try { j = text ? JSON.parse(text) : null; } catch (e) {}
    if (!r.ok) { var e2 = new Error((j && j.message) || r.statusText || "request failed"); e2.status = r.status; throw e2; }
    return j;
  }
  function why(e) { return e && e.status ? "GitHub said " + e.status + ": " + e.message : (e && e.message) || String(e); }
  // base64 -> bytes -> UTF-8 (plain atob would garble Japanese titles)
  function b64Text(b64) {
    var bin = atob(String(b64 || "").replace(/\s/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }
  function blobB64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(",")[1] || ""); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
  }
  function clean(w) {
    var o = { id: String(w.id || newId()), title: String(w.title || ""), date: String(w.date || ""), medium: String(w.medium || ""),
              width: +w.width > 0 ? +w.width : 1, height: +w.height > 0 ? +w.height : 1 };
    if (w.image) o.image = String(w.image);
    if (w.full) o.full = String(w.full);
    return o;
  }
  async function load() {
    say("Loading the works…");
    try {
      var j = await gh("GET", REPO + "/contents/" + DATA + "?ref=" + BRANCH);
      var d = JSON.parse(b64Text(j.content));
      S.sha = j.sha;
      S.works = (d && Array.isArray(d.works) ? d.works : []).map(clean);
    } catch (e) {
      if (e.status !== 404) throw e;
      S.sha = null; S.works = [];                                  // no list yet: start empty
    }
    S.removed = []; S.dirty = false; S.sel = -1;
  }

  /* ---------- sign in / out ---------------------------------------------------- */
  async function signIn(token, remember) {
    S.token = token;
    ui.connect.disabled = true; ui.loginError.textContent = "";
    try {
      await load();
      if (remember) { try { localStorage.setItem(KEY, token); } catch (e) {} }
      showEditor();
    } catch (e) {
      S.token = "";
      try { localStorage.removeItem(KEY); } catch (e2) {}
      ui.loginError.textContent =
        e.status === 401 ? "GitHub didn't accept that token (401 Bad credentials). Check you copied all of it, or make a new one." :
        e.status === 403 || e.status === 404 ? "This token can't open HeppiriRaid/2026Web (" + e.status + ": " + e.message + "). Check its repository access." :
        why(e);
      showLogin();
      say("");
    } finally { ui.connect.disabled = false; }
  }
  function showLogin() {
    ui.login.hidden = false; ui.editor.hidden = true; ui.foot.hidden = true; ui.save.hidden = true;
    ui.token.value = ""; setTimeout(function () { ui.token.focus(); }, 0);
  }
  function showEditor() {
    ui.login.hidden = true; ui.editor.hidden = false; ui.foot.hidden = false; ui.save.hidden = false;
    renderRow(); renderPanel(); updateSave();
    say(S.works.length + (S.works.length === 1 ? " work" : " works") + " loaded");
  }
  ui.form.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = ui.token.value.trim();
    if (t) signIn(t, ui.remember.checked);
  });
  ui.signOut.addEventListener("click", function () {
    if ((S.dirty || S.busy) && !confirm("Sign out and lose the unsaved changes?")) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    S.token = ""; S.works = []; S.dirty = false; S.sel = -1;
    say(""); showLogin();
  });

  /* ---------- the row ---------------------------------------------------------- */
  function srcOf(w) { return w._url || w.image || ""; }
  function setSrc(im, w) {
    if (w._url) { im.src = w._url; return; }
    // a picture saved moments ago may not be published yet: fetch it from the repository instead
    im.onerror = function () {
      im.onerror = null;
      gh("GET", REPO + "/contents/" + w.image + "?ref=" + BRANCH, null, "application/vnd.github.raw")
        .then(function (b) { w._url = URL.createObjectURL(b); im.src = w._url; }, function () {});
    };
    im.src = w.image;
  }
  function slot(at) {
    var b = mk("button", "ins");
    b.type = "button"; b.setAttribute("aria-label", "Add works here");
    b.addEventListener("click", function () { pick(at); });
    return b;
  }
  function card(w, i) {
    var c = mk("div", "w" + (i === S.sel ? " is-sel" : "") + (w._busy ? " is-busy" : ""));
    c.tabIndex = 0;
    c.setAttribute("role", "listitem");
    c.setAttribute("data-i", i);
    c.setAttribute("aria-label", (w.title || "Untitled") + ", " + (i + 1) + " of " + S.works.length);
    var pic = mk("div", "pic");
    pic.style.aspectRatio = w.width + " / " + w.height;
    if (srcOf(w) && !w._busy) { var im = mk("img"); im.alt = ""; im.draggable = false; setSrc(im, w); pic.appendChild(im); }
    var cap = mk("div", "cap");
    cap.appendChild(mk("span", "t", w.title || "Untitled"));
    cap.appendChild(mk("span", "m", [w.date, w.medium].filter(Boolean).join(" · ")));
    c.appendChild(pic); c.appendChild(cap);
    if (w._pend) c.appendChild(mk("span", "tag", "New image"));
    return c;
  }
  function renderRow() {
    var row = ui.row, keep = row.scrollLeft;
    row.textContent = "";
    S.marker = mk("div", "marker");
    row.appendChild(S.marker);
    if (!S.works.length) row.appendChild(mk("p", "empty", "No works yet. Drop images here, or use Add works."));
    S.works.forEach(function (w, i) { row.appendChild(slot(i)); row.appendChild(card(w, i)); });
    if (S.works.length) row.appendChild(slot(S.works.length));
    var add = mk("button", "add", "+ Add works");
    add.type = "button";
    add.addEventListener("click", function () { pick(S.works.length); });
    row.appendChild(add);
    row.scrollLeft = keep;
  }
  function cardEl(i) { return ui.row.querySelector('.w[data-i="' + i + '"]'); }
  function focusCard(i) { var c = cardEl(i); if (c) c.focus(); }

  /* ---------- the selected work's editor --------------------------------------- */
  function renderPanel() {
    var w = S.works[S.sel];
    if (!w) { ui.panel.hidden = true; return; }
    ui.panel.hidden = false;
    ui.title.value = w.title; ui.date.value = w.date; ui.medium.value = w.medium;
    ui.pv.textContent = "";
    if (srcOf(w) && !w._busy) { var im = mk("img"); im.alt = ""; setSrc(im, w); ui.pv.appendChild(im); }
    else { var ph = mk("div", "ph"); ph.style.aspectRatio = w.width + " / " + w.height; ui.pv.appendChild(ph); }
    ui.meta.textContent = w._busy ? "Preparing the image…" :
      (w.image || w._pend) ? w.width + " × " + w.height + " px in the row" + (w._pend ? " · new image, uploaded when you Save" : "") :
      "No image yet: a grey holder in " + w.width + ":" + w.height + ". Replace image gives it one.";
    ui.left.disabled = S.sel <= 0;
    ui.right.disabled = S.sel >= S.works.length - 1;
    ui.replace.disabled = !!w._busy;
  }
  function select(i) {
    S.sel = i;
    ui.row.querySelectorAll(".w.is-sel").forEach(function (c) { c.classList.remove("is-sel"); });
    var c = cardEl(i); if (c) c.classList.add("is-sel");
    renderPanel();
  }
  function field(input, key) {
    input.addEventListener("input", function () {
      var w = S.works[S.sel]; if (!w) return;
      w[key] = input.value;
      touch();
      var c = cardEl(S.sel); if (!c) return;               // update the card in place (keeps typing smooth)
      c.querySelector(".t").textContent = w.title || "Untitled";
      c.querySelector(".m").textContent = [w.date, w.medium].filter(Boolean).join(" · ");
    });
  }
  field(ui.title, "title"); field(ui.date, "date"); field(ui.medium, "medium");

  function move(from, to) {
    if (to < 0 || to >= S.works.length || from === to) return;
    var w = S.works.splice(from, 1)[0];
    S.works.splice(to, 0, w);
    S.sel = to; touch(); renderRow(); renderPanel(); focusCard(to);
  }
  function forget(w) {                                       // its saved files leave on Save
    if (w.image) S.removed.push(w.image);
    if (w.full) S.removed.push(w.full);
    if (w._url) URL.revokeObjectURL(w._url);
  }
  function removeAt(i) {
    var w = S.works[i]; if (!w || w._busy) return;
    if (!confirm("Delete “" + (w.title || "Untitled") + "”? Its image leaves the site when you Save.")) return;
    forget(w);
    S.works.splice(i, 1);
    S.sel = Math.min(i, S.works.length - 1);
    touch(); renderRow(); renderPanel();
  }
  ui.left.addEventListener("click", function () { move(S.sel, S.sel - 1); });
  ui.right.addEventListener("click", function () { move(S.sel, S.sel + 1); });
  ui.del.addEventListener("click", function () { removeAt(S.sel); });
  ui.replace.addEventListener("click", function () { ui.one.value = ""; ui.one.click(); });
  ui.one.addEventListener("change", function () {
    var w = S.works[S.sel], f = ui.one.files[0];
    if (!w || !f) return;
    var old = { url: w._url, pend: w._pend };
    w._busy = true; w._file = f; renderRow(); renderPanel();
    prepare(w).then(function (ok) { if (ok && old.url && old.pend) URL.revokeObjectURL(old.url); });
  });

  /* ---------- adding works ------------------------------------------------------ */
  function pick(at) { S.at = at; ui.many.value = ""; ui.many.click(); }
  ui.add.addEventListener("click", function () { pick(S.sel >= 0 ? S.sel + 1 : S.works.length); });
  ui.many.addEventListener("change", function () { addFiles(ui.many.files, S.at < 0 ? S.works.length : S.at); });
  function isImage(f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|avif|bmp|tiff?)$/i.test(f.name); }
  function addFiles(list, at) {
    var files = [].filter.call(list || [], isImage);
    if (!files.length) return;
    at = Math.max(0, Math.min(at, S.works.length));
    var year = String(new Date().getFullYear());
    var made = files.map(function (f) {
      return { id: newId(), title: f.name.replace(/\.[^.]+$/, ""), date: year, medium: "", width: 1, height: 1, _busy: true, _file: f, _new: true };
    });
    S.works.splice.apply(S.works, [at, 0].concat(made));
    S.sel = at; touch(); renderRow(); renderPanel();
    // one at a time (a big picture takes a lot of memory while it is resized)
    made.reduce(function (p, w) { return p.then(function () { return prepare(w); }); }, Promise.resolve());
  }
  async function prepare(w) {
    S.busy++; updateSave(); say("Preparing images…");
    var ok = true;
    try {
      var out = await processImage(w._file);
      w.width = out.width; w.height = out.height; w._pend = out; w._url = out.url;
      touch();
    } catch (e) {
      ok = false;
      if (w._new && !w._pend) { var i = S.works.indexOf(w); if (i >= 0) S.works.splice(i, 1); }   // a new work that never got its picture
      say("Couldn't read " + w._file.name + " (" + ((e && e.message) || e) + ")", "err");
    }
    delete w._busy; delete w._file; delete w._new;
    S.busy--; updateSave();
    if (S.sel >= S.works.length) S.sel = S.works.length - 1;
    renderRow(); renderPanel();
    if (ok && !S.busy && !S.saving) say("Unsaved changes");
    return ok;
  }

  /* ---------- pictures: resized in the browser, colour kept --------------------
     Two files per work: the row picture (up to 1200px tall) and, when the original is
     bigger, the zoom picture (up to 2400px on its long side). Drawn on a Display P3
     canvas where the browser has one, so wide-colour art keeps its colour; that is only
     used if the file it writes carries its colour profile, else sRGB. WebP where the
     browser can write it, else JPEG on the site's paper (JPEG has no transparency). */
  var P3 = (function () {
    try { return document.createElement("canvas").getContext("2d", { colorSpace: "display-p3" }).getContextAttributes().colorSpace === "display-p3"; }
    catch (e) { return false; }
  })();
  function fit(W, H, maxW, maxH) { var s = Math.min(1, maxW / W, maxH / H); return { w: Math.max(1, Math.round(W * s)), h: Math.max(1, Math.round(H * s)) }; }
  function toBlob(c, type, q) { return new Promise(function (res) { c.toBlob(res, type, q); }); }
  async function hasProfile(blob) {
    var b = new Uint8Array(await blob.slice(0, 8192).arrayBuffer()), s = "";
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return /ICCP|ICC_PROFILE|iCCP/.test(s);
  }
  async function draw(src, size, space) {
    var c = document.createElement("canvas"); c.width = size.w; c.height = size.h;
    var g = c.getContext("2d", { colorSpace: space });
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(src, 0, 0, size.w, size.h);
    var b = await toBlob(c, "image/webp", 0.9);
    if (b && b.type === "image/webp") return { blob: b, ext: "webp", space: space };
    var j = document.createElement("canvas"); j.width = size.w; j.height = size.h;
    var jg = j.getContext("2d", { colorSpace: space });
    jg.fillStyle = "#fffefc"; jg.fillRect(0, 0, size.w, size.h); jg.drawImage(c, 0, 0);
    return { blob: await toBlob(j, "image/jpeg", 0.92), ext: "jpg", space: space };
  }
  async function encode(src, size) {
    if (P3) {
      var out = await draw(src, size, "display-p3");
      if (out.blob && await hasProfile(out.blob)) return out;
    }
    return draw(src, size, "srgb");
  }
  async function processImage(file) {
    var bmp = await createImageBitmap(file);                    // decoded with its own colour profile
    try {
      var rowSize = fit(bmp.width, bmp.height, ROW_MAX * 4, ROW_MAX);
      var fullSize = fit(bmp.width, bmp.height, FULL_MAX, FULL_MAX);
      var row = await encode(bmp, rowSize);
      var full = fullSize.w > rowSize.w ? await encode(bmp, fullSize) : null;   // a small original needs no second file
      if (!row.blob || (full && !full.blob)) throw new Error("this browser couldn't save the picture");
      if (full && full.ext !== row.ext) full = null;
      return { row: row.blob, full: full ? full.blob : null, ext: row.ext, width: rowSize.w, height: rowSize.h, url: URL.createObjectURL(row.blob) };
    } finally { if (bmp.close) bmp.close(); }
  }

  /* ---------- dragging works, dropping files ------------------------------------ */
  function slotAt(x) {                                          // the gap a drop at x lands in
    var cards = ui.row.querySelectorAll(".w");
    for (var i = 0; i < cards.length; i++) { var r = cards[i].getBoundingClientRect(); if (x < r.left + r.width / 2) return i; }
    return cards.length;
  }
  function showMarker(at) {
    var m = S.marker, cards = ui.row.querySelectorAll(".w");
    if (!m || !cards.length) return;
    var x = at < cards.length ? cards[at].getBoundingClientRect().left - 12 : cards[cards.length - 1].getBoundingClientRect().right + 9;
    m.style.left = (x - ui.row.getBoundingClientRect().left + ui.row.scrollLeft) + "px";
    m.style.display = "block";
  }
  function hideMarker() { if (S.marker) S.marker.style.display = "none"; }
  var edge = { v: 0, raf: 0 };
  function edgeScroll(x) {
    var r = ui.row.getBoundingClientRect();
    edge.v = x < r.left + 70 ? -14 : x > r.right - 70 ? 14 : 0;
    if (edge.v && !edge.raf) edge.raf = requestAnimationFrame(edgeTick);
  }
  function edgeTick() {
    edge.raf = 0;
    if (!edge.v) return;
    ui.row.scrollLeft += edge.v;
    if (D && D.on) { D.to = slotAt(D.lx); showMarker(D.to); }
    edge.raf = requestAnimationFrame(edgeTick);
  }
  function edgeStop() { edge.v = 0; if (edge.raf) cancelAnimationFrame(edge.raf); edge.raf = 0; }

  var D = null;
  ui.row.addEventListener("pointerdown", function (e) {
    var c = e.target.closest(".w");
    if (!c || e.button !== 0 || S.saving) return;
    D = { i: +c.getAttribute("data-i"), x: e.clientX, y: e.clientY, lx: e.clientX, card: c, on: false, to: null };
  });
  window.addEventListener("pointermove", function (e) {
    if (!D) return;
    D.lx = e.clientX;
    if (!D.on) {
      if (Math.abs(e.clientX - D.x) + Math.abs(e.clientY - D.y) < 6 || S.works[D.i]._busy) return;
      D.on = true;
      D.card.classList.add("is-drag");
      var pic = D.card.querySelector(".pic"), r = pic.getBoundingClientRect();
      D.ghost = pic.cloneNode(true);
      D.ghost.className = "drag-ghost";
      D.ghost.style.width = r.width + "px"; D.ghost.style.height = r.height + "px";
      document.body.appendChild(D.ghost);
    }
    D.ghost.style.left = e.clientX + "px"; D.ghost.style.top = e.clientY + "px";
    D.to = slotAt(e.clientX); showMarker(D.to);
    edgeScroll(e.clientX);
  });
  window.addEventListener("pointerup", function () {
    if (!D) return;
    var d = D; D = null; edgeStop();
    if (!d.on) { select(d.i); return; }                         // a plain click picks the work
    d.ghost.remove(); d.card.classList.remove("is-drag"); hideMarker();
    var to = d.to > d.i ? d.to - 1 : d.to;                      // the gap index counts the dragged work itself
    if (to !== d.i) move(d.i, to); else select(d.i);
  });
  window.addEventListener("pointercancel", function () {
    if (D && D.on) { D.ghost.remove(); D.card.classList.remove("is-drag"); hideMarker(); }
    D = null; edgeStop();
  });
  ui.row.addEventListener("keydown", function (e) {
    var c = e.target.closest && e.target.closest(".w");
    if (!c) return;
    var i = +c.getAttribute("data-i");
    if (e.key === "Enter" || e.key === " ") select(i);
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      var d = e.key === "ArrowLeft" ? -1 : 1;
      if (e.altKey) move(i, i + d); else focusCard(i + d);       // Alt + arrow moves the work
    } else if (e.key === "Delete" || e.key === "Backspace") removeAt(i);
    else return;
    e.preventDefault();
  });
  function hasFiles(e) { return !!(e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0); }
  ui.row.addEventListener("dragover", function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "copy";
    ui.row.classList.add("is-drop");
    S.dropAt = slotAt(e.clientX); showMarker(S.dropAt);
  });
  ui.row.addEventListener("dragleave", function (e) {
    if (!ui.row.contains(e.relatedTarget)) { ui.row.classList.remove("is-drop"); hideMarker(); }
  });
  ui.row.addEventListener("drop", function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault(); ui.row.classList.remove("is-drop"); hideMarker();
    addFiles(e.dataTransfer.files, S.dropAt == null ? S.works.length : S.dropAt);
  });
  // a file dropped anywhere else must not open in the tab
  window.addEventListener("dragover", function (e) { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("drop", function (e) { if (hasFiles(e)) e.preventDefault(); });

  /* ---------- saving: one commit ------------------------------------------------ */
  function updateSave() {
    ui.save.disabled = !S.dirty || S.saving || S.busy > 0;
    ui.save.textContent = S.saving ? "Saving…" : "Save";
  }
  function touch() { S.dirty = true; updateSave(); if (!S.saving) say(S.busy ? "Preparing images…" : "Unsaved changes"); }

  async function upload(blob) { return (await gh("POST", REPO + "/git/blobs", { content: await blobB64(blob), encoding: "base64" })).sha; }
  async function commit(entries, message) {
    for (var attempt = 0; ; attempt++) {
      var head = (await gh("GET", REPO + "/git/ref/heads/" + BRANCH)).object.sha;
      var base = (await gh("GET", REPO + "/git/commits/" + head)).tree.sha;
      // only remove files the repository still has (deleting a missing path is an error)
      var have = {};
      ((await gh("GET", REPO + "/git/trees/" + base + "?recursive=1")).tree || []).forEach(function (t) { have[t.path] = true; });
      var list = entries.filter(function (t) { return t.sha !== null || have[t.path]; });
      var tree = (await gh("POST", REPO + "/git/trees", { base_tree: base, tree: list })).sha;
      var made = (await gh("POST", REPO + "/git/commits", { message: message, tree: tree, parents: [head] })).sha;
      try {
        await gh("PATCH", REPO + "/git/refs/heads/" + BRANCH, { sha: made, force: false });
        return made;
      } catch (e) {
        if (e.status !== 422 || attempt >= 3) throw e;            // Main moved on meanwhile: build on its new head
      }
    }
  }
  async function save() {
    if (S.saving || S.busy || !S.dirty) return;
    S.saving = true; updateSave();
    try {
      say("Checking the repository…");
      var now = null;
      try { now = (await gh("GET", REPO + "/contents/" + DATA + "?ref=" + BRANCH)).sha; } catch (e) { if (e.status !== 404) throw e; }
      if (now !== S.sha && !confirm("The works were changed somewhere else after you opened the console (another tab or device).\n\nSave anyway, replacing that version with this one?")) {
        say("Not saved. Reload the console to get the other version.", "err");
        return;
      }
      var entries = [], next = [], gone = S.removed.slice(), fresh = [];
      var count = S.works.filter(function (w) { return w._pend; }).length, n = 0;
      for (var i = 0; i < S.works.length; i++) {
        var w = S.works[i], o = { id: w.id, title: w.title.trim(), date: w.date.trim(), medium: w.medium.trim(), width: w.width, height: w.height };
        if (w._pend) {
          say("Uploading image " + (++n) + " of " + count + "…");
          var stem = DIR + newId(), p = w._pend;
          o.image = stem + "." + p.ext;
          entries.push({ path: o.image, mode: "100644", type: "blob", sha: await upload(p.row) });
          if (p.full) { o.full = stem + "-full." + p.ext; entries.push({ path: o.full, mode: "100644", type: "blob", sha: await upload(p.full) }); }
          if (w.image) gone.push(w.image);
          if (w.full) gone.push(w.full);
          fresh.push([w, o]);
        } else {
          if (w.image) o.image = w.image;
          if (w.full) o.full = w.full;
        }
        next.push(o);
      }
      var saveId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var json = JSON.stringify({ saveId: saveId, works: next }, null, 2) + "\n";
      var dataSha = (await gh("POST", REPO + "/git/blobs", { content: json, encoding: "utf-8" })).sha;
      entries.push({ path: DATA, mode: "100644", type: "blob", sha: dataSha });
      gone.forEach(function (path) { entries.push({ path: path, mode: "100644", type: "blob", sha: null }); });
      say("Saving…");
      await commit(entries, "Console: update the illustration works" + (count ? " (" + count + " new " + (count === 1 ? "image" : "images") + ")" : ""));
      // saved: the list now matches the repository
      fresh.forEach(function (pair) { var w = pair[0], o = pair[1]; w.image = o.image; if (o.full) w.full = o.full; else delete w.full; delete w._pend; });
      S.works.forEach(function (w) { w.title = w.title.trim(); w.date = w.date.trim(); w.medium = w.medium.trim(); });
      S.sha = dataSha; S.removed = []; S.dirty = false;
      renderRow(); renderPanel();
      say("Saved. Publishing to the site (about a minute)…");
      watchLive(saveId);
    } catch (e) {
      say("Not saved. " + why(e), "err");
    } finally {
      S.saving = false; updateSave();
    }
  }
  ui.save.addEventListener("click", save);
  // the Save is live once the site serves the list it wrote
  function watchLive(id) {
    S.watch = id;
    var t0 = Date.now();
    (function poll() {
      if (S.watch !== id) return;
      fetch(DATA + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (S.watch !== id) return;
        if (d && d.saveId === id) {
          ui.view.href = "illustration.html?t=" + Date.now();
          say("Live on the site ✓", "ok");
          return;
        }
        if (Date.now() - t0 > 6 * 60 * 1000) { say("Saved. GitHub is still publishing it; check the page again in a few minutes."); return; }
        setTimeout(poll, 4000);
      }, function () { setTimeout(poll, 6000); });
    })();
  }

  window.addEventListener("beforeunload", function (e) {
    if (S.dirty || S.saving || S.busy) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------- start --------------------------------------------------------------- */
  var stored = "";
  try { stored = localStorage.getItem(KEY) || ""; } catch (e) {}
  if (stored) { ui.login.hidden = true; signIn(stored, true); } else showLogin();
})();
