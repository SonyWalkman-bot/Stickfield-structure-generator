/* Stickfield — core math helpers (vectors, RNG, polylines, frames, small eigen) */
var SF = (typeof window !== 'undefined') ? (window.SF = window.SF || {}) : (globalThis.SF = globalThis.SF || {});

SF.M = (function () {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  const dist = (a, b) => { const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); };
  const norm = (a) => { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

  // Rodrigues rotation of v about unit axis k
  function rotAxis(v, k, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const kv = cross(k, v), kd = dot(k, v) * (1 - c);
    return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
  }
  // any unit vector perpendicular to v
  function perp(v) {
    const a = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return norm(cross(v, a));
  }

  // mulberry32 seeded RNG with helpers
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (lo, hi) => lo + (hi - lo) * f();
    f.normal = () => { let u = 0; while (u === 0) u = f(); const v = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    f.int = (n) => Math.floor(f() * n);
    return f;
  }

  // ---------- polylines (arrays of [x,y,z]) ----------
  function cumlen(pts) {
    const c = new Float64Array(pts.length);
    for (let i = 1; i < pts.length; i++) c[i] = c[i - 1] + dist(pts[i], pts[i - 1]);
    return c;
  }
  function locate(cum, s) { // index i such that cum[i] <= s <= cum[i+1]
    let lo = 0, hi = cum.length - 1;
    if (s <= 0) return 0;
    if (s >= cum[hi]) return Math.max(0, hi - 1);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    return lo;
  }
  function pointAt(pts, cum, s) {
    const n = pts.length; if (n === 1) return pts[0].slice();
    const i = locate(cum, s); const d = cum[i + 1] - cum[i];
    const t = d > 1e-12 ? clamp((s - cum[i]) / d, 0, 1) : 0;
    return lerp3(pts[i], pts[i + 1], t);
  }
  function tangentAt(pts, cum, s) {
    const n = pts.length; if (n < 2) return [1, 0, 0];
    const i = locate(cum, s);
    return norm(sub(pts[Math.min(n - 1, i + 1)], pts[i]));
  }
  function resample(pts, ds) {
    const cum = cumlen(pts); const L = cum[cum.length - 1];
    if (L < 1e-9) return [pts[0].slice()];
    const n = Math.max(1, Math.round(L / ds)); const step = L / n; const out = [];
    for (let k = 0; k <= n; k++) out.push(pointAt(pts, cum, Math.min(L, k * step)));
    return out;
  }
  function subPolyline(pts, cum, s0, s1) { // portion between arc params
    const out = [pointAt(pts, cum, s0)];
    for (let i = 0; i < pts.length; i++) if (cum[i] > s0 + 1e-9 && cum[i] < s1 - 1e-9) out.push(pts[i].slice());
    out.push(pointAt(pts, cum, s1));
    return out;
  }
  function smoothPolyline(pts, iters, lam, fixStart = true, fixEnd = true) {
    let p = pts.map((q) => q.slice());
    for (let it = 0; it < iters; it++) {
      const q = p.map((r) => r.slice());
      for (let i = 1; i < p.length - 1; i++) {
        for (let c = 0; c < 3; c++) q[i][c] = p[i][c] + lam * ((p[i - 1][c] + p[i + 1][c]) * 0.5 - p[i][c]);
      }
      if (!fixStart && p.length > 2) for (let c = 0; c < 3; c++) q[0][c] = p[0][c] + lam * 0.5 * (p[1][c] - p[0][c]);
      if (!fixEnd && p.length > 2) { const n = p.length - 1; for (let c = 0; c < 3; c++) q[n][c] = p[n][c] + lam * 0.5 * (p[n - 1][c] - p[n][c]); }
      p = q;
    }
    return p;
  }
  // discrete curvature via circumcircle with stencil k
  function curvature(pts, k = 2) {
    const n = pts.length, out = new Float64Array(n);
    if (n < 3) return out;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - k), b = Math.min(n - 1, i + k);
      let m = i; if (m === a) m = Math.min(n - 1, a + 1); if (m === b) m = Math.max(0, b - 1);
      if (a === m || b === m || a === b) { out[i] = 0; continue; }
      const A = pts[a], B = pts[m], C = pts[b];
      const ab = dist(A, B), bc = dist(B, C), ca = dist(C, A);
      const cr = len(cross(sub(B, A), sub(C, A)));
      out[i] = (ab * bc * ca) > 1e-12 ? (2 * cr) / (ab * bc * ca) : 0;
    }
    // light smoothing
    const sm = new Float64Array(n);
    for (let i = 0; i < n; i++) { const a = out[Math.max(0, i - 1)], b = out[i], c = out[Math.min(n - 1, i + 1)]; sm[i] = (a + 2 * b + c) / 4; }
    return sm;
  }

  // symmetric 3x3 eigen decomposition (Jacobi). Returns {values:[3], vectors:[[3],[3],[3]]} sorted ascending
  function eigSym3(A) {
    const a = [[A[0][0], A[0][1], A[0][2]], [A[1][0], A[1][1], A[1][2]], [A[2][0], A[2][1], A[2][2]]];
    const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 32; sweep++) {
      const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
      if (off < 1e-14) break;
      for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-18) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
      }
    }
    const vals = [a[0][0], a[1][1], a[2][2]];
    const idx = [0, 1, 2].sort((i, j) => vals[i] - vals[j]);
    return { values: idx.map((i) => vals[i]), vectors: idx.map((i) => [v[0][i], v[1][i], v[2][i]]) };
  }
  // best-fit plane of points: {c, n, dev (max abs distance), axes:[u,v]}
  function fitPlane(pts) {
    const n = pts.length; const c = [0, 0, 0];
    for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    c[0] /= n; c[1] /= n; c[2] /= n;
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of pts) { const d = sub(p, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
    const e = eigSym3(C);
    const nrm = norm(e.vectors[0]); const u = norm(e.vectors[2]); const v = norm(cross(nrm, u));
    let dev = 0; for (const p of pts) dev = Math.max(dev, Math.abs(dot(sub(p, c), nrm)));
    return { c, n: nrm, u, v, dev };
  }
  // rotation-minimising frames (double reflection, Wang et al. 2008). Initial normal: in best-fit plane.
  function frames(pts, n0hint) {
    const n = pts.length; const T = [], N = [], B = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let t = norm(sub(b, a)); if (len(t) < 0.5) t = [1, 0, 0];
      T.push(t);
    }
    let r0;
    if (n0hint) r0 = norm(sub(n0hint, mul(T[0], dot(n0hint, T[0]))));
    if (!r0 || len(r0) < 0.5) {
      const pl = n > 2 ? fitPlane(pts) : null;
      if (pl && pl.dev < 1e9) { r0 = norm(cross(pl.n, T[0])); }
      if (!r0 || len(r0) < 0.5) r0 = perp(T[0]);
    }
    N.push(r0); B.push(norm(cross(T[0], r0)));
    for (let i = 0; i < n - 1; i++) {
      const v1 = sub(pts[i + 1], pts[i]); const c1 = dot(v1, v1);
      if (c1 < 1e-16) { N.push(N[i].slice()); B.push(B[i].slice()); continue; }
      const rL = sub(N[i], mul(v1, (2 / c1) * dot(v1, N[i])));
      const tL = sub(T[i], mul(v1, (2 / c1) * dot(v1, T[i])));
      const v2 = sub(T[i + 1], tL); const c2 = dot(v2, v2);
      let r = c2 < 1e-16 ? rL : sub(rL, mul(v2, (2 / c2) * dot(v2, rL)));
      r = norm(sub(r, mul(T[i + 1], dot(r, T[i + 1]))));
      N.push(r); B.push(norm(cross(T[i + 1], r)));
    }
    return { T, N, B };
  }

  // complete elliptic integrals K(k), E(k) via AGM (k = modulus)
  function ellipKE(k) {
    let a = 1, b = Math.sqrt(1 - k * k), sum = 0.5 * k * k, pow2 = 0.5;
    for (let i = 0; i < 40; i++) {
      const an = (a + b) / 2, bn = Math.sqrt(a * b), cn = (a - b) / 2;
      pow2 *= 2; sum += pow2 * cn * cn; a = an; b = bn;
      if (Math.abs(cn) < 1e-15) break;
    }
    const K = Math.PI / (2 * a);
    return { K, E: K * (1 - sum) };
  }
  // Planar pinned-pinned elastica with arc length L and chord S (S<L). Returns {pts2d:[[x,y]], kmax, H, theta0}
  function elastica(L, S, nseg = 80) {
    const r = clamp(S / L, 0.02, 0.9999);
    // S/L = 2E(k)/K(k) - 1 ; solve for k by bisection (monotone decreasing in k)
    let lo = 1e-6, hi = 0.999999;
    for (let it = 0; it < 80; it++) {
      const m = (lo + hi) / 2; const ke = ellipKE(m); const f = 2 * ke.E / ke.K - 1;
      if (f > r) lo = m; else hi = m;
    }
    const k = (lo + hi) / 2; const ke = ellipKE(k);
    const lam = Math.pow(2 * ke.K / L, 2); const th0 = 2 * Math.asin(k);
    // integrate theta'' = -lam sin(theta), theta(0)=th0, theta'(0)=0
    const h = L / nseg; let th = th0, w = 0, x = 0, y = 0; const pts2d = [[0, 0]];
    const f = (t) => -lam * Math.sin(t);
    for (let i = 0; i < nseg; i++) {
      // RK4 on (th, w) and position
      const k1t = w, k1w = f(th);
      const k2t = w + 0.5 * h * k1w, k2w = f(th + 0.5 * h * k1t);
      const k3t = w + 0.5 * h * k2w, k3w = f(th + 0.5 * h * k2t);
      const k4t = w + h * k3w, k4w = f(th + h * k3t);
      const thN = th + (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
      const wN = w + (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
      const thm = th + 0.5 * h * k1t;
      x += (h / 6) * (Math.cos(th) + 4 * Math.cos(thm) + Math.cos(thN));
      y += (h / 6) * (Math.sin(th) + 4 * Math.sin(thm) + Math.sin(thN));
      th = thN; w = wN; pts2d.push([x, y]);
    }
    return { pts2d, kmax: 2 * k * Math.sqrt(lam), H: 2 * k / Math.sqrt(lam), theta0: th0 };
  }

  // Ramer–Douglas–Peucker for 2D polylines [[x,y],...]
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop(); let idx = -1, dmax = 0;
      const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
      const dx = bx - ax, dy = by - ay, dd = Math.hypot(dx, dy) || 1e-12;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / dd;
        if (d > dmax) { dmax = d; idx = i; }
      }
      if (dmax > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  return { clamp, lerp, smooth, add, sub, mul, dot, cross, len, dist, norm, lerp3, madd, rotAxis, perp, rng,
    cumlen, locate, pointAt, tangentAt, resample, subPolyline, smoothPolyline, curvature, eigSym3, fitPlane, frames,
    ellipKE, elastica, rdp };
})();
