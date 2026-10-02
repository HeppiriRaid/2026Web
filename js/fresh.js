/* ============================================================
   KOKI TAKAMATSU — the owner's content, the moment it is saved
   The console (console.html) saves straight to the repository's Main branch,
   and GitHub Pages publishes a Save a minute or two later. So a page asks
   GitHub itself for its data file too (api.github.com: Main as it is now) and
   goes by GitHub's copy when it answers in time, else by the site's own. A
   picture the site's copy doesn't name yet (one the console has just added)
   comes straight from the repository (raw.githubusercontent.com) until the
   site has it as well.
   GitHub answers each visitor 60 such questions an hour; asking about a file
   that hasn't changed since their last look is free (the browser asks "changed
   since?" and gets "no"), and when GitHub can't answer, the site's own copy
   is used, a minute or two behind.
   ============================================================ */
(function () {
  "use strict";
  var REPO = "HeppiriRaid/2026Web", BRANCH = "Main", WAIT = 1500;   // ms GitHub has to answer
  var API = "https://api.github.com", RAW = "https://raw.githubusercontent.com/" + REPO + "/" + BRANCH + "/";
  // (the console's check stands in for GitHub: tests/console-check.mjs — only on this computer)
  if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname) && typeof window.__CONSOLE_TEST_API__ === "string") {
    API = window.__CONSOLE_TEST_API__; RAW = API + "/raw/";
  }
  function json(req) {
    return req.then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && typeof d === "object" ? d : null; }, function () { return null; });
  }
  // a data file: { data: the newest copy there is, site: the site's own (it says which pictures the site has) }
  function fetchNew(file) {
    if (!window.fetch) return Promise.resolve({ data: null, site: null });
    var site = json(fetch(file + "?t=" + Date.now(), { cache: "no-store" }));
    var hub = json(fetch(API + "/repos/" + REPO + "/contents/" + file + "?ref=" + BRANCH,
      { cache: "no-cache", headers: { Accept: "application/vnd.github.raw+json" } }));
    var late = new Promise(function (res) { setTimeout(function () { res(null); }, WAIT); });
    return Promise.all([site, Promise.race([hub, late])]).then(function (r) { return { data: r[1] || r[0], site: r[0] }; });
  }
  // …or the copy the last page fetched for this one on the way here (hand(), good for 15 s)
  function get(file) {
    try {
      var k = "kt-data:" + file, s = JSON.parse(sessionStorage.getItem(k) || "null");
      sessionStorage.removeItem(k);
      if (s && Date.now() - s.t < 15000 && s.data) return Promise.resolve({ data: s.data, site: s.site || null });
    } catch (e) {}
    return fetchNew(file);
  }
  // fetched for the next page while the white sheet covers this one (js/wipe.js): it arrives to find it
  function hand(file) {
    return fetchNew(file).then(function (r) {
      try { if (r.data) sessionStorage.setItem("kt-data:" + file, JSON.stringify({ t: Date.now(), data: r.data, site: r.site })); } catch (e) {}
      return r;
    });
  }
  // a picture's address: its own on the site, or the repository's while the site doesn't have it yet
  // (only the console's own uploads can be missing there: everything else ships with the pages)
  function url(path, site) {
    if (typeof path !== "string" || !/^assets\/img\/(front|illustration)\//.test(path)) return path;
    return site && JSON.stringify(site).indexOf(JSON.stringify(path)) >= 0 ? path : RAW + path;
  }
  // (a picture from the repository is another site's: asked for with CORS, so its pixels can be read)
  function put(img, path, site) {
    var src = url(path, site);
    if (src !== path) img.crossOrigin = "anonymous";
    if (img.getAttribute("src") !== src) img.src = src;
  }
  window.__fresh = { get: get, hand: hand, url: url, put: put };
})();
