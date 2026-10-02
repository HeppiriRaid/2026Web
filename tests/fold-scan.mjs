/* ============================================================
   The outline check's pixel work, done in worker threads (one per core;
   tests/fold-check.mjs starts them): the screenshots decoded from PNG, then
   the fold test — the same test as ever, on the same pixels (CLAUDE.md,
   "Check it"):
   · folds(): every pixel where the plain shot runs smoothly across an edge
     (across and down only: a blurred edge blurs along both, while diagonals
     would mistake the corner where three flat colours meet for one) but the
     inverse shot dips DIP or more darker than both sides of it;
   · own(): for those pixels only, how much of each is a picture's own (1 =
     all of it), from the shots with the pictures hidden (bare) and painted
     black (black).
   ============================================================ */
import { parentPort, isMainThread } from "node:worker_threads";
import zlib from "node:zlib";

// a PNG as Chromium writes its screenshots: 8-bit RGB or RGBA, not interlaced -> RGBA
export function decode(png) {
  const buf = Buffer.from(png.buffer || png, png.byteOffset || 0, png.byteLength);
  let o = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString("ascii", o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9];
      if (d[8] !== 8 || d[12] !== 0) throw new Error("fold-scan: only 8-bit, non-interlaced PNGs");
    } else if (type === "IDAT") idat.push(d);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!bpp) throw new Error("fold-scan: PNG colour type " + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const at = y * (stride + 1), f = raw[at], s = raw.subarray(at + 1, at + 1 + stride);
    if (f === 0) cur.set(s);                                                  // (a Uint8Array wraps at 256, as PNG wants)
    else if (f === 1) { for (let i = 0; i < stride; i++) cur[i] = s[i] + (i >= bpp ? cur[i - bpp] : 0); }
    else if (f === 2) { for (let i = 0; i < stride; i++) cur[i] = s[i] + prev[i]; }
    else if (f === 3) { for (let i = 0; i < stride; i++) cur[i] = s[i] + (((i >= bpp ? cur[i - bpp] : 0) + prev[i]) >> 1); }
    else if (f === 4) {
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0, p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        cur[i] = s[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
    } else throw new Error("fold-scan: PNG filter " + f);
    if (bpp === 4) out.set(cur, y * w * 4);
    else for (let x = 0, q = y * w * 4, r = 0; x < w; x++, q += 4, r += 3) { out[q] = cur[r]; out[q + 1] = cur[r + 1]; out[q + 2] = cur[r + 2]; out[q + 3] = 255; }
    const t = prev; prev = cur; cur = t;
  }
  return { w, h, data: out };
}

const DIRS = [[1, 0], [0, 1], [2, 0], [0, 2]];
export function folds(plain, inverse, DIP) {
  const a = decode(plain), b = decode(inverse);
  if (a.w !== b.w || a.h !== b.h) throw new Error("fold-scan: the two shots differ in size");
  const W = a.w, H = a.h, P = a.data, L = b.data, P32 = new Uint32Array(P.buffer, P.byteOffset, W * H), out = [];
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = y * W + x;
    // (the plain shot flat both ways, two pixels out: no edge across this pixel, nothing to test)
    if (P32[i - 1] === P32[i + 1] && P32[i - 2] === P32[i + 2] && P32[i - W] === P32[i + W] && P32[i - 2 * W] === P32[i + 2 * W]) continue;
    const q = i * 4;
    let worst = 0, wx = 0, wy = 0;
    for (const [dx, dy] of DIRS) {
      const s = ((y - dy) * W + x - dx) * 4, e = ((y + dy) * W + x + dx) * 4;
      for (let k = 0; k < 3; k++) {
        const pa = P[s + k], pb = P[e + k], pq = P[q + k];
        if (Math.abs(pa - pb) < 24) continue;                                  // no edge across this pixel
        if (pq < Math.min(pa, pb) - 2 || pq > Math.max(pa, pb) + 2) continue;  // not a smooth edge (a thin line, say)
        const d = Math.min(L[s + k], L[e + k]) - L[q + k];                     // the inverse dips below both sides
        if (d > worst) { worst = d; wx = dx; wy = dy; }
      }
    }
    if (worst >= DIP) out.push([x, y, worst, wx, wy]);
  }
  return out;
}
export function own(bare, black, px) {
  const B = decode(bare), K = decode(black), W = B.w;
  return px.map(([x, y]) => {
    const q = (y * W + x) * 4;
    let m = 0;
    for (let k = 0; k < 3; k++) if (B.data[q + k] > 16) m = Math.max(m, (B.data[q + k] - K.data[q + k]) / B.data[q + k]);
    return Math.round(m * 100) / 100;
  });
}

if (!isMainThread) parentPort.on("message", (m) => {
  try {
    parentPort.postMessage({ id: m.id, result: m.op === "folds" ? folds(m.plain, m.inverse, m.DIP) : own(m.bare, m.black, m.px) });
  } catch (e) { parentPort.postMessage({ id: m.id, error: String(e && e.stack || e) }); }
});
