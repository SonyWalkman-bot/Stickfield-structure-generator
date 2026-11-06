/* Stickfield — formwork v2 for aggregation: ground pole loops, hoops (openings), arches, posts and drawn curves.
   Resolves elements to polylines, answers nearest-element queries (for formwork-driven flows and growth limits),
   and holds the layout presets. */
SF.Formwork = (function () {
  'use strict';
  const M = SF.M;
  const D2R = Math.PI / 180;
  const POLE_Y = 0.035;
  const TYPES = {
    ground: { label: 'Ground poles', short: 'Ground' },
    hoop: { label: 'Hoop (opening)', short: 'Hoop' },
    arch: { label: 'Arch', short: 'Arch' },
    post: { label: 'Post', short: 'Post' },
    curve: { label: 'Drawn curve', short: 'Curve' }
  };

  function densify(pts, ds) {
    const out = [pts[0].slice()];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]; const L = M.dist(a, b); const n = Math.max(1, Math.ceil(L / ds));
      for (let k = 1; k <= n; k++) out.push(M.lerp3(a, b, k / n));
    }
    return out;
  }
  function hoopBasis(el) {
    const az = (el.az || 0) * D2R, elv = (el.el || 0) * D2R;
    const n = [Math.cos(elv) * Math.sin(az), Math.sin(elv), Math.cos(elv) * Math.cos(az)];
    let u = M.cross([0, 1, 0], n); if (M.len(u) < 1e-6) u = [1, 0, 0]; u = M.norm(u);
    const v = M.norm(M.cross(n, u));
    return { n, u, v };
  }
  // keep the part of a closed loop that is above the ground: the longest run, landing exactly on y = 0
  function clipLoop(pts) {
    const n = pts.length - 1; // last == first
    if (pts.every((p) => p[1] >= 0)) return { pts, closed: true };
    let s0 = 0; while (s0 < n && pts[s0][1] >= 0) s0++;
    const cross = (a, b) => { const t = a[1] / (a[1] - b[1]); return [a[0] + (b[0] - a[0]) * t, 0, a[2] + (b[2] - a[2]) * t]; };
    const runs = []; let cur = [];
    for (let k = 1; k <= n; k++) {
      const i = (s0 + k) % n, prev = pts[(i - 1 + n) % n], p = pts[i];
      if (p[1] >= 0) { if (!cur.length) cur.push(cross(prev, p)); cur.push(p.slice()); }
      else if (cur.length) { cur.push(cross(prev, p)); runs.push(cur); cur = []; }
    }
    if (cur.length > 1) runs.push(cur);
    if (!runs.length) return { pts: [], closed: false };
    runs.sort((a, b) => M.cumlen(b).slice(-1)[0] - M.cumlen(a).slice(-1)[0]);
    return { pts: runs[0], closed: false };
  }

  function resolve(el) {
    let pts = [], closed = false, ground = false;
    if (el.type === 'ground') {
      const P = (el.pts || []).map((q) => [q[0], POLE_Y, q[1]]); if (P.length < 2) return null;
      closed = !!el.closed && P.length > 2; if (closed) P.push(P[0].slice());
      pts = densify(P, 0.1); ground = true;
    } else if (el.type === 'hoop') {
      const b = hoopBasis(el); const r = Math.max(0.2, el.r || 1); const n = Math.max(24, Math.ceil(2 * Math.PI * r / 0.1));
      const loop = []; for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI - Math.PI / 2; loop.push(M.add(el.c, M.add(M.mul(b.u, r * Math.cos(a)), M.mul(b.v, r * Math.sin(a))))); }
      loop[n] = loop[0].slice();
      const c = clipLoop(loop); pts = c.pts; closed = c.closed;
      if (closed) { for (const p of pts) if (p[1] < 0.02) p[1] = Math.max(p[1], 0.0); }
    } else if (el.type === 'arch') {
      const A = [el.a[0], 0, el.a[1]], B = [el.b[0], 0, el.b[1]]; const ch = M.sub(B, A); const c = M.len(ch); if (c < 0.3) return null;
      const ex = M.mul(ch, 1 / c); const up = M.rotAxis([0, 1, 0], ex, (el.lean || 0) * D2R); const rise = Math.max(0.3, el.rise || 2);
      // the shape a bent pole takes between two feet: a pinned elastica with this chord and rise
      const target = Math.min(1.6, rise / c); let lo = 1.0005, hi = 12;
      for (let it = 0; it < 36; it++) { const m = (lo + hi) / 2; const e = M.elastica(m * c, c, 48); const xe = e.pts2d[e.pts2d.length - 1][0]; if (e.H / Math.max(1e-6, xe) < target) lo = m; else hi = m; }
      const n = Math.max(24, Math.ceil((c + 2 * rise) / 0.1)); const e = M.elastica(hi * c, c, n); const sc = c / e.pts2d[e.pts2d.length - 1][0];
      for (const q of e.pts2d) pts.push(M.add(M.add(A, M.mul(ex, q[0] * sc)), M.mul(up, Math.max(0, q[1] * sc))));
      pts[0] = A.slice(); pts[pts.length - 1] = B.slice();
    } else if (el.type === 'post') {
      const A = [el.a[0], 0, el.a[1]]; const az = (el.az || 0) * D2R, ln = (el.lean || 0) * D2R; const h = Math.max(0.4, el.h || 2);
      const dir = [Math.sin(ln) * Math.sin(az), Math.cos(ln), Math.sin(ln) * Math.cos(az)];
      pts = densify([A, M.madd(A, dir, h)], 0.1);
    } else if (el.type === 'curve') {
      if (!el.pts || el.pts.length < 2) return null; pts = M.resample(el.pts.map((q) => q.slice(0, 3)), 0.1);
    } else return null;
    if (pts.length < 2) return null;
    return { pts, closed, ground };
  }

  // ---------- model ----------
  function key(els) { return JSON.stringify(els); }
  function build(els, opts) {
    opts = opts || {};
    const items = [];
    (els || []).forEach((el, i) => {
      const r = resolve(el); if (!r) return;
      items.push(Object.assign(r, { el, i, id: el.id || ('f' + (i + 1)), type: el.type, label: label(el, i), keep: el.type === 'ground' ? true : el.keep !== false,
        open: el.type === 'hoop' && el.open !== false && r.closed, hoop: el.type === 'hoop' ? Object.assign({ c: el.c.slice(), r: el.r }, hoopBasis(el)) : null }));
    });
    // query segments at ~0.2 m
    const sx = [], el = [], tang = [];
    items.forEach((it, k) => {
      const q = M.resample(it.pts, 0.2); it.q = q;
      for (let i = 0; i < q.length - 1; i++) { sx.push(q[i][0], q[i][1], q[i][2], q[i + 1][0], q[i + 1][1], q[i + 1][2]); el.push(k); const t = M.norm(M.sub(q[i + 1], q[i])); tang.push(t[0], t[1], t[2]); }
    });
    const S = new Float64Array(sx), SE = Int32Array.from(el), ST = new Float64Array(tang); const nseg = SE.length;
    let lo = [1e9, 0, 1e9], hi = [-1e9, 0, -1e9], cx = 0, cz = 0, cn = 0, top = 0;
    for (const it of items) for (const p of it.pts) { for (const c of [0, 2]) { lo[c] = Math.min(lo[c], p[c]); hi[c] = Math.max(hi[c], p[c]); } top = Math.max(top, p[1]); cx += p[0]; cz += p[2]; cn++; }
    if (!cn) { lo = [-3, 0, -3]; hi = [3, 0, 3]; }
    hi[1] = top;
    const centroid = cn ? [cx / cn, cz / cn] : [0, 0];
    const FW = { items, S, SE, ST, nseg, lo, hi, top: Math.max(1, top), centroid, key: key(els) };
    FW.pseudoTri = { c: centroid, V: [[centroid[0], centroid[1] + 1], [centroid[0] - 1, centroid[1] - 0.5], [centroid[0] + 1, centroid[1] - 0.5]] };
    FW.grounds = items.filter((it) => it.ground);
    if (!opts.light) buildCand(FW, opts.margin == null ? 4 : opts.margin); // light builds are for drawing only (no nearest queries)
    return FW;
  }

  // per-cell candidate segment lists so nearest queries look at a handful of segments
  function buildCand(FW, margin) {
    const cs = 0.5; const nseg = FW.nseg; const S = FW.S, SE = FW.SE; const nEl = FW.items.length;
    const min = [Math.floor((FW.lo[0] - margin) / cs) * cs, 0, Math.floor((FW.lo[2] - margin) / cs) * cs];
    const max = [FW.hi[0] + margin, FW.top + margin, FW.hi[2] + margin];
    const nx = Math.ceil((max[0] - min[0]) / cs) + 1, ny = Math.ceil((max[1] - min[1]) / cs) + 1, nz = Math.ceil((max[2] - min[2]) / cs) + 1;
    const hd = cs * Math.sqrt(3) / 2;
    const start = new Int32Array(nx * ny * nz + 1); const lists = [];
    const dEl = new Float64Array(nEl); const dSeg = new Float64Array(nseg);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = i + nx * (j + ny * k); start[c] = lists.length;
      if (!nseg) continue;
      const px = min[0] + (i + 0.5) * cs, py = min[1] + (j + 0.5) * cs, pz = min[2] + (k + 0.5) * cs;
      dEl.fill(1e9);
      for (let s = 0; s < nseg; s++) { const d = segDist(S, s, px, py, pz); dSeg[s] = d; const e = SE[s]; if (d < dEl[e]) dEl[e] = d; }
      let d1 = 1e9, d2 = 1e9; for (let e = 0; e < nEl; e++) { const d = dEl[e]; if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
      if (d2 > 1e8) d2 = d1;
      const lim = d2 + 2 * hd;
      for (let s = 0; s < nseg; s++) { const e = SE[s]; if (dEl[e] > lim) continue; if (dSeg[s] <= dEl[e] + 2 * hd) lists.push(s); }
    }
    start[nx * ny * nz] = lists.length;
    FW.cand = { cs, min, nx, ny, nz, start, list: Int32Array.from(lists) };
  }
  function segDist(S, s, px, py, pz) {
    const o = 6 * s; const ax = S[o], ay = S[o + 1], az = S[o + 2]; const dx = S[o + 3] - ax, dy = S[o + 4] - ay, dz = S[o + 5] - az;
    const l2 = dx * dx + dy * dy + dz * dz; let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - px, qy = ay + dy * t - py, qz = az + dz * t - pz; return Math.sqrt(qx * qx + qy * qy + qz * qz);
  }
  // nearest point on the nearest element and on the second-nearest (different) element
  const NQ = { d1: 1e9, d2: 1e9, e1: -1, e2: -1, q1: [0, 0, 0], q2: [0, 0, 0], t1: [1, 0, 0], t2: [1, 0, 0] };
  function nearest2(FW, x, y, z, out) {
    out = out || NQ; out.d1 = out.d2 = 1e9; out.e1 = out.e2 = -1;
    if (!FW.nseg) return out;
    const C = FW.cand; let i = Math.floor((x - C.min[0]) / C.cs), j = Math.floor((y - C.min[1]) / C.cs), k = Math.floor((z - C.min[2]) / C.cs);
    i = i < 0 ? 0 : i >= C.nx ? C.nx - 1 : i; j = j < 0 ? 0 : j >= C.ny ? C.ny - 1 : j; k = k < 0 ? 0 : k >= C.nz ? C.nz - 1 : k;
    const c = i + C.nx * (j + C.ny * k); const S = FW.S, SE = FW.SE, ST = FW.ST;
    for (let p = C.start[c]; p < C.start[c + 1]; p++) {
      const s = C.list[p]; const o = 6 * s; const ax = S[o], ay = S[o + 1], az = S[o + 2]; const dx = S[o + 3] - ax, dy = S[o + 4] - ay, dz = S[o + 5] - az;
      const l2 = dx * dx + dy * dy + dz * dz; let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t, qy = ay + dy * t, qz = az + dz * t; const d = Math.sqrt((qx - x) * (qx - x) + (qy - y) * (qy - y) + (qz - z) * (qz - z)); const e = SE[s];
      if (e === out.e1) { if (d < out.d1) { out.d1 = d; set(out.q1, qx, qy, qz); set(out.t1, ST[3 * s], ST[3 * s + 1], ST[3 * s + 2]); } }
      else if (d < out.d1) { out.d2 = out.d1; out.e2 = out.e1; out.q2[0] = out.q1[0]; out.q2[1] = out.q1[1]; out.q2[2] = out.q1[2]; out.t2[0] = out.t1[0]; out.t2[1] = out.t1[1]; out.t2[2] = out.t1[2];
        out.d1 = d; out.e1 = e; set(out.q1, qx, qy, qz); set(out.t1, ST[3 * s], ST[3 * s + 1], ST[3 * s + 2]); }
      else if (e === out.e2) { if (d < out.d2) { out.d2 = d; set(out.q2, qx, qy, qz); set(out.t2, ST[3 * s], ST[3 * s + 1], ST[3 * s + 2]); } }
      else if (d < out.d2) { out.d2 = d; out.e2 = e; set(out.q2, qx, qy, qz); set(out.t2, ST[3 * s], ST[3 * s + 1], ST[3 * s + 2]); }
    }
    return out;
  }
  function set(a, x, y, z) { a[0] = x; a[1] = y; a[2] = z; }
  function distTo(FW, x, y, z) { return nearest2(FW, x, y, z).d1; }

  // point-in-polygon on the ground plane, for closed ground loops
  function insideGround(FW, x, z) {
    for (const it of FW.grounds) {
      if (!it.closed) continue; const P = it.el.pts; let inside = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1] + 1e-12) + a[0]) inside = !inside; }
      if (inside) return true;
    }
    return false;
  }
  function nearGround(FW, x, z, r) {
    for (const it of FW.grounds) { const q = it.q || it.pts; for (let i = 0; i < q.length - 1; i++) { const a = q[i], b = q[i + 1]; const dx = b[0] - a[0], dz = b[2] - a[2]; const l2 = dx * dx + dz * dz; let t = l2 > 0 ? ((x - a[0]) * dx + (z - a[2]) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t)); if (Math.hypot(a[0] + dx * t - x, a[2] + dz * t - z) < r) return true; } }
    return false;
  }

  // ---------- formwork-driven base flows ----------
  const NQf = { d1: 1e9, d2: 1e9, e1: -1, e2: -1, q1: [0, 0, 0], q2: [0, 0, 0], t1: [1, 0, 0], t2: [1, 0, 0] };
  function flow(FW, preset, x, y, z, out) {
    out[0] = out[1] = out[2] = 0;
    if (preset === 'none') return 0;
    const top = FW.top; const h01 = Math.min(1, Math.max(0, y / Math.max(1, top)));
    const cx = x - FW.centroid[0], cz = z - FW.centroid[1]; const cl = Math.hypot(cx, cz) || 1e-6; const ox = cx / cl, oz = cz / cl;
    let vx = 0, vy = 0, vz = 0, m = 1;
    if (preset === 'rise') { vx = -ox * (0.25 + 0.9 * h01); vy = 1.1 - h01; vz = -oz * (0.25 + 0.9 * h01); }
    else if (preset === 'swirl') { vx = -oz - ox * 0.15; vy = 0.45 * (1 - h01) + 0.05; vz = ox - oz * 0.15; }
    else if (preset === 'radial') { vx = ox; vy = 0.35 - 0.6 * h01; vz = oz; }
    else {
      if (!FW.nseg) return 0;
      const q = nearest2(FW, x, y, z, NQf);
      if (preset === 'span') {
        if (q.e2 < 0) { vx = -ox * 0.3; vy = 1; vz = -oz * 0.3; }
        else { vx = q.q2[0] - q.q1[0]; vy = q.q2[1] - q.q1[1]; vz = q.q2[2] - q.q1[2]; const l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy = vy / l + 0.15; vz /= l; }
      } else if (preset === 'wrap') {
        let rx = x - q.q1[0], ry = y - q.q1[1], rz = z - q.q1[2]; let rl = Math.hypot(rx, ry, rz);
        const t = q.t1;
        if (rl < 1e-4) { const pp = M.perp(t); rx = pp[0]; ry = pp[1]; rz = pp[2]; rl = 1; }
        rx /= rl; ry /= rl; rz /= rl;
        vx = t[1] * rz - t[2] * ry; vy = t[2] * rx - t[0] * rz; vz = t[0] * ry - t[1] * rx; // poloidal: around the element
        vx += t[0] * 1.15; vy += t[1] * 1.15; vz += t[2] * 1.15; // strands that twist along the member rather than loop round it
        m = 1 / (1 + Math.pow(q.d1 / 1.0, 4));
      } else if (preset === 'along') {
        const w1 = 1 / Math.pow(q.d1 + 0.3, 2), w2 = q.e2 >= 0 ? 1 / Math.pow(q.d2 + 0.3, 2) : 0;
        let s2 = (q.t1[0] * q.t2[0] + q.t1[1] * q.t2[1] + q.t1[2] * q.t2[2]) < 0 ? -1 : 1;
        vx = q.t1[0] * w1 + q.t2[0] * w2 * s2; vy = q.t1[1] * w1 + q.t2[1] * w2 * s2; vz = q.t1[2] * w1 + q.t2[2] * w2 * s2;
        m = 1 / (1 + Math.pow(q.d1 / 1.5, 4));
      } else return 0;
    }
    const l = Math.hypot(vx, vy, vz) || 1; out[0] = vx / l * m; out[1] = vy / l * m; out[2] = vz / l * m;
    return m;
  }

  function label(el, i) { return (TYPES[el.type] ? TYPES[el.type].short : 'Element') + ' ' + (i + 1); }

  // ---------- presets ----------
  const r3 = (v) => Math.round(v * 1000) / 1000;
  function polygon(n, R, phase, jitter, seed) {
    const rnd = M.rng(seed || 3); const out = [];
    for (let i = 0; i < n; i++) { const a = phase + i / n * 2 * Math.PI; const rr = R * (1 + (jitter ? (rnd() - 0.5) * jitter : 0)); out.push([r3(rr * Math.cos(a)), r3(rr * Math.sin(a))]); }
    return out;
  }
  const PRESETS = [
    { id: 'grotto', label: 'Grotto: ground loop, three openings, an arch', els: () => [
      { id: 'g1', type: 'ground', closed: true, pts: [[-4.2, -2.6], [-1.2, -4.4], [3.2, -3.6], [4.6, -0.4], [2.8, 3.4], [-1.6, 4.2], [-4.6, 1.2]] },
      { id: 'h1', type: 'hoop', c: [-1.9, 0.95, -1.5], r: 1.3, az: 225, el: 12, keep: true, open: true },
      { id: 'h2', type: 'hoop', c: [2.3, 0.72, 0.5], r: 1.12, az: 70, el: 24, keep: true, open: true },
      { id: 'h3', type: 'hoop', c: [-0.5, 2.85, 1.7], r: 0.8, az: 10, el: 62, keep: true, open: true },
      { id: 'a1', type: 'arch', a: [0.6, -3.9], b: [4.1, -1.4], rise: 2.3, lean: -14, keep: true }
    ] },
    { id: 'nest', label: 'Nest: two crossing hoops over a small loop', els: () => [
      { id: 'g1', type: 'ground', closed: true, pts: polygon(6, 2.6, 0.3, 0.35, 5) },
      { id: 'h1', type: 'hoop', c: [-0.3, 1.1, 0], r: 1.55, az: 0, el: 22, keep: true, open: true },
      { id: 'h2', type: 'hoop', c: [0.5, 0.9, 0.3], r: 1.25, az: 95, el: -18, keep: true, open: true }
    ] },
    { id: 'tunnel', label: 'Tunnel: three portal arches between two pole lines', els: () => [
      { id: 'g1', type: 'ground', closed: false, pts: [[-5.2, -1.9], [-1.6, -2.3], [1.8, -2.0], [5.2, -2.4]] },
      { id: 'g2', type: 'ground', closed: false, pts: [[-5.2, 1.9], [-1.8, 2.2], [1.6, 2.0], [5.2, 2.3]] },
      { id: 'a1', type: 'arch', a: [-3.6, -2.1], b: [-3.6, 2.1], rise: 2.5, lean: 0, keep: true },
      { id: 'a2', type: 'arch', a: [0.1, -2.15], b: [0.0, 2.1], rise: 3.0, lean: 12, keep: true },
      { id: 'a3', type: 'arch', a: [3.6, -2.2], b: [3.7, 2.15], rise: 2.3, lean: -8, keep: true }
    ] },
    { id: 'twin', label: 'Twin hoops standing on the ground', els: () => [
      { id: 'g1', type: 'ground', closed: true, pts: [[-4.4, -1.8], [-1.0, -2.9], [3.6, -2.2], [4.6, 0.8], [1.2, 2.9], [-3.4, 2.4]] },
      { id: 'h1', type: 'hoop', c: [-1.7, 1.55, -0.1], r: 1.8, az: 95, el: 0, keep: true, open: true },
      { id: 'h2', type: 'hoop', c: [1.9, 1.1, 0.3], r: 1.5, az: 60, el: 18, keep: true, open: true }
    ] },
    { id: 'posts', label: 'Spiral of temporary posts in a pole ring', els: () => {
      const out = [{ id: 'g1', type: 'ground', closed: true, pts: polygon(9, 4.0, 0.2, 0.15, 11) }];
      for (let i = 0; i < 5; i++) { const a = 0.4 + i * 1.2; const rr = 2.6 - i * 0.35; out.push({ id: 'p' + (i + 1), type: 'post', a: [r3(rr * Math.cos(a)), r3(rr * Math.sin(a))], h: r3(1.6 + i * 0.45), lean: 14, az: r3((a * 180 / Math.PI + 180) % 360), keep: false }); }
      return out;
    } },
    { id: 'triangle', label: 'Pole triangle only', els: () => [
      { id: 'g1', type: 'ground', closed: true, pts: [[0, 5.5], [-4.763, -2.75], [4.763, -2.75]] }
    ] }
  ];
  function preset(id) { const p = PRESETS.find((q) => q.id === id) || PRESETS[0]; return p.els(); }

  // a fresh element of a type, placed near the centre without sitting on top of the others
  function makeElement(type, FW, n) {
    const c = FW ? FW.centroid : [0, 0]; const a = (n || 0) * 2.1; const off = [r3(c[0] + Math.cos(a) * 1.2), r3(c[1] + Math.sin(a) * 1.2)];
    const id = type[0] + Date.now().toString(36).slice(-4) + Math.floor(Math.random() * 100);
    if (type === 'ground') return { id, type, closed: true, pts: polygon(5, 1.8, a, 0.2, n + 7).map((q) => [r3(q[0] + off[0]), r3(q[1] + off[1])]) };
    if (type === 'hoop') return { id, type, c: [off[0], 1.6, off[1]], r: 1.0, az: r3((a * 180 / Math.PI) % 360), el: 20, keep: true, open: true };
    if (type === 'arch') return { id, type, a: [r3(off[0] - 1.4), off[1]], b: [r3(off[0] + 1.4), off[1]], rise: 2.2, lean: 0, keep: true };
    if (type === 'post') return { id, type, a: off, h: 2.2, lean: 0, az: 0, keep: false };
    return null;
  }

  // editable handles: [{el, key, p, mode:'ground'|'height'|'plane'|'radius'}]
  function handles(els) {
    const out = [];
    (els || []).forEach((el, i) => {
      if (el.type === 'ground') el.pts.forEach((q, k) => out.push({ el: i, key: 'pt' + k, p: [q[0], POLE_Y, q[1]], mode: 'ground' }));
      else if (el.type === 'hoop') {
        const b = hoopBasis(el); out.push({ el: i, key: 'c', p: el.c.slice(), mode: 'plane' });
        out.push({ el: i, key: 'top', p: M.madd(el.c, b.v, el.r), mode: 'height' });
        out.push({ el: i, key: 'r', p: M.madd(el.c, b.u, el.r), mode: 'radius' });
      } else if (el.type === 'arch') {
        out.push({ el: i, key: 'a', p: [el.a[0], 0, el.a[1]], mode: 'ground' }, { el: i, key: 'b', p: [el.b[0], 0, el.b[1]], mode: 'ground' });
        const r = resolve(el); if (r) out.push({ el: i, key: 'rise', p: r.pts[Math.floor(r.pts.length / 2)], mode: 'height' });
      } else if (el.type === 'post') {
        out.push({ el: i, key: 'a', p: [el.a[0], 0, el.a[1]], mode: 'ground' });
        const r = resolve(el); if (r) out.push({ el: i, key: 'top', p: r.pts[r.pts.length - 1], mode: 'height' });
      }
    });
    return out;
  }
  // apply a handle drag; p is the new handle position from the viewport
  function moveHandle(els, hd, p) {
    const el = els[hd.el]; if (!el) return;
    const cl = (v, a) => Math.max(-a, Math.min(a, r3(v)));
    if (el.type === 'ground' && hd.key.startsWith('pt')) { const k = +hd.key.slice(2); el.pts[k] = [cl(p[0], 14), cl(p[2], 14)]; }
    else if (el.type === 'hoop') {
      if (hd.key === 'c') { el.c[0] = cl(p[0], 14); el.c[2] = cl(p[2], 14); }
      else if (hd.key === 'top') { const b = hoopBasis(el); el.c[1] = Math.max(-el.r * 0.6, Math.min(6, r3(p[1] - b.v[1] * el.r))); }
      else if (hd.key === 'r') { el.r = Math.max(0.35, Math.min(3.5, r3(M.dist(p, el.c)))); }
    } else if (el.type === 'arch') {
      if (hd.key === 'a') el.a = [cl(p[0], 14), cl(p[2], 14)]; else if (hd.key === 'b') el.b = [cl(p[0], 14), cl(p[2], 14)];
      else if (hd.key === 'rise') el.rise = Math.max(0.4, Math.min(6, r3(p[1] / Math.max(0.2, Math.cos((el.lean || 0) * D2R)))));
    } else if (el.type === 'post') {
      if (hd.key === 'a') el.a = [cl(p[0], 14), cl(p[2], 14)];
      else if (hd.key === 'top') el.h = Math.max(0.4, Math.min(6, r3(p[1] / Math.max(0.2, Math.cos((el.lean || 0) * D2R)))));
    }
  }

  // sanitise saved elements: keep only well-formed ones
  function sanitise(els) {
    const fin = (v) => typeof v === 'number' && isFinite(v) && Math.abs(v) < 50;
    const pt2 = (q) => Array.isArray(q) && q.length >= 2 && fin(q[0]) && fin(q[1]);
    const pt3 = (q) => Array.isArray(q) && q.length >= 3 && fin(q[0]) && fin(q[1]) && fin(q[2]);
    if (!Array.isArray(els)) return null;
    const out = [];
    for (const el of els) {
      if (!el || typeof el !== 'object' || !TYPES[el.type]) continue;
      if (el.type === 'ground' && Array.isArray(el.pts) && el.pts.length >= 2 && el.pts.every(pt2)) out.push(el);
      else if (el.type === 'hoop' && pt3(el.c) && fin(el.r) && el.r > 0.1) out.push(el);
      else if (el.type === 'arch' && pt2(el.a) && pt2(el.b) && fin(el.rise)) out.push(el);
      else if (el.type === 'post' && pt2(el.a) && fin(el.h)) out.push(el);
      else if (el.type === 'curve' && Array.isArray(el.pts) && el.pts.length >= 2 && el.pts.every(pt3)) out.push(el);
    }
    return out;
  }

  return { TYPES, PRESETS, POLE_Y, resolve, build, nearest2, distTo, insideGround, nearGround, flow, preset, makeElement, handles, moveHandle, hoopBasis, sanitise, label, key };
})();
