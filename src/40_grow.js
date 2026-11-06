/* Weavefield — field-driven growth on the live structure (Stickfield's aggregation, made physical).
   Each new stick starts on a rod where it now stands (or on a ground pole), follows its family's field for its length,
   takes one gentle bend, and snaps its far end onto a rod or a ground socket. It is lashed at its ends and wherever it
   crosses another rod within the tie radius, and is kept only if it is held in two places or more, keeps out of the hoop
   openings, meets the ground only with steep feet and does not overfill the density field. Sticks bent tighter than
   they can be bent cold are pre-bent (soaked over a jig) and keep that shape; the rest are bent cold and push back.
   The physics then relaxes the whole structure before the next batch grows on it. */
SF.Grow = (function () {
  'use strict';
  const M = SF.M, Fd = SF.Field, FWm = SF.Formwork, Mo = SF.Model;
  const MEMBER = (r) => r.kind !== 'stick';

  // ---------------- segment hash over the current geometry ----------------
  function SegHash(cs) {
    const map = new Map(); const segs = []; let stamp = new Int32Array(4096); let qid = 0;
    const key = (i, j, k) => (i * 73856093) ^ (j * 19349663) ^ (k * 83492791);
    function add(a, b, rod, ia, ib, r) {
      const id = segs.length; segs.push({ a, b, rod, ia, ib, r });
      if (id >= stamp.length) { const ns = new Int32Array(stamp.length * 2); ns.set(stamp); stamp = ns; }
      const i0 = Math.floor((Math.min(a[0], b[0]) - r) / cs), i1 = Math.floor((Math.max(a[0], b[0]) + r) / cs), j0 = Math.floor((Math.min(a[1], b[1]) - r) / cs), j1 = Math.floor((Math.max(a[1], b[1]) + r) / cs);
      const k0 = Math.floor((Math.min(a[2], b[2]) - r) / cs), k1 = Math.floor((Math.max(a[2], b[2]) + r) / cs);
      for (let x = i0; x <= i1; x++) for (let y = j0; y <= j1; y++) for (let z = k0; z <= k1; z++) { const kk = key(x, y, z); let arr = map.get(kk); if (!arr) map.set(kk, arr = []); arr.push(id); }
    }
    function query(lo, hi, fn) {
      qid++; const i0 = Math.floor(lo[0] / cs), i1 = Math.floor(hi[0] / cs), j0 = Math.floor(lo[1] / cs), j1 = Math.floor(hi[1] / cs), k0 = Math.floor(lo[2] / cs), k1 = Math.floor(hi[2] / cs);
      for (let x = i0; x <= i1; x++) for (let y = j0; y <= j1; y++) for (let z = k0; z <= k1; z++) {
        const arr = map.get(key(x, y, z)); if (!arr) continue;
        for (let q = 0; q < arr.length; q++) { const id = arr[q]; if (stamp[id] === qid) continue; stamp[id] = qid; fn(segs[id], id); }
      }
    }
    return { add, query, segs };
  }
  const SR = { s: 0, t: 0, d: 0 };
  function segSeg(p1, q1, p2, q2) {
    const d1x = q1[0] - p1[0], d1y = q1[1] - p1[1], d1z = q1[2] - p1[2], d2x = q2[0] - p2[0], d2y = q2[1] - p2[1], d2z = q2[2] - p2[2];
    const rx = p1[0] - p2[0], ry = p1[1] - p2[1], rz = p1[2] - p2[2];
    const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz; let s, t;
    if (a <= 1e-12 && e <= 1e-12) { s = t = 0; } else if (a <= 1e-12) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
    else {
      const c = d1x * rx + d1y * ry + d1z * rz;
      if (e <= 1e-12) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else { const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b; s = den !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0; t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); } }
    }
    const x = p1[0] + d1x * s - p2[0] - d2x * t, y = p1[1] + d1y * s - p2[1] - d2y * t, z = p1[2] + d1z * s - p2[2] - d2z * t;
    SR.s = s; SR.t = t; SR.d = Math.sqrt(x * x + y * y + z * z); return SR;
  }
  // ---------------- one bend: an arc through A, M, E no tighter than rmin ----------------
  function circumcentre(A, B, C) {
    const a = M.sub(B, A), b = M.sub(C, A); const n = M.cross(a, b); const n2 = M.dot(n, n);
    if (n2 < 1e-10 * M.dot(a, a) * M.dot(b, b) || n2 < 1e-14) return null;
    const O = M.add(A, M.mul(M.add(M.mul(M.cross(n, a), M.dot(b, b)), M.mul(M.cross(b, n), M.dot(a, a))), 1 / (2 * n2)));
    return { O, n: M.mul(n, 1 / Math.sqrt(n2)), r: M.dist(O, A) };
  }
  function arcPoints(A, Mid, E, rmin, ds) {
    const chord = M.dist(A, E); if (chord < 1e-3) return null; const mid = M.lerp3(A, E, 0.5); let Mq = Mid; let cc = circumcentre(A, Mq, E);
    if (cc && cc.r < rmin) { let lo = 0, hi = 1; for (let k = 0; k < 18; k++) { const f = (lo + hi) / 2; const c2 = circumcentre(A, M.lerp3(Mid, mid, f), E); if (!c2 || c2.r >= rmin) hi = f; else lo = f; } Mq = M.lerp3(Mid, mid, hi); cc = circumcentre(A, Mq, E); if (chord > 2 * rmin) cc = cc && cc.r >= rmin * 0.98 ? cc : null; }
    if (!cc || cc.r > 400) return straight(A, E, ds);
    const u = M.norm(M.sub(A, cc.O)); let w = M.norm(M.cross(cc.n, u));
    const ang = (P) => { const d = M.sub(P, cc.O); let a = Math.atan2(M.dot(d, w), M.dot(d, u)); if (a < 0) a += 2 * Math.PI; return a; };
    let aE = ang(E); if (ang(Mq) > aE) { w = M.mul(w, -1); aE = ang(E); }
    const n = Math.max(2, Math.ceil(cc.r * aE / ds)); const out = []; for (let i = 0; i <= n; i++) { const a = aE * i / n; out.push(M.add(cc.O, M.add(M.mul(u, cc.r * Math.cos(a)), M.mul(w, cc.r * Math.sin(a))))); }
    out[n] = E.slice(); return out;
  }
  function straight(A, E, ds) { const n = Math.max(2, Math.ceil(M.dist(A, E) / (ds || 0.1))); const out = []; for (let i = 0; i <= n; i++) out.push(M.lerp3(A, E, i / n)); return out; }
  function footRise(pts, cum, atEnd) { const L = cum[cum.length - 1]; const s = Math.min(0.25, L * 0.4); const a = atEnd ? pts[pts.length - 1] : pts[0]; const d = M.sub(M.pointAt(pts, cum, atEnd ? L - s : s), a); return d[1] / (M.len(d) || 1); }
  function groundFits(pts, cum, aStart, aEnd, GR) {
    if (aStart && footRise(pts, cum, false) < GR.sinMin) return false; if (aEnd && footRise(pts, cum, true) < GR.sinMin) return false;
    const n = pts.length; let maxY = 0, low = 0;
    for (let k = 0; k < n; k++) { if (pts[k][1] > maxY) maxY = pts[k][1]; if (k && (pts[k][1] + pts[k - 1][1]) / 2 < GR.zone) low += cum[k] - cum[k - 1]; }
    if (maxY < 2 * GR.zone || low > 0.4 * cum[n - 1]) return false; // a hump, or lying along the ground
    for (let i = 0; i < n;) { if (pts[i][1] >= GR.zone) { i++; continue; } let e = i; while (e + 1 < n && pts[e + 1][1] < GR.zone) e++; const run = cum[e] - cum[i] + (i > 0 ? 0.05 : 0) + (e < n - 1 ? 0.05 : 0); if (run > ((i === 0 && aStart) || (e === n - 1 && aEnd) ? GR.allow : 0.2)) return false; i = e + 1; }
    return true;
  }

  // ---------------- state for one batch, from where everything now is ----------------
  function setup(model, E, FW, P, opts) {
    opts = opts || {}; const A = P.grow, mat = model.material; const grid = E.grid;
    const st = { model, E, FW, P, A, mat, grid, rnd: M.rng(1 + Math.round((A.seed || 1) * 7919) + (opts.salt || 0) * 104729), placed: 0, fails: 0, tries: 0,
      rej: { site: 0, field: 0, short: 0, open: 0, contacts: 0, dense: 0, ground: 0, tight: 0 }, hash: SegHash(0.3), uses: opts.uses || new Map(), depth: new Map(), added: [] };
    st.fams = E.design.families.filter((f) => f.enabled && (f.share == null || f.share > 0)).map((f) => ({ f, F: E.sampler(f.id), share: f.share == null ? 1 : f.share })).filter((x) => x.F);
    st.shareSum = st.fams.reduce((s, x) => s + x.share, 0);
    const profs = SF.Phys.profiles(mat); st.half = (pid) => (profs[pid] || profs.stick).section_mm / 2000;
    st.tieR = A.tieRadius || 0.16; st.raised = model.rods.size > 0 && Array.from(model.rods.values()).some((r) => MEMBER(r) && r.profile !== 'pole' && r.kind !== 'pole');
    // density / reach grid (0.3 m cells)
    const cs = 0.3; const min = grid.min.slice(), max = grid.max.slice();
    const nx = Math.ceil((max[0] - min[0]) / cs) + 1, ny = Math.ceil((max[1] - min[1]) / cs) + 1, nz = Math.ceil((max[2] - min[2]) / cs) + 1;
    const N = nx * ny * nz; const D = new Float32Array(N), T = new Float32Array(N), Rr = new Float32Array(N);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = min[0] + (i + 0.5) * cs, y = min[1] + (j + 0.5) * cs, z = min[2] + (k + 0.5) * cs; const c = i + nx * (j + ny * k);
      const dv = E.scalar('density', x, y, z); const s = M.lerp(A.spMax, A.spMin, M.clamp(dv, 0, 1)); T[c] = dv < 0.03 ? 0 : (2 / (s * s)) * cs * cs * cs;
      Rr[c] = FW.nseg ? FWm.distTo(FW, x, y, z) : 1e9;
    }
    st.dg = { cs, min, nx, ny, nz, D, T, R: Rr };
    // the structure as it stands: segments, sites, density of the sticks already up
    st.sx = []; st.sy = []; st.sz = []; st.srod = []; st.si = [];
    for (const r of model.rods.values()) {
      const fx = Mo.fixedSet(r); const hr = st.half(r.profile || 'stick') * Math.sqrt(r.bundle || 1); const n = r.pts.length; const ns = r.closed ? n : n - 1;
      for (let i = 0; i < ns; i++) st.hash.add(r.pts[i], r.pts[(i + 1) % n], r.id, i, (i + 1) % n, hr);
      st.depth.set(r.id, r.kind === 'stick' ? (r.depth || 1) : 0);
      const pole = r.kind === 'pole';
      for (let i = 0; i < n; i++) { if (fx.has(i)) continue; if (!pole && r.pts[i][1] < 0.1) continue; st.sx.push(r.pts[i][0]); st.sy.push(pole ? 0 : r.pts[i][1]); st.sz.push(r.pts[i][2]); st.srod.push(r.id); st.si.push(i); }
      if (r.kind === 'stick') addDensity(st, r.pts);
    }
    // grow near a point only (the grow tool): sites outside the focus are dropped
    if (opts.focus) {
      const f = opts.focus; st.focus = f; const keep = (i) => Math.hypot(st.sx[i] - f.p[0], st.sy[i] - f.p[1], st.sz[i] - f.p[2]) <= f.r;
      const idx = st.sx.map((_, i) => i).filter(keep); for (const k of ['sx', 'sy', 'sz', 'srod', 'si']) st[k] = idx.map((i) => st[k][i]);
    }
    const Gp = P.ground; if (Gp && Gp.keepOff) { const sinMin = Math.sin(M.clamp(Gp.footMin, 0, 80) * Math.PI / 180); st.groundRule = { zone: Gp.zone, sinMin, allow: Gp.zone / Math.max(0.17, sinMin) + 0.1 }; }
    // where sticks may land on the ground: inside the ground loop or near its poles; without poles, inside the frame's footprint
    st.foot = footprint(model);
    return st;
  }
  function footprint(model) {
    const P = []; for (const r of model.rods.values()) for (const p of r.pts) P.push([p[0], p[2]]);
    if (P.length < 3) return null; P.sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = []; for (const q of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop(); return lo.concat(up);
  }
  function inHull(H, x, z, pad) {
    if (!H || H.length < 3) return false; let inside = true, near = Infinity;
    for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length]; const ex = b[0] - a[0], ez = b[1] - a[1]; const l = Math.hypot(ex, ez) || 1; const d = ((x - a[0]) * ez - (z - a[1]) * ex) / l; if (d > 0) inside = false; near = Math.min(near, Math.abs(d)); }
    return inside || near < pad;
  }
  function groundOK(st, x, z) {
    if (!st.A.ground) return false; const FW = st.FW;
    if (FW.grounds.length) return FWm.insideGround(FW, x, z) || FWm.nearGround(FW, x, z, 0.7);
    return inHull(st.foot, x, z, 0.4);
  }
  function cellOf(st, x, y, z) { const g = st.dg; const i = Math.floor((x - g.min[0]) / g.cs), j = Math.floor((y - g.min[1]) / g.cs), k = Math.floor((z - g.min[2]) / g.cs); if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return -1; return i + g.nx * (j + g.ny * k); }
  function addDensity(st, pts) { const g = st.dg; for (let i = 0; i < pts.length - 1; i++) { const m = M.lerp3(pts[i], pts[i + 1], 0.5); const k = cellOf(st, m[0], m[1], m[2]); if (k >= 0) g.D[k] += M.dist(pts[i], pts[i + 1]); } }
  const ukey = (rod, i) => rod + ':' + i;
  function pickSite(st) {
    const n = st.sx.length; if (!n) return -1; const g = st.dg;
    for (let t = 0; t < 40; t++) {
      const i = st.rnd.int(n); const c = cellOf(st, st.sx[i], st.sy[i], st.sz[i]); if (c < 0) continue; if (g.R[c] > st.A.reach + 0.2) continue;
      const def = g.T[c] > 0 ? M.clamp(1 - g.D[c] / g.T[c], 0.04, 1) : 0; const r = st.model.rods.get(st.srod[i]);
      const w = def * (MEMBER(r) ? 1 : 0.85) / (1 + 0.6 * (st.uses.get(ukey(st.srod[i], st.si[i])) || 0));
      if (st.rnd() < w) return i;
    }
    return -1;
  }
  function pickFamily(st, p) {
    const v = [0, 0, 0];
    for (let t = 0; t < 4; t++) { let r = st.rnd() * st.shareSum, fam = st.fams[0]; for (const f of st.fams) { r -= f.share; if (r <= 0) { fam = f; break; } } fam.F(p[0], p[1], p[2], v); const m = Math.hypot(v[0], v[1], v[2]); if (m > 0.2) return { fam, d: [v[0] / m, v[1] / m, v[2] / m] }; }
    return null;
  }
  function trace(st, fam, A, d0, Lt) {
    const h = 0.08; const pts = [A.slice()]; let p = A.slice(), dir = d0.slice(); let L = 0; const v = [0, 0, 0], v2 = [0, 0, 0]; let ground = null; const cosCap = Math.cos(100 * Math.PI / 180);
    while (L < Lt) {
      if (dir[0] * d0[0] + dir[1] * d0[1] + dir[2] * d0[2] < cosCap) break;
      fam.F(p[0], p[1], p[2], v); const m = Math.hypot(v[0], v[1], v[2]); if (m < 0.15) break;
      let kx = v[0] / m, ky = v[1] / m, kz = v[2] / m; if (kx * dir[0] + ky * dir[1] + kz * dir[2] < 0) { kx = -kx; ky = -ky; kz = -kz; }
      fam.F(p[0] + kx * h / 2, p[1] + ky * h / 2, p[2] + kz * h / 2, v2); const m2 = Math.hypot(v2[0], v2[1], v2[2]); if (m2 < 0.15) break;
      let qx = v2[0] / m2, qy = v2[1] / m2, qz = v2[2] / m2; if (qx * kx + qy * ky + qz * kz < 0) { qx = -qx; qy = -qy; qz = -qz; }
      if (qx * dir[0] + qy * dir[1] + qz * dir[2] < 0.8) break;
      const pn = [p[0] + qx * h, p[1] + qy * h, p[2] + qz * h]; if (!Fd.inDomain(st.grid, pn[0], pn[1], pn[2])) break;
      if (pn[1] < 0) { const t = p[1] / (p[1] - pn[1]); ground = [p[0] + (pn[0] - p[0]) * t, 0, p[2] + (pn[2] - p[2]) * t]; pts.push(ground); L += h * t; break; }
      pts.push(pn); p = pn; dir = [qx, qy, qz]; L += h;
    }
    return { pts, L, ground };
  }
  // nearest node of another rod within r of E (not the start rod near the start)
  function snapNode(st, E, r, startRod, A) {
    let best = null, bd = r;
    st.hash.query([E[0] - r, E[1] - r, E[2] - r], [E[0] + r, E[1] + r, E[2] + r], (sg) => {
      for (const [q, i] of [[sg.a, sg.ia], [sg.b, sg.ib]]) {
        const d = M.dist(q, E); if (d >= bd) continue; if (M.dist(q, A) < 0.6) continue; if (sg.rod === startRod && M.dist(q, A) < 1.2) continue;
        const rod = st.model.rods.get(sg.rod); if (Mo.fixedSet(rod).has(i) && rod.kind !== 'pole') continue;
        bd = d; best = { rod: sg.rod, i, p: q.slice(), pole: rod.kind === 'pole' };
      }
    });
    return best;
  }
  const tanNear = (pts, p) => { let bi = 0, bd = 1e9; for (let i = 0; i < pts.length; i++) { const d = M.dist(pts[i], p); if (d < bd) { bd = d; bi = i; } } return M.norm(M.sub(pts[Math.min(pts.length - 1, bi + 1)], pts[Math.max(0, bi - 1)])); };

  // ---------------- one candidate ----------------
  function candidate(st, si, pick) {
    let A0 = [st.sx[si], st.sy[si], st.sz[si]]; const startRod = st.srod[si], startI = st.si[si]; const host = st.model.rods.get(startRod);
    const P = st.P, Ag = st.A, mat = st.mat; const fam = pick.fam; const type = fam.f.type || 'bent'; const prof = fam.f.profile || 'stick'; const half = st.half(prof);
    const onGround = host.kind === 'pole'; let d0 = pick.d.slice(); if (st.rnd() < 0.5) d0 = M.mul(d0, -1);
    const GR = st.groundRule;
    if (onGround) { if (d0[1] < 0) d0 = M.mul(d0, -1); if (d0[1] < Math.max(0.25, GR ? 0.7 * GR.sinMin : 0)) { st.rej.field++; return null; } A0 = [A0[0], 0, A0[2]]; }
    if (!MEMBER(host) && type !== 'tendril') { const t = tanNear(host.pts, A0); if (Math.abs(M.dot(t, d0)) > 0.9 && fam.f.preset !== 'along') { st.rej.field++; return null; } }
    const lv = M.clamp(st.E.scalar('length', A0[0], A0[1], A0[2]), 0.15, 1);
    let L = M.lerp(Ag.lenMin, Ag.lenMax, Math.pow(st.rnd(), 1.25)) * (fam.f.len || 1) * lv; if (type === 'straight') L = Math.min(L, 3.6); L = M.clamp(L, 0.6, (mat.max_rod_m || 8) - 0.1);
    const tr = trace(st, fam, A0, d0, L * 1.05); if (tr.L < 0.5) { st.rej.short++; return null; }
    const pts0 = tr.pts; let Mid = pts0[Math.floor(pts0.length / 2)]; let E = pts0[pts0.length - 1].slice();
    const rmin = (type === 'straight' || Ag.bend <= 0.01) ? Infinity : 1.15 * half / mat.soak_strain; // never tighter than a soak bend
    let end = null; // {kind:'ground', p} | {kind:'rod', rod, i, p}
    if (tr.ground && groundOK(st, tr.ground[0], tr.ground[2])) { E = tr.ground; end = { kind: 'ground', p: E }; }
    else {
      const sn = snapNode(st, E, 0.38, startRod, A0);
      if (sn) { E = sn.p.slice(); end = sn.pole ? { kind: 'rod', rod: sn.rod, i: sn.i, p: E, pole: true } : { kind: 'rod', rod: sn.rod, i: sn.i, p: E }; if (sn.pole) E[1] = 0; }
      else if (E[1] < 0.35 && groundOK(st, E[0], E[2])) { E = [E[0], 0, E[2]]; end = { kind: 'ground', p: E }; }
    }
    // with nothing raised to lean on (only ground poles), a bent stick rising from the ground comes back down as an arch
    if (GR && onGround && !end && type === 'bent' && !st.raised) {
      const hx = E[0] - A0[0], hz = E[2] - A0[2]; const hl = Math.hypot(hx, hz); const Rok = Math.max(rmin, 0.9); const thMax = Math.min(65 * Math.PI / 180, L / (2 * Rok));
      if (hl > 0.15 && thMax > 35 * Math.PI / 180) {
        const th = M.clamp(Math.asin(M.clamp(d0[1], 0, 1)), Math.min(40 * Math.PI / 180, thMax), thMax); const c = L * Math.sin(th) / th, rise = L * (1 - Math.cos(th)) / (2 * th); const u = [hx / hl, hz / hl];
        const E2 = [A0[0] + u[0] * c, 0, A0[2] + u[1] * c]; if (groundOK(st, E2[0], E2[2])) { E = E2; end = { kind: 'ground', p: E }; Mid = [A0[0] + u[0] * c / 2, rise, A0[2] + u[1] * c / 2]; }
      }
    }
    const fit = (Eq) => (type === 'straight' ? straight(A0, Eq, 0.1) : arcPoints(A0, M.lerp3(M.lerp3(A0, Eq, 0.5), Mid, Ag.bend), Eq, rmin, 0.1));
    let pts = fit(E);
    // a foot landing too flat on open ground: pull it in under the stick so it meets the ground more steeply
    if (GR && pts && end && end.kind === 'ground' && footRise(pts, M.cumlen(pts), true) < GR.sinMin) {
      let ok = null;
      for (const f of [0.25, 0.45, 0.6]) { const E2 = [E[0] + (Mid[0] - E[0]) * f, 0, E[2] + (Mid[2] - E[2]) * f]; if (!groundOK(st, E2[0], E2[2])) continue; const p2 = fit(E2); if (p2 && p2.length > 2 && footRise(p2, M.cumlen(p2), true) >= GR.sinMin) { ok = { E: E2, pts: p2 }; break; } }
      if (ok) { E = ok.E; pts = ok.pts; end = { kind: 'ground', p: E }; }
    }
    if (!pts || pts.length < 3) { st.rej.short++; return null; }
    // below ground or beyond reach: cut back
    const reach = Ag.reach + (type === 'tendril' ? Ag.tendril : 0); let endKind = end ? end.kind : null;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p[1] < 0.02 && !(endKind && i === pts.length - 1)) { const q = pts[i - 1]; const t = q[1] / Math.max(1e-9, q[1] - p[1]); const g = [q[0] + (p[0] - q[0]) * t, 0, q[2] + (p[2] - q[2]) * t]; pts = pts.slice(0, i); if (groundOK(st, g[0], g[2])) { pts.push(g); end = { kind: 'ground', p: g }; } else end = null; endKind = end ? end.kind : null; break; }
      const c = cellOf(st, p[0], p[1], p[2]); if (c < 0 || st.dg.R[c] > reach) { pts = pts.slice(0, i); end = null; endKind = null; break; }
    }
    if (pts.length < 3) { st.rej.short++; return null; }
    if (Ag.openings) for (const it of st.FW.items) {
      if (!it.open) continue; const hp = it.hoop; const rr = hp.r * 0.9;
      for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const s1 = M.dot(M.sub(a, hp.c), hp.n), s2 = M.dot(M.sub(b, hp.c), hp.n); if (s1 * s2 > 0) continue; const X = M.lerp3(a, b, s1 / (s1 - s2 || 1e-12)); if (M.dist(X, hp.c) < rr) { st.rej.open++; return null; } }
    }
    let cum = M.cumlen(pts); let Lc = cum[cum.length - 1]; if (Lc < 0.6) { st.rej.short++; return null; }
    if (GR && !groundFits(pts, cum, onGround, endKind === 'ground' || (end && end.pole), GR)) { st.rej.ground++; return null; }
    // what it crosses: lashings to the nearest node of each rod it passes within the tie radius
    const ties = []; const tieR = st.tieR + half; const seen = new Map();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]; const pad = tieR + 0.05;
      st.hash.query([Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.min(a[2], b[2]) - pad], [Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad, Math.max(a[2], b[2]) + pad], (sg) => {
        const r = segSeg(a, b, sg.a, sg.b); if (r.d > tieR + sg.r) return;
        const s = cum[i] + r.s * (cum[i + 1] - cum[i]); const oi = sg.ia, ot = r.t; const op = M.lerp3(sg.a, sg.b, r.t);
        if (sg.rod === startRod && Math.abs(s) < 0.6) return; if (end && end.kind === 'rod' && sg.rod === end.rod && s > Lc - 0.6) return;
        const cs = Math.abs(M.dot(M.norm(M.sub(b, a)), M.norm(M.sub(sg.b, sg.a))));
        const rod = st.model.rods.get(sg.rod); const fx = Mo.fixedSet(rod); if (rod.kind !== 'pole' && fx.has(sg.ia) && fx.has(sg.ib)) return;
        const key = sg.rod + '|' + Math.round(s / 0.5); const prev = seen.get(key);
        if (!prev || r.d < prev.d) seen.set(key, { rod: sg.rod, i: oi, t: ot, s, d: r.d, cs, p: op });
      });
    }
    for (const t of seen.values()) ties.push(t);
    ties.sort((x, y) => x.s - y.s);
    // spacing along the stick and at most two ties per rod
    const kept = []; const perRod = new Map(); const sp = Ag.tieSpacing || 0.45;
    for (const t of ties.sort((x, y) => x.d - y.d)) { if ((perRod.get(t.rod) || 0) >= 2) continue; if (kept.some((k) => Math.abs(k.s - t.s) < sp)) continue; kept.push(t); perRod.set(t.rod, (perRod.get(t.rod) || 0) + 1); }
    kept.sort((x, y) => x.s - y.s);
    if (fam.f.preset !== 'along') for (const t of kept) if (t.cs > 0.92 && kept.filter((k) => k.rod === t.rod).length > 1) { st.rej.dense++; return null; }
    const locs = kept.map((t) => t.s); locs.push(0); if (end) locs.push(Lc); locs.sort((x, y) => x - y);
    let nC = 0, last = -1; for (const s of locs) { if (last < 0 || s - last > 0.12) { nC++; last = s; } }
    const sFirst = locs[0], sLast = locs[locs.length - 1];
    if (nC < 2 || sLast - sFirst < 0.35) { st.rej.contacts++; return null; }
    let dmin = onGround || (end && (end.kind === 'ground' || end.pole)) ? 0 : (st.depth.get(startRod) || 0);
    for (const t of kept) dmin = Math.min(dmin, st.depth.get(t.rod) || 0); if (end && end.kind === 'rod') dmin = Math.min(dmin, st.depth.get(end.rod) || 0);
    const depth = dmin + 1; if (depth > 6) { st.rej.contacts++; return null; }
    // a free end runs no further than the overhang (or a tendril's reach) past its last hold
    if (!end) { const mo = type === 'tendril' ? Ag.tendril : Ag.overhang; if (Lc - sLast > mo) { pts = M.subPolyline(pts, cum, 0, sLast + mo); cum = M.cumlen(pts); Lc = cum[cum.length - 1]; for (let k = kept.length - 1; k >= 0; k--) if (kept[k].s > Lc) kept.splice(k, 1); } }
    if (Lc < 0.6) { st.rej.short++; return null; }
    // density along it
    const g = st.dg; let fill = 0, nf = 0, fresh = 0;
    for (let i = 0; i < pts.length; i++) { const c = cellOf(st, pts[i][0], pts[i][1], pts[i][2]); if (c < 0) continue; const T = g.T[c]; fill += T > 0 ? (g.D[c] + 0.1) / T : 9; nf++; if (T > 0 && g.D[c] < 0.25 * T) fresh++; }
    fill /= Math.max(1, nf); if (fill > 1.35) { st.rej.dense++; return null; }
    // bending: cold if it can be, pre-bent (soaked over a jig) if tighter
    let kmax = 0; const kap = M.curvature(pts, 2); for (let i = 0; i < kap.length; i++) kmax = Math.max(kmax, kap[i]); const strain = kmax * half;
    let cls = type === 'straight' || strain < 1e-4 ? 'straight' : strain <= mat.elastic_strain ? 'cold' : strain <= mat.soak_strain ? 'soak' : 'steam';
    if (cls === 'steam') { st.rej.tight++; return null; }
    if (Ag.prebend === 'always' && cls === 'cold') cls = 'soak'; if (Ag.prebend === 'never' && cls === 'soak') { st.rej.tight++; return null; }
    // score (Stickfield's): along the field, held in many places at good crossing angles, into empty space, spanning
    let al = 0, na = 0; const v = [0, 0, 0];
    for (let i = 1; i < pts.length; i += 2) { fam.F(pts[i][0], pts[i][1], pts[i][2], v); const m = Math.hypot(v[0], v[1], v[2]); if (m < 1e-6) continue; const t = M.norm(M.sub(pts[i], pts[i - 1])); al += Math.abs(t[0] * v[0] + t[1] * v[1] + t[2] * v[2]) / m; na++; }
    al = na ? al / na : 0; let cross = 0; for (const t of kept) cross += Math.sqrt(Math.max(0, 1 - t.cs * t.cs)); cross = kept.length ? cross / kept.length : 0;
    const spanR = Math.min(1, (sLast - sFirst) / Math.max(0.1, Lc));
    const score = 1.0 * al + 0.8 * Math.min(nC, 6) / 6 + 0.45 * cross + 0.8 * (1 - Math.min(1.25, fill) / 1.25) + 0.6 * (end ? 1 : 0) + 0.5 * (fresh / Math.max(1, nf))
      + 0.4 * spanR + 0.35 * (1 - depth / 6) + 0.6 * ((onGround ? 1 : 0) + (end && (end.kind === 'ground' || end.pole) ? 1 : 0)) + 0.15 * st.rnd();
    return { pts, L: Lc, fam: fam.f, type, prof, cls, start: onGround ? { kind: 'rod', rod: startRod, i: startI, pole: true } : { kind: 'rod', rod: startRod, i: startI }, end, ties: kept, score, si, depth, nC };
  }

  // ---------------- commit: the stick goes into the design with its lashings and sockets ----------------
  function commit(st, c, stage) {
    const m = st.model; const n = Mo.segCount(c.L, m.material) + 1; const pts = Mo.resample(c.pts, n, false); const cum = M.cumlen(pts); const L = cum[n - 1];
    const rest = c.cls === 'soak' ? pts : null;
    const rod = Mo.makeRod(m, 'stick', pts, L, stage, false, { profile: c.prof, fam: c.fam.id, rest, cls: c.cls });
    rod.depth = c.depth;
    const v = L / (n - 1); const segAt = (s) => { const x = M.clamp(s / v, 0, n - 1 - 1e-6); const k = Math.floor(x); return [k, x - k]; };
    m.joints.push({ id: 'j' + m.meta.next++, a: rod.id, ia: 0, b: c.start.rod, ib: c.start.i, stage });
    if (c.end) {
      if (c.end.kind === 'ground') Mo.attachEnd(m, rod, 1, { kind: 'ground', p: pts[n - 1] }, M.norm(M.sub(pts[n - 2], pts[n - 1])), { socket: st.P.ground.socket || 'tangent' }, stage);
      else m.joints.push({ id: 'j' + m.meta.next++, a: rod.id, ia: n - 1, b: c.end.rod, ib: c.end.i, stage });
    }
    // crossing lashings join the two centrelines where they pass closest (part-way along a segment on each rod)
    for (const t of c.ties) { const s = t.s / c.L * L; if (s < 0.2 || s > L - 0.2) continue; const [k, u] = segAt(s); const j = { id: 'j' + m.meta.next++, a: rod.id, ia: k, b: t.rod, ib: t.i, stage }; if (u > 0.01) j.ta = Math.round(u * 1000) / 1000; if (t.t > 0.01) j.tb = Math.round(t.t * 1000) / 1000; m.joints.push(j); }
    // the new stick is part of the structure for the rest of this batch
    const hr = st.half(c.prof); for (let i = 0; i < n - 1; i++) st.hash.add(pts[i], pts[i + 1], rod.id, i, i + 1, hr);
    for (let i = 1; i < n - 1; i++) { if (pts[i][1] < 0.1) continue; if (st.focus && M.dist(pts[i], st.focus.p) > st.focus.r) continue; st.sx.push(pts[i][0]); st.sy.push(pts[i][1]); st.sz.push(pts[i][2]); st.srod.push(rod.id); st.si.push(i); }
    st.depth.set(rod.id, c.depth); addDensity(st, pts);
    const uk = ukey(st.srod[c.si], st.si[c.si]); st.uses.set(uk, (st.uses.get(uk) || 0) + 1);
    st.placed++; st.added.push(rod.id); return rod;
  }
  // place up to count sticks; returns the ids added
  function place(st, count, stage) {
    const K = Math.max(2, Math.round(st.A.candidates || 8)); const patience = st.A.patience || 120; let n = 0;
    if (!st.fams.length) return { added: [], done: true };
    while (n < count && st.fails < patience) {
      let best = null;
      for (let k = 0; k < K; k++) {
        st.tries++; const si = pickSite(st); if (si < 0) { st.rej.site++; continue; }
        const pick = pickFamily(st, [st.sx[si], st.sy[si], st.sz[si]]); if (!pick) { st.rej.field++; continue; }
        const c = candidate(st, si, pick); if (c && (!best || c.score > best.score)) best = c;
      }
      if (best) { commit(st, best, stage); st.fails = 0; n++; } else st.fails++;
    }
    return { added: st.added.slice(-n), done: st.fails >= patience };
  }
  return { setup, place, candidate, commit, groundFits, arcPoints };
})();
