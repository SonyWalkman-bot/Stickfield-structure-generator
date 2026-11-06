/* Weavefield — the design: rods, lashings and stages, and the operations that add to it.
   Rods carry their current (relaxed) centreline as pts, a rest length L, optional ground sockets (fix) and, if pre-bent,
   their rest shape. Lashings tie a node of one rod to a node of another. Every edit is a stage, which is also the build
   order. Operations after Basketry: spring an arch between two places, stand a loop, drop a hoop, lay a rod along a
   guess, weave between two rods, starter frames, tie to neighbours; plus Stickfield's formwork as physical members. */
SF.Model = (function () {
  'use strict';
  const M = SF.M;
  const UP = [0, 1, 0];
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const rp = (p) => [r3(p[0]), r3(p[1]), r3(p[2])];

  function create(material) { return { rods: new Map(), joints: [], meta: { stage: 0, next: 1 }, material }; }
  function clone(m) {
    const rods = new Map(); for (const [id, r] of m.rods) rods.set(id, Object.assign({}, r, { pts: r.pts.map((p) => p.slice()), fix: (r.fix || []).map((f) => Object.assign({}, f)), rest: r.rest ? r.rest.map((p) => p.slice()) : undefined }));
    return { rods, joints: m.joints.map((j) => Object.assign({}, j)), meta: JSON.parse(JSON.stringify(m.meta)), material: m.material };
  }
  function toJSON(m) { return { rods: Array.from(m.rods.values()), joints: m.joints, meta: m.meta }; }
  function fromJSON(o, material) {
    const m = create(material); if (!o) return m;
    for (const r of o.rods || []) if (r && r.id && Array.isArray(r.pts) && r.pts.length >= 2 && r.pts.every((p) => Array.isArray(p) && p.length === 3 && p.every(isFinite))) m.rods.set(r.id, r);
    m.joints = (o.joints || []).filter((j) => j && m.rods.has(j.a) && m.rods.has(j.b));
    m.meta = Object.assign({ stage: 0, next: 1 }, o.meta || {}); return m;
  }
  const newId = (m, p) => p + m.meta.next++;
  function nextStage(m) { m.meta.stage += 1; return m.meta.stage; }
  const segCount = (L, mat) => Math.max(6, Math.round(L / (mat.segment_m || 0.3)));

  // ------------------------------------------------------------ geometry helpers
  function resample(pts, n, closed) { // n points evenly along a polyline
    const P = closed ? pts.concat([pts[0]]) : pts; const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + M.dist(P[i], P[i - 1]));
    const L = cum[cum.length - 1]; const out = []; let k = 1;
    for (let i = 0; i < n; i++) { const s = L * i / (closed ? n : n - 1); while (k < cum.length - 1 && cum[k] < s) k++; const t = (s - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1); out.push(M.lerp3(P[k - 1], P[k], M.clamp(t, 0, 1))); }
    return out;
  }
  // a smooth curve through points (centripetal Catmull-Rom), densely sampled: the first guess for a rod laid by hand
  function smoothThrough(P, per) {
    if (P.length < 3) return P.map((p) => p.slice()); per = per || 12; const out = [];
    const ext = [M.sub(M.mul(P[0], 2), P[1])].concat(P, [M.sub(M.mul(P[P.length - 1], 2), P[P.length - 2])]);
    for (let i = 1; i < ext.length - 2; i++) {
      const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2]; const tj = (a, b) => Math.max(1e-4, Math.sqrt(M.dist(a, b)));
      const t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
      for (let k = 0; k < per; k++) {
        const t = t1 + (t2 - t1) * k / per; const L = (a, b, ta, tb) => M.add(M.mul(a, (tb - t) / (tb - ta)), M.mul(b, (t - ta) / (tb - ta)));
        const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3); const B1 = L(A1, A2, 0, t2), B2 = L(A2, A3, t1, t3); out.push(L(B1, B2, t1, t2));
      }
    }
    out.push(P[P.length - 1].slice()); return out;
  }
  const polyLen = (pts, closed) => { let L = 0; for (let i = 1; i < pts.length; i++) L += M.dist(pts[i], pts[i - 1]); return closed ? L + M.dist(pts[pts.length - 1], pts[0]) : L; };
  function perpTo(v, up) { const u = up || UP; const e = M.sub(u, M.mul(v, M.dot(u, v))); return M.len(e) > 1e-6 ? M.norm(e) : M.norm(M.cross(v, Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1])); }
  // a circular arc of length L from a to b, bulging towards up (the first guess for an elastica; Basketry's starting shape)
  function arcBetween(a, b, L, up, n) {
    const c = M.dist(a, b), o = M.norm(M.sub(b, a));
    if (c >= L * 0.999) { const pts = []; for (let i = 0; i < n; i++) pts.push(M.lerp3(a, b, i / (n - 1))); return { pts, da: o, db: M.mul(o, -1), L: c }; }
    const w = perpTo(o, up); let lo = 1e-6, hi = Math.PI - 1e-6;
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (Math.sin(m) / m > c / L) lo = m; else hi = m; }
    const d = (lo + hi) / 2, R = L / (2 * d); const mid = M.lerp3(a, b, 0.5); const C = M.sub(mid, M.mul(w, R * Math.cos(d)));
    const pts = []; for (let i = 0; i < n; i++) { const t = -d + 2 * d * i / (n - 1); pts.push(M.add(C, M.add(M.mul(o, R * Math.sin(t)), M.mul(w, R * Math.cos(t))))); }
    pts[0] = a.slice(); pts[n - 1] = b.slice();
    return { pts, da: M.add(M.mul(o, Math.cos(d)), M.mul(w, Math.sin(d))), db: M.add(M.mul(o, -Math.cos(d)), M.mul(w, Math.sin(d))), L };
  }
  // a teardrop loop standing on base: feet apart along side, rising along up (Basketry's loop)
  function loopCurve(base, L, side, up, feet, n) {
    const raw = []; const K = 400; for (let g = 0; g <= K; g++) { const t = 2 * Math.PI * g / K; raw.push([Math.sin(t) * Math.sin(t / 2), 1 - Math.cos(t), t]); }
    let len = 0; for (let g = 1; g <= K; g++) len += Math.hypot(raw[g][0] - raw[g - 1][0], raw[g][1] - raw[g - 1][1]);
    const s = L / len; const pts = raw.map(([x, y, t]) => M.add(base, M.add(M.mul(side, x * s + feet / 2 * (1 - t / Math.PI)), M.mul(up, y * s))));
    const out = resample(pts, n, false); return { pts: out, da: M.norm(M.sub(out[1], out[0])), db: M.norm(M.sub(out[n - 2], out[n - 1])) };
  }
  function circle(c, L, normal, n) {
    const nn = M.norm(normal); const u = perpTo(nn, Math.abs(nn[1]) > 0.9 ? [1, 0, 0] : UP), w = M.cross(nn, u); const R = L / (2 * Math.PI);
    return Array.from({ length: n }, (_, i) => { const a = 2 * Math.PI * i / n; return M.add(c, M.add(M.mul(u, R * Math.cos(a)), M.mul(w, R * Math.sin(a)))); });
  }

  // ------------------------------------------------------------ places: a point on a rod, the ground, or free
  function nearestNode(m, p, opts) {
    opts = opts || {}; let best = null; const lim = opts.within == null ? Infinity : opts.within;
    for (const r of m.rods.values()) {
      if (opts.exclude && opts.exclude.has(r.id)) continue; const fixed = fixedSet(r);
      r.pts.forEach((q, i) => { if (opts.free && fixed.has(i)) return; const d = M.dist(p, q); if (d < lim && (!best || d < best.d)) best = { rod: r.id, i, d, p: q }; });
    }
    return best;
  }
  function fixedSet(r) { const s = new Set(); for (const f of r.fix || []) { s.add(f.i); if (f.d) s.add(f.i === 0 ? 1 : f.i - 1); } return s; }
  function resolve(m, spec, within) {
    within = within == null ? 0.35 : within;
    if (spec && !Array.isArray(spec) && spec.rod) {
      const r = m.rods.get(spec.rod); if (!r) throw new Error('no rod ' + spec.rod);
      const n = r.pts.length; const i = spec.i != null ? M.clamp(spec.i, 0, n - 1) : Math.round(M.clamp(spec.t == null ? 0.5 : spec.t, 0, 1) * (r.closed ? n : n - 1)) % n;
      return { kind: 'rod', rod: r.id, i, p: r.pts[i] };
    }
    const p = Array.isArray(spec) ? spec : spec && spec.near; if (!Array.isArray(p) || p.length < 3) throw new Error('expected a point [x, y, z] or {rod, t}');
    const nn = nearestNode(m, p, { within: spec && spec.near ? Infinity : within });
    if (nn) return { kind: 'rod', rod: nn.rod, i: nn.i, p: nn.p };
    if (p[1] <= 0.05) return { kind: 'ground', p: [p[0], 0, p[2]] };
    return { kind: 'free', p: p.slice() };
  }
  function addJoint(m, a, ia, b, ib, stage, extra) { const j = Object.assign({ id: newId(m, 'j'), a, ia, b, ib, stage }, extra || {}); m.joints.push(j); return j; }
  // tie a rod end to its place: a ground socket (clamped along the rod, vertical, or pinned) or a lashing to a rod
  function attachEnd(m, rod, atEnd, place, dirIn, o, stage) {
    const i = atEnd ? rod.pts.length - 1 : 0;
    if (place.kind === 'ground') {
      // clamped along the rod's own end segment (its chord, so a steam-bent rod sits in its socket exactly as it was shaped)
      const i2 = atEnd ? rod.pts.length - 2 : 1; const chord = M.sub(rod.pts[i2], rod.pts[i]); const dIn = M.len(chord) > 1e-6 ? chord : dirIn;
      const sock = o.socket || 'tangent'; const d = sock === 'pin' ? null : sock === 'vertical' ? UP.slice() : rp(M.norm(dIn));
      rod.fix = rod.fix || []; rod.fix.push(Object.assign({ i, p: rp(place.p) }, d ? { d } : {}));
    } else if (place.kind === 'rod') {
      const host = m.rods.get(place.rod); if (!host) return;
      addJoint(m, rod.id, i, host.id, place.i, stage);
      if ((o.lash || 1) >= 2) { // the end overlaps its host for one segment, resisting rotation
        const i2 = atEnd ? rod.pts.length - 2 : 1, h = host.pts.length;
        const cand = [place.i - 1, place.i + 1].map((q) => (host.closed ? (q + h) % h : q)).filter((q) => q >= 0 && q < h).sort((p, q) => M.dist(host.pts[p], rod.pts[i2]) - M.dist(host.pts[q], rod.pts[i2]))[0];
        if (cand !== undefined) addJoint(m, rod.id, i2, host.id, cand, stage);
      }
    }
  }
  function makeRod(m, kind, pts, L, stage, closed, o) {
    o = o || {}; const rod = { id: newId(m, 'r'), kind, stage, closed: !!closed, L: r3(L), pts: pts.map(rp), fix: [], v: 1 };
    if (o.profile && o.profile !== 'stick') rod.profile = o.profile;
    const nb = Math.round(o.bundle || 1); if (nb > 1) rod.bundle = Math.min(12, nb);
    if (o.fam) rod.fam = o.fam; if (o.held) rod.held = true; if (o.temp) rod.temp = true; if (o.fw != null) rod.fw = o.fw;
    if (o.rest) rod.rest = o.rest.map(rp);
    else if (SF.Phys.sectionOf(m.material, rod).steam) rod.rest = rod.pts.map((p) => p.slice()); // steam-bent: keeps the shape it is placed in
    if (o.cls) rod.cls = o.cls;
    m.rods.set(rod.id, rod); return rod;
  }

  // ------------------------------------------------------------ operations (each returns the rods it added)
  function addArch(m, o, stage) {
    const L = o.length || 8; const A = resolve(m, o.a), B = resolve(m, o.b); const n = segCount(L, m.material) + 1;
    const arc = arcBetween(A.p, B.p, L, o.up || UP, n); const rod = makeRod(m, o.kind || 'arch', arc.pts, arc.L, stage, false, o);
    attachEnd(m, rod, 0, A, arc.da, o, stage); attachEnd(m, rod, 1, B, arc.db, o, stage); return rod;
  }
  function addLoop(m, o, stage) {
    const L = o.length || 6; const A = resolve(m, o.at); const n = segCount(L, m.material) + 1;
    let side = o.side; if (!side) { if (A.kind === 'rod') { const t = tangentAt(m.rods.get(A.rod), A.i); side = Math.hypot(t[0], t[2]) > 0.2 ? t : [1, 0, 0]; } else { const az = (o.azimuth || 0) * Math.PI / 180; side = [Math.cos(az), 0, Math.sin(az)]; } }
    const tilt = (o.tilt || 0) * Math.PI / 180; const s = M.norm([side[0], 0, side[2]]); const c = M.norm(M.cross(s, UP)); const up = M.norm(M.add(M.mul(UP, Math.cos(tilt)), M.mul(c, Math.sin(tilt))));
    const lp = loopCurve(A.p, L, s, up, o.feet || 0.3, n);
    const onRod = (p) => { if (A.kind !== 'rod') return Object.assign({}, A, { p }); const r = m.rods.get(A.rod); let bi = 0; r.pts.forEach((q, i) => { if (M.dist(q, p) < M.dist(r.pts[bi], p)) bi = i; }); return { kind: 'rod', rod: r.id, i: bi, p: r.pts[bi] }; };
    const rod = makeRod(m, 'loop', lp.pts, L, stage, false, o); const opt = Object.assign({ lash: A.kind === 'rod' ? 1 : 2 }, o);
    attachEnd(m, rod, 0, A.kind === 'free' ? { kind: 'free' } : onRod(lp.pts[0]), lp.da, opt, stage);
    attachEnd(m, rod, 1, A.kind === 'free' ? { kind: 'free' } : onRod(lp.pts[n - 1]), lp.db, opt, stage);
    if (A.kind === 'rod') autoJoin(m, [rod.id], { radius: 0.5, perRod: 4, spacing: 1 }, stage);
    return rod;
  }
  function addHoop(m, o, stage) {
    const L = o.length || 8; const n = segCount(L, m.material); const pts = circle(o.centre || o.center || [0, 1.5, 0], L, o.normal || [0, 0, 1], n);
    const rod = makeRod(m, o.kind || 'hoop', pts, L, stage, true, Object.assign({ profile: 'weave' }, o));
    const rad = o.attach == null ? 0.7 : o.attach; if (rad > 0) autoJoin(m, [rod.id], { radius: rad }, stage); return rod;
  }
  function addRod(m, o, stage) {
    const P0 = o.points; if (!Array.isArray(P0) || P0.length < 2) throw new Error('points needs at least two [x, y, z]');
    const closed = !!o.closed; const P = o.smooth && !closed && P0.length > 2 ? smoothThrough(P0) : P0; const L = o.length || polyLen(P, closed); const n = segCount(L, m.material) + (closed ? 0 : 1);
    const A = closed ? null : resolve(m, P[0]), B = closed ? null : resolve(m, P[P.length - 1]); // before the rod exists, so its ends do not find themselves
    const via = o.lashVia ? P0.slice(1, -1).map((p) => resolve(m, p, 0.05)).filter((q) => q.kind === 'rod') : [];
    const pts = resample(P, n, closed); const rod = makeRod(m, o.kind || 'rod', pts, L, stage, closed, o);
    if (!closed) { attachEnd(m, rod, 0, A, M.norm(M.sub(pts[1], pts[0])), o, stage); attachEnd(m, rod, 1, B, M.norm(M.sub(pts[n - 2], pts[n - 1])), o, stage); }
    // points it was laid over on the way are lashed there (the nearest node of the new rod to each)
    for (const q of via) {
      let bi = 0, bt = 0, bd = Infinity;
      for (let i = 0; i < n - 1; i++) { const a = rod.pts[i], b = rod.pts[i + 1]; const ab = M.sub(b, a); const t = M.clamp(M.dot(M.sub(q.p, a), ab) / Math.max(1e-12, M.dot(ab, ab)), 0, 1); const d = M.dist(M.add(a, M.mul(ab, t)), q.p); if (d < bd) { bd = d; bi = i; bt = t; } }
      if (bd < 0.5) addJoint(m, rod.id, bi, q.rod, q.i, stage, bt > 0.01 ? { ta: Math.round(bt * 1000) / 1000 } : null);
    }
    return rod;
  }
  function centroid(m) { let c = [0, 0, 0], k = 0; for (const r of m.rods.values()) for (const p of r.pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; k++; } return k ? M.mul(c, 1 / k) : [0, 1, 0]; }
  function bounds(m) { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const r of m.rods.values()) for (const p of r.pts) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], p[c]); hi[c] = Math.max(hi[c], p[c]); } return m.rods.size ? { min: lo, max: hi } : null; }
  // bridging rods between two rods, bulging away from the structure: a basket surface (diagonal crosses them)
  function weave(m, o, stage) {
    const a = m.rods.get(o.a), b = m.rods.get(o.b); if (!a || !b) throw new Error('weave needs two existing rods'); if (a === b) throw new Error('pick two different rods');
    const count = Math.max(1, Math.min(40, o.count || 6)); const [a0, a1] = o.a_range || [0.15, 0.85], [b0, b1] = o.b_range || [0.15, 0.85]; const slack = o.slack || 1.25;
    const c = centroid(m); const ts = count === 1 ? [0.5] : Array.from({ length: count }, (_, i) => i / (count - 1));
    const step = o.pattern === 'diagonal' ? Math.max(1, Math.round(count / 3)) : 0; const pairs = [];
    ts.forEach((t, i) => { if (step) { const k = Math.min(count - 1, i + step); if (k !== i) pairs.push([t, ts[k]], [ts[k], t]); } else pairs.push([t, t]); });
    const out = [];
    for (const [p, q] of pairs) {
      const sa = { rod: a.id, t: a0 + (a1 - a0) * p }, sb = { rod: b.id, t: b0 + (b1 - b0) * q }; const A = resolve(m, sa), B = resolve(m, sb);
      if (M.dist(A.p, B.p) < 0.5) continue; const mid = M.lerp3(A.p, B.p, 0.5); const up = o.up || M.norm(M.add(M.sub(mid, c), [0, 0.3, 0]));
      out.push(addArch(m, { a: sa, b: sb, length: Math.max(1, M.dist(A.p, B.p) * slack), up, kind: 'weave', profile: o.profile || 'weave', bundle: o.bundle }, stage));
    }
    if (step) autoJoin(m, out.map((r) => r.id), { radius: 0.25, perRod: 4, spacing: 0.6 }, stage);
    return out;
  }
  // starter frames on the ground (Basketry): rods sprung between ground sockets
  function frame(m, o, stage) {
    const c = o.centre || [0, 0, 0], s = o.span || 5, L = o.length || 8; const at = (x, z) => [c[0] + x, 0, c[2] + z]; const out = [];
    const arch = (a, b, up) => out.push(addArch(m, { a, b, length: L, up, socket: o.socket, profile: o.profile || 'frame', bundle: o.bundle, kind: 'frame' }, stage));
    const type = o.type || 'cross';
    if (type === 'cross') { arch(at(-s / 2, 0), at(s / 2, 0)); arch(at(0, -s / 2), at(0, s / 2)); }
    else if (type === 'dome') { const k = o.count || 3; for (let d = 0; d < k; d++) { const u = Math.PI * d / k; arch(at(Math.cos(u) * s / 2, Math.sin(u) * s / 2), at(-Math.cos(u) * s / 2, -Math.sin(u) * s / 2)); } }
    else if (type === 'tunnel') {
      const k = o.count || 4, sp = o.spacing || 1.2; for (let g = 0; g < k; g++) { const z = (g - (k - 1) / 2) * sp; arch(at(-s / 2, z), at(s / 2, z)); }
      const top = (r) => r.pts.reduce((p, q) => (q[1] > p[1] ? q : p)); const ridge = addRod(m, { points: [top(out[0]), top(out[out.length - 1])], kind: 'ridge', profile: o.profile || 'frame', bundle: o.bundle }, stage);
      autoJoin(m, [ridge.id], { radius: 0.35, perRod: k, spacing: sp * 0.8, perPair: 1 }, stage); out.push(ridge);
    } else if (type === 'tripod') { const v = [0, 1, 2].map((d) => { const u = 2 * Math.PI * d / 3 + Math.PI / 2; return at(Math.cos(u) * s / 2, Math.sin(u) * s / 2); }); arch(v[0], v[1]); arch(v[1], v[2]); arch(v[2], v[0]); }
    else throw new Error('unknown frame ' + type);
    if (type !== 'tunnel') autoJoin(m, out.map((r) => r.id), { radius: 0.3, perRod: 4, spacing: 1, perPair: 1 }, stage);
    return out;
  }
  // hoops dropped at random through a region, kept only if they catch on rods (Basketry's scatter)
  function scatterHoops(m, o, stage) {
    const rnd = M.rng(o.seed || 7); const bb = bounds(m);
    const reg = o.region || (bb ? { min: [bb.min[0], Math.max(0.6, bb.min[1]), bb.min[2]], max: [bb.max[0], Math.max(1.2, bb.max[1] * 0.9), bb.max[2]] } : { min: [-2, 0.8, -2], max: [2, 2.5, 2] });
    const count = Math.max(1, Math.min(60, o.count || 8)); const kept = [];
    for (let c = 0; c < count; c++) {
      const p = [0, 1, 2].map((k) => reg.min[k] + (reg.max[k] - reg.min[k]) * rnd()); const ph = rnd() * 2 * Math.PI, th = Math.acos(2 * rnd() - 1);
      const nrm = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; const L = (o.length || 6) * (0.8 + 0.4 * rnd());
      const h = addHoop(m, { centre: p, length: L, normal: nrm, profile: o.profile || 'weave', bundle: o.bundle, attach: 0 }, stage);
      const ties = autoJoin(m, [h.id], { radius: o.attach || 0.7, perRod: o.perRod || 4, spacing: 0.8, perPair: 2 }, stage);
      if (ties.length < (o.minJoints || 2)) remove(m, [h.id]); else kept.push(h);
    }
    return kept;
  }
  // tie rods to any rod passing within radius, closest first, spaced along each rod (Basketry's auto join)
  function autoJoin(m, ids, o, stage) {
    o = o || {}; const radius = o.radius == null ? 0.5 : o.radius, perRod = o.perRod || 6, spacing = o.spacing == null ? 0.9 : o.spacing, perPair = o.perPair || 2;
    const set = new Set(ids); const cs = Math.max(radius, 0.2); const grid = new Map(); const key = (p) => Math.floor(p[0] / cs) + ',' + Math.floor(p[1] / cs) + ',' + Math.floor(p[2] / cs);
    for (const r of m.rods.values()) { const fx = fixedSet(r); r.pts.forEach((p, i) => { if (fx.has(i) && !r.held) return; const k = key(p); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push([r.id, i]); }); }
    const cands = []; const seen = new Set();
    for (const id of ids) {
      const r = m.rods.get(id); if (!r) continue; const fx = fixedSet(r);
      r.pts.forEach((p, i) => {
        if (fx.has(i)) return; const ci = [0, 1, 2].map((c) => Math.floor(p[c] / cs));
        for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) for (const [oid, j] of grid.get((ci[0] + x) + ',' + (ci[1] + y) + ',' + (ci[2] + z)) || []) {
          if (oid === id) continue; const k = id < oid ? id + ':' + i + '|' + oid + ':' + j : oid + ':' + j + '|' + id + ':' + i; if (set.has(oid) && seen.has(k)) continue;
          const d = M.dist(p, m.rods.get(oid).pts[j]); if (d < radius) { seen.add(k); cands.push({ a: id, i, b: oid, j, d }); }
        }
      });
    }
    cands.sort((x, y) => x.d - y.d);
    const at = new Map(), pairs = new Map(), count = new Map();
    for (const j of m.joints) { (at.get(j.a) || at.set(j.a, []).get(j.a)).push(j.ia); (at.get(j.b) || at.set(j.b, []).get(j.b)).push(j.ib); const pk = [j.a, j.b].sort().join('|'); pairs.set(pk, (pairs.get(pk) || 0) + 1); }
    const spaced = (id, i) => { const r = m.rods.get(id); const v = SF.Phys.segLen(r), n = r.pts.length; return (at.get(id) || []).every((q) => { const d = Math.abs(q - i); return (r.closed ? Math.min(d, n - d) : d) * v >= spacing; }); };
    const out = [];
    for (const c of cands) {
      if ((count.get(c.a) || 0) >= perRod || (set.has(c.b) && (count.get(c.b) || 0) >= perRod)) continue;
      const pk = [c.a, c.b].sort().join('|'); if ((pairs.get(pk) || 0) >= perPair || !spaced(c.a, c.i) || !spaced(c.b, c.j)) continue;
      out.push(addJoint(m, c.a, c.i, c.b, c.j, stage));
      (at.get(c.a) || at.set(c.a, []).get(c.a)).push(c.i); (at.get(c.b) || at.set(c.b, []).get(c.b)).push(c.j); pairs.set(pk, (pairs.get(pk) || 0) + 1);
      count.set(c.a, (count.get(c.a) || 0) + 1); if (set.has(c.b)) count.set(c.b, (count.get(c.b) || 0) + 1);
    }
    return out;
  }
  function addLash(m, o, stage) {
    const A = resolve(m, o.a, Infinity), B = resolve(m, o.b, Infinity); if (A.kind !== 'rod' || B.kind !== 'rod') throw new Error('both ends of a lashing must be on rods');
    if (A.rod === B.rod && A.i === B.i) throw new Error('pick a different point'); return addJoint(m, A.rod, A.i, B.rod, B.i, stage, o.stiffness ? { k: o.stiffness } : null);
  }
  function remove(m, rodIds, jointIds) {
    const gone = new Set(rodIds || []); for (const id of gone) m.rods.delete(id); const gj = new Set(jointIds || []);
    m.joints = m.joints.filter((j) => !gone.has(j.a) && !gone.has(j.b) && !gj.has(j.id));
  }
  function tangentAt(r, i) { const n = r.pts.length; const a = r.pts[r.closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = r.pts[r.closed ? (i + 1) % n : Math.min(n - 1, i + 1)]; return M.norm(M.sub(b, a)); }

  // ------------------------------------------------------------ Stickfield formwork as physical members
  // ground poles are staked; hoops, arches and posts are steam-bent members, socketed where they meet the ground; members
  // that do not reach the ground (or are marked held) stand on scaffolding until the formwork is released; posts are struck then
  function fromFormwork(m, FW, stage) {
    const out = [];
    FW.items.forEach((it, k) => {
      const el = it.el; let pts = it.pts.map((p) => p.slice());
      if (it.closed && pts.length > 2 && M.dist(pts[0], pts[pts.length - 1]) < 1e-6) pts = pts.slice(0, -1);
      const L = polyLen(pts, it.closed); if (L < 0.3) return;
      const n = segCount(L, m.material) + (it.closed ? 0 : 1);
      const P = resample(pts, n, it.closed);
      if (it.ground) { for (const p of P) p[1] = 0.035; const pr = makeRod(m, 'pole', P, L, stage, it.closed, { profile: 'pole', fw: k }); if (el && el.id) pr.fwId = el.id; out.push(pr); return; }
      const temp = el.type === 'post' && el.keep === false;
      const touches = !it.closed && P[0][1] < 0.05 && (el.type === 'post' || P[P.length - 1][1] < 0.05);
      const rod = makeRod(m, el.type === 'post' ? 'post' : 'frame', P, L, stage, it.closed, { profile: 'frame', fw: k, temp, held: !touches || !!el.held }); if (el.id) rod.fwId = el.id;
      if (touches) {
        P[0][1] = 0; rod.pts[0][1] = 0; attachEnd(m, rod, 0, { kind: 'ground', p: P[0] }, M.norm(M.sub(P[1], P[0])), { socket: el.type === 'post' ? 'tangent' : 'tangent' }, stage);
        if (el.type !== 'post') { P[n - 1][1] = 0; rod.pts[n - 1][1] = 0; attachEnd(m, rod, 1, { kind: 'ground', p: P[n - 1] }, M.norm(M.sub(P[n - 2], P[n - 1])), { socket: 'tangent' }, stage); }
        if (rod.rest) rod.rest = rod.pts.map((p) => p.slice());
      }
      out.push(rod);
    });
    // members touching each other are lashed where they cross
    const ids = out.filter((r) => r.kind !== 'pole').map((r) => r.id); if (ids.length) autoJoin(m, ids, { radius: 0.12, perRod: 8, spacing: 0.6, perPair: 2 }, stage);
    return out;
  }
  // release: struck members come out, held members come off their scaffolding
  // (remembered as an event so the build order can replay the scaffolding up to the stage it came out)
  function release(m, stage) {
    const struck = [], held = [];
    for (const r of m.rods.values()) { if (r.temp) struck.push(r.id); else if (r.held) { held.push(r.id); delete r.held; r.v = (r.v || 0) + 1; } }
    if (struck.length || held.length) {
      const gone = new Set(struck);
      (m.meta.events = m.meta.events || []).push({ type: 'release', stage: stage == null ? m.meta.stage : stage, held,
        struck: struck.map((id) => JSON.parse(JSON.stringify(m.rods.get(id)))), joints: m.joints.filter((j) => gone.has(j.a) || gone.has(j.b)).map((j) => Object.assign({}, j)) });
    }
    remove(m, struck); return { struck, held };
  }
  // the design as it stands after stage k of the build: later rods and lashings not yet there, scaffolding not yet out
  function stageModel(m, k) {
    const out = create(m.material); const evs = (m.meta.events || []).filter((e) => e.stage > k); const heldIds = new Set();
    for (const e of evs) for (const id of e.held) heldIds.add(id);
    for (const r of m.rods.values()) if (r.stage <= k) out.rods.set(r.id, heldIds.has(r.id) ? Object.assign({}, r, { held: true }) : r);
    for (const e of evs) for (const r of e.struck) if (r.stage <= k && !out.rods.has(r.id)) out.rods.set(r.id, r);
    const js = m.joints.concat(...evs.map((e) => e.joints));
    out.joints = js.filter((j) => j.stage <= k && out.rods.has(j.a) && out.rods.has(j.b));
    out.meta = { stage: k, next: m.meta.next }; return out;
  }
  // the stages that exist, in order (edits that added nothing leave gaps)
  function stages(m) { const s = new Set(); for (const r of m.rods.values()) s.add(r.stage); for (const j of m.joints) s.add(j.stage); for (const e of m.meta.events || []) { s.add(e.stage); for (const r of e.struck) s.add(r.stage); } return Array.from(s).filter((v) => v > 0).sort((a, b) => a - b); }
  return { create, clone, toJSON, fromJSON, nextStage, segCount, resample, polyLen, arcBetween, loopCurve, circle, nearestNode, fixedSet, resolve, addJoint, attachEnd, makeRod,
    smoothThrough, addArch, addLoop, addHoop, addRod, weave, frame, scatterHoops, autoJoin, addLash, remove, tangentAt, centroid, bounds, fromFormwork, release, stageModel, stages };
})();
