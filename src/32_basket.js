/* Weavefield — baskets: soak-bent rings stacked into baskets and braced with sticks, baskets aggregated into a pile and
   bolted where they touch. Ring sizes, bend radii and stock come from the bending tests: a ring is one 18-20 mm pole,
   soaked and bent round a formwork, lapped, clamped and bolted. Also finds rings in a sketch (Hough circles). */
SF.Basket = (function () {
  'use strict';
  const M = SF.M, Mo = SF.Model;
  const TAU = Math.PI * 2;
  // what the bending tests found (CEPT, Nov 2026): the tightest ring is a 3.6-3.7 m pole bent to 1.17 m across, the
  // biggest bent so far is 4.5 m round, and a 5 m pole makes a 1.6 m ring. A 20 mm pole soaked bends to 587 mm radius.
  // No upper size: a ring bigger than one 5 m pole is spliced from several (each splice a 0.5 m bolted lap), and the
  // checks say how hard it is to bend and lift by hand. cMax only bounds the sliders.
  const LIMITS = { cMin: Math.PI * 1.2, cTested: 4.5, cMax: 18, pole: 5.0, minLap: 0.25, spliceLap: 0.5, soakR: 0.587, stick: 5.0, maxRings: 30 };
  // poles a ring takes: one if it laps within a 5 m pole, otherwise as many as the splices need
  const ringPoles = (C) => (C + LIMITS.minLap <= LIMITS.pole ? 1 : Math.ceil((C + LIMITS.minLap) / (LIMITS.pole - LIMITS.spliceLap)));
  // what is in the yard; editable in the Baskets panel and saved with the design
  function stock() { return { poles: 140, uncut: 15, sticks: 900, thin: 1500, bolts: 400, clamps: 20 }; }
  function opts() {
    return { rings: 4, gap: 0.55, shape: 'barrel', lean: 0, az: 0, brace: 'lattice', spacing: 0.5, tops: 0.6, door: false, doorAz: 270, ground: 'pegged', strike: 'each', ties: true, seed: 3,
      twist: 0, tilt: 0, drift: 0, tiltMode: 'same', top: 'open',
      clad: false, cladDir: 'random', cladDensity: 5, cladAngle: 55, cladLen: 2.8, cladReach: 0.5 };
  }
  const SHAPES = [['barrel', 'Barrel'], ['taper', 'Taper'], ['flare', 'Flare'], ['straight', 'Straight'], ['wave', 'Wave']];
  const BRACES = [['lattice', 'Lattice', 'Two families of sticks spiralling opposite ways, bolted where they cross the rings: stiff, and the busiest pattern'],
    ['diagonal', 'Diagonals', 'Short straight braces zigzagging between each pair of rings: a triangulated truss'],
    ['stakes', 'Stakes', 'Upright sticks through every ring, like the stakes of a woven basket: easiest to build, least stiff'],
    ['spiral', 'Spiral', 'One family of sticks spiralling round: it twists the basket as it loads']];
  const clampC = (c) => M.clamp(c, LIMITS.cMin, LIMITS.cMax);
  const TILTS = [['same', 'Same way', 'Every ring tips towards the twist: a swirl'], ['alt', 'Alternate', 'Rings tip one way then the other: a zigzag of overlapping rings'], ['open', 'Fan out', 'Each ring tips a little further: the stack opens like a flower']];
  // which way the cladding runs over a basket's surface
  const CLAD_DIRS = [['rings', 'Along rings', 'Sticks follow the rings, layered round the basket and tilting with them'], ['twist', 'Twist', 'Sticks spiral the way the rings twist'],
    ['rise', 'Rise', 'Sticks run up the stack, flaring out past the top like a flame'], ['flow', 'Flow', 'Sticks rise at the bottom and turn to run round the rings higher up'], ['random', 'Any way', 'Sticks at all angles']];
  const DEG = Math.PI / 180;

  // ---------------------------------------------------------------- ring geometry
  // the rings of a basket, bottom to top: centre, circumference and normal. The stack can lean, each ring can tip
  // (towards a direction that turns by the twist at every ring) and the centres can drift round a widening helix;
  // b.ringEdits[k] moves, resizes and tips one ring on its own
  function rings(b) {
    const n = Math.max(1, Math.min(LIMITS.maxRings, Math.round(b.rings || 4))); const C0 = clampC(b.C || 4.4); const out = [];
    const lean = (b.lean || 0) * DEG, az = (b.az || 0) * DEG; const dir = [Math.cos(az), 0, Math.sin(az)];
    const twist = (b.twist || 0) * DEG, tilt = (b.tilt || 0) * DEG, drift = b.drift || 0; const edits = b.ringEdits || {};
    const y0 = b.y0 != null ? b.y0 : b.ground === 'staked' ? 0.3 : 0.03;
    for (let k = 0; k < n; k++) {
      const u = n > 1 ? k / (n - 1) : 0; let f;
      switch (b.shape) {
        case 'taper': f = -u; break;
        case 'flare': f = u; break;
        case 'straight': f = 0; break;
        case 'wave': f = 0.5 * Math.sin(u * Math.PI * 2); break;
        default: f = 0.8 * Math.sin(u * Math.PI) - 0.2 * u; // barrel
      }
      const e = edits[k] || {};
      // sizes swing about the base ring, inside what can be bent
      const C = clampC(C0 + f * 0.9 + (e.dC || 0));
      const y = y0 + k * (b.gap || 0.55) + (e.dy || 0); const off = Math.tan(lean) * (y - y0);
      // the ring's own tip: none for the base ring on the ground, then towards a direction that turns with the twist
      const phi = az + k * twist + (e.az != null ? e.az * DEG : 0); let t = k === 0 ? 0 : tilt;
      if (b.tiltMode === 'alt') t *= k % 2 ? 1 : -1; else if (b.tiltMode === 'open') t *= u;
      if (e.tilt != null) t = e.tilt * DEG;
      const lt = lean * 0.6 * u; const nrm = M.norm([Math.tan(lt) * dir[0] + Math.tan(t) * Math.cos(phi), 1, Math.tan(lt) * dir[2] + Math.tan(t) * Math.sin(phi)]);
      // centres drift round a helix that widens up the stack
      const dr = drift * u; const c = [b.x + off * dir[0] + dr * Math.cos(phi + Math.PI / 2) + (e.dx || 0), y, b.z + off * dir[2] + dr * Math.sin(phi + Math.PI / 2) + (e.dz || 0)];
      // a tipped ring must clear the ground
      const reach = C / TAU * Math.sqrt(Math.max(0, 1 - nrm[1] * nrm[1])); if (k > 0 && c[1] - reach < 0.06) c[1] = 0.06 + reach;
      out.push({ k, c, C, n: nrm });
    }
    return out;
  }
  // a fixed frame on each ring so the same angle lines up from ring to ring
  function basis(nrm) { const x = [1, 0, 0]; let u = M.sub(x, M.mul(nrm, M.dot(x, nrm))); u = M.norm(u); const w = M.norm(M.cross(nrm, u)); return { u, w }; }
  function ringPoint(r, th) { const R = r.C / TAU; const { u, w } = basis(r.n); return M.add(r.c, M.add(M.mul(u, R * Math.cos(th)), M.mul(w, R * Math.sin(th)))); }
  // where on a closed ring of n nodes the angle th falls: node and fraction to the next
  function ringAt(n, th) { const s = ((th / TAU) % 1 + 1) % 1 * n; const i = Math.floor(s) % n; return { i, t: Math.round((s - Math.floor(s)) * 1000) / 1000 }; }
  // nearest point of an open polyline to p: segment and fraction
  function nearestOn(pts, p) { let bi = 0, bt = 0, bd = Infinity; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], ab = M.sub(pts[i + 1], a); const t = M.clamp(M.dot(M.sub(p, a), ab) / Math.max(1e-12, M.dot(ab, ab)), 0, 1); const d = M.dist(M.add(a, M.mul(ab, t)), p); if (d < bd) { bd = d; bi = i; bt = t; } } return { i: bi, t: Math.round(bt * 1000) / 1000, d: bd }; }
  // the tightest curvature along a polyline (1/m)
  function maxCurv(P) { let k = 0; for (let i = 1; i < P.length - 1; i++) { const a = M.sub(P[i], P[i - 1]), b = M.sub(P[i + 1], P[i]); const la = M.len(a), lb = M.len(b); if (la < 1e-9 || lb < 1e-9) continue; k = Math.max(k, Math.acos(M.clamp(M.dot(a, b) / la / lb, -1, 1)) / ((la + lb) / 2)); } return k; }
  const inDoor =(b, th, y) => { if (!b.door) return false; const a = ((th - (b.doorAz || 0) * Math.PI / 180) % TAU + TAU) % TAU; const half = 0.42 / (b.C / TAU); return (a < half || a > TAU - half) && y < 1.9; };

  // ---------------------------------------------------------------- one basket into the model
  // returns the rods it added; stage s is the first stage, later steps take new stages (rings go up one at a time)
  function build(m, b, s) {
    const mat = m.material; const R = rings(b); const out = []; const rnd = M.rng((b.seed || 3) * 7919 + (parseInt(String(b.id).replace(/\D/g, ''), 10) || 1));
    const tag = (r, part) => { r.bk = b.id; r.part = part; out.push(r); return r; };
    const bolt = { type: 'bolt' };
    const ringRods = []; let stage = s;
    // the braces' angles: an even count, spaced on the smallest ring
    const Cmin = Math.min(...R.map((r) => r.C)); let N = Math.max(6, Math.round(Cmin / (b.spacing || 0.5))); if (N % 2) N++;
    const D = TAU / N; const off0 = rnd() * D;
    const addRing = (r, held) => {
      const n = Math.max(24, Mo.segCount(r.C, mat)); const pts = Array.from({ length: n }, (_, i) => ringPoint(r, TAU * i / n));
      const rod = tag(Mo.makeRod(m, 'ring', pts, r.C, stage, true, { profile: 'ring', held, cls: 'soak' }), 'ring'); rod.rk = r.k; ringRods.push({ rod, r, n });
      // bolted where it crosses any ring already up: its own stack's, and (when baskets are tied) its neighbours'
      connectRing(m, rod, stage, b.ties !== false); return rod;
    };
    const tieToRing = (rod, i, t, k, th) => { const R0 = ringRods[k]; if (!R0) return; const q = ringAt(R0.n, th); Mo.addJoint(m, rod.id, i, R0.rod.id, q.i, stage, Object.assign({}, bolt, t > 0.001 ? { ta: t } : {}, q.t > 0.001 ? { tb: q.t } : {})); };
    // a stick along points: smoothed, cut to its stock, lashed where it passes each ring
    const stick = (P, part, ringHits, ground) => {
      const S = P.length > 2 ? Mo.smoothThrough(P) : P; const L = Mo.polyLen(S, false); if (L < 0.2) return null; const n = Mo.segCount(L, mat) + 1;
      const pts = Mo.resample(S, n, false);
      // bent cold if it can spring that far, otherwise soaked and bent over the formwork first (it then keeps that shape)
      const strain = maxCurv(pts) * 0.01; const soak = strain > (mat.elastic_strain || 0.004);
      const rod = tag(Mo.makeRod(m, part === 'brace' ? 'brace' : 'stake', pts, L, stage, false, Object.assign({ profile: 'stick', cls: soak ? 'soak' : pts.length > 2 && strain > 1e-4 ? 'cold' : 'straight' }, soak ? { rest: pts } : {})), part);
      for (const h of ringHits) { const q = nearestOn(rod.pts, h.p); if (q.d < 0.08) tieToRing(rod, q.i, q.t, h.k, h.th); }
      if (ground) { rod.pts[0][1] = 0; rod.fix = [{ i: 0, p: [rod.pts[0][0], 0, rod.pts[0][2]], d: [0, 1, 0] }]; }
      return rod;
    };
    // 1. the base ring on the ground, pegged at four points (or held up on its stakes)
    const base = addRing(R[0], b.ground === 'staked');
    if (b.ground !== 'staked') { const n = ringRods[0].n; base.fix = [0, 1, 2, 3].map((q) => { const i = Math.round(q * n / 4) % n; return { i, p: base.pts[i].slice() }; }); for (const f of base.fix) { f.p[1] = Math.max(0.01, f.p[1]); } }
    // 2. each ring above goes up on its formwork, then is braced to the one below
    // the stack's top: sticks run on past the last ring and gather to a point (top 'point'), or flare out (tops)
    const Rt = R[R.length - 1]; const apexH = b.apex != null ? b.apex : 0.6 + 0.9 * Rt.C / TAU; const apex = M.add(Rt.c, M.mul(Rt.n, apexH));
    const toApex = (Q) => { const last = Q[Q.length - 1]; const mid = M.lerp3(last, apex, 0.55); const rad = M.sub(mid, M.add(Rt.c, M.mul(Rt.n, apexH * 0.55))); const lr = M.len(rad);
      Q.push(M.add(mid, lr > 1e-6 ? M.mul(rad, 0.25) : [0, 0, 0])); Q.push(apex); return Q; };
    const crown = [];
    const ext = (i) => (b.tops || 0) * (0.35 + 0.65 * rnd()) * (0.6 + 0.4 * Math.cos(off0 + i * D - (b.az || 0) * Math.PI / 180));
    if (b.brace === 'diagonal') {
      for (let k = 1; k < R.length; k++) {
        stage = Mo.nextStage(m); addRing(R[k], true);
        const sh = ((k - 1) % 2) * D; // a Warren truss: braces meet in Vs, and each gap's tops are the next gap's bottoms
        for (let i = 0; i < N; i++) {
          const a = (q) => off0 + sh + q * D; const thB = i % 2 ? a(i + 1) : a(i), thT = i % 2 ? a(i) : a(i + 1);
          const pB = ringPoint(R[k - 1], thB), pT = ringPoint(R[k], thT);
          if (inDoor(b, thB, pB[1]) || inDoor(b, thT, pT[1]) || M.dist(pB, pT) < 0.25) continue;
          stick([pB, pT], 'brace', [{ p: pB, k: k - 1, th: thB }, { p: pT, k, th: thT }]);
        }
      }
      // the top ring gets short crown sticks when there are tops
      if (b.top === 'point') { stage = Mo.nextStage(m); const k = R.length - 1; for (let i = 0; i < N; i += 2) { const th = off0 + i * D; const p = ringPoint(R[k], th); const p2 = ringPoint(R[k - 1] || R[k], th); const Q = toApex([M.sub(p, M.mul(M.norm(M.sub(p, p2)), 0.25)), p]); const sr = stick(Q, 'stake', [{ p, k, th }]); if (sr) crown.push(sr); } }
      else if (b.tops > 0) { stage = Mo.nextStage(m); const k = R.length - 1; for (let i = 0; i < N; i += 2) { const th = off0 + i * D; const p = ringPoint(R[k], th); const p2 = ringPoint(R[k - 1] || R[k], th); const d = M.norm(M.sub(p, p2)); const e = ext(i); if (e < 0.15) continue; stick([M.sub(p, M.mul(d, 0.25)), p, M.add(p, M.mul(d, e))], 'stake', [{ p, k, th }]); } }
    } else {
      // rings first (each its own stage on the formwork), then the long sticks through all of them
      for (let k = 1; k < R.length; k++) { stage = Mo.nextStage(m); addRing(R[k], true); }
      const fams = b.brace === 'lattice' ? [1, -1] : b.brace === 'spiral' ? [1] : [0];
      const per = b.brace === 'lattice' ? N / 2 : N;
      for (const sgn of fams) {
        stage = Mo.nextStage(m);
        for (let i = 0; i < per; i++) {
          const th0 = off0 + (b.brace === 'lattice' ? 2 * i * D + (sgn < 0 ? 0 : 0) : i * D); const P = [], hits = []; let door = false;
          for (let k = 0; k < R.length; k++) { const th = th0 + sgn * k * D * (b.brace === 'spiral' ? 0.5 : 1); const p = ringPoint(R[k], th); if (inDoor(b, th, p[1])) door = true; P.push(p); hits.push({ p, k, th }); }
          if (door) { // the doorway: sticks start above it
            while (hits.length && inDoor(b, hits[0].th, hits[0].p[1])) { hits.shift(); P.shift(); }
            if (hits.length < 2) continue;
          }
          // where rings tip into each other a stick can't run smoothly through them: it is cut there and carries on as
          // a new stick from the same ring (the two overlap at that bolt); rings closer than 0.22 m are skipped (they are bolted)
          const runs = []; let cur = [];
          for (const hh of hits) {
            if (cur.length) { const pv = cur[cur.length - 1]; if (M.dist(pv.p, hh.p) < 0.22) continue;
              if (cur.length >= 2) { const d1 = M.norm(M.sub(pv.p, cur[cur.length - 2].p)), d2 = M.norm(M.sub(hh.p, pv.p)); if (M.dot(d1, d2) < Math.cos(30 * DEG)) { runs.push(cur); cur = [pv]; } } }
            cur.push(hh);
          }
          runs.push(cur);
          runs.forEach((run, ri) => {
            if (run.length < 2) return; const Q = run.map((x) => x.p); const ground = ri === 0 && b.ground === 'staked' && !door; if (ground) Q.unshift([Q[0][0], 0, Q[0][2]]);
            if (ri === runs.length - 1 && b.top === 'point' && run[run.length - 1].k === R.length - 1) toApex(Q);
            else if (ri === runs.length - 1) { const last = Q[Q.length - 1], prev = Q[Q.length - 2]; const e = ext(i * 2 + (sgn < 0 ? 1 : 0)); if (e > 0.1) Q.push(M.add(last, M.mul(M.norm(M.sub(last, prev)), e))); }
            const sr = stick(Q, 'stake', run, ground); if (sr && b.top === 'point' && ri === runs.length - 1 && run[run.length - 1].k === R.length - 1) crown.push(sr);
          });
        }
      }
    }
    // 3. the formwork comes out: the basket stands on its own
    // the point: the sticks' ends bound together in pairs round the crown, and each to the one opposite
    if (crown.length > 1) { const ends = crown.map((r) => r.pts.length - 1); for (let i = 0; i < crown.length; i++) { const j = (i + 1) % crown.length; Mo.addJoint(m, crown[i].id, ends[i], crown[j].id, ends[j], stage, { wraps: 2 }); }
      if (crown.length > 3) { const h2 = crown.length >> 1; for (let i = 0; i < h2; i++) Mo.addJoint(m, crown[i].id, ends[i], crown[i + h2].id, ends[i + h2], stage, { wraps: 2 }); } }
    if (b.strike !== 'end') { stage = Mo.nextStage(m); Mo.release(m, stage, new Set(out.map((r) => r.id))); }
    return out;
  }

  // closest points of segments pq and rs: fractions s, t along each and the gap d
  function segSeg(p, q, r, s2) {
    const d1 = M.sub(q, p), d2 = M.sub(s2, r), w = M.sub(p, r); const a = M.dot(d1, d1), b = M.dot(d1, d2), c = M.dot(d2, d2), d = M.dot(d1, w), e = M.dot(d2, w); const den = a * c - b * b;
    let s = den > 1e-12 ? M.clamp((b * e - c * d) / den, 0, 1) : 0; let t = c > 1e-12 ? M.clamp((b * s + e) / c, 0, 1) : 0; s = a > 1e-12 ? M.clamp((b * t - d) / a, 0, 1) : 0;
    return { s, t, d: M.dist(M.add(p, M.mul(d1, s)), M.add(r, M.mul(d2, t))) };
  }
  // bolt a ring, as it goes up, to every ring already standing that it crosses or passes within a bolt's reach of
  // (two bolts per pair, well apart). Rings that tip into each other are joined this way, as are baskets that overlap.
  function connectRing(m, rod, stage, others) {
    const out = []; const na = rod.pts.length; const free = !!rod.fr; const reach = free ? 0.35 : 0.09; const bb = boxOf(rod.pts, reach);
    for (const B of Array.from(m.rods.values())) {
      if (B === rod || B.kind !== 'ring' || !B.bk || (!others && B.bk !== rod.bk)) continue; if (!overlaps(bb, boxOf(B.pts, 0.02))) continue;
      const nb = B.pts.length; const best = [];
      for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) { const q = segSeg(rod.pts[i], rod.pts[(i + 1) % na], B.pts[j], B.pts[(j + 1) % nb]); if (q.d < reach) best.push({ i, j, s: q.s, t: q.t, d: q.d }); }
      best.sort((x, y) => x.d - y.d); const used = [];
      for (const t of best) {
        if (used.some((u) => { const di = Math.abs(u.i - t.i); return Math.min(di, na - di) < 3; })) continue; used.push(t);
        const ta = t.s > 0.001 ? { ta: Math.round(t.s * 1000) / 1000 } : {}, tb = t.t > 0.001 ? { tb: Math.round(t.t * 1000) / 1000 } : {};
        if (t.d < 0.12) out.push(Mo.addJoint(m, rod.id, t.i, B.id, t.j, stage, Object.assign({ type: 'bolt' }, ta, tb)));
        else { // a free ring passing near another: a short block between them, bolted to each
          const pa = M.lerp3(rod.pts[t.i], rod.pts[(t.i + 1) % na], t.s), pb = M.lerp3(B.pts[t.j], B.pts[(t.j + 1) % nb], t.t);
          const blk = Mo.makeRod(m, 'brace', Mo.resample([pa, pb], 6, false), t.d, stage, false, { profile: 'stick', cls: 'straight' }); blk.bk = rod.bk; blk.part = 'block'; blk.fr = undefined;
          out.push(Mo.addJoint(m, blk.id, 0, rod.id, t.i, stage, Object.assign({ type: 'bolt' }, t.s > 0.001 ? { tb: Math.round(t.s * 1000) / 1000 } : {})), Mo.addJoint(m, blk.id, 5, B.id, t.j, stage, Object.assign({ type: 'bolt' }, tb)));
        }
        if (used.length >= 2) break;
      }
    }
    return out;
  }
  function boxOf(P, pad) { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const p of P) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], p[c] - pad); hi[c] = Math.max(hi[c], p[c] + pad); } return { lo, hi }; }
  const overlaps = (a, b) => [0, 1, 2].every((c) => a.lo[c] <= b.hi[c] && b.lo[c] <= a.hi[c]);
  // bolt baskets to each other where their rings meet (designs from before rings were bolted as they went up)
  function tie(m, stage) {
    const rs = Array.from(m.rods.values()).filter((r) => r.bk && r.kind === 'ring'); const out = [];
    for (let a = 0; a < rs.length; a++) for (let c = a + 1; c < rs.length; c++) {
      const A = rs[a], B = rs[c]; if (A.bk === B.bk) continue; const best = []; const na = A.pts.length, nb = B.pts.length;
      // where the two rings actually cross (or pass within a bolt's reach): the closest points of each pair of segments
      for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
        const q = segSeg(A.pts[i], A.pts[(i + 1) % na], B.pts[j], B.pts[(j + 1) % nb]); if (q.d < 0.09) best.push({ i, j, s: q.s, t: q.t, d: q.d });
      }
      best.sort((x, y) => x.d - y.d); const used = [];
      for (const t of best) { if (used.some((u) => { const di = Math.abs(u.i - t.i); return Math.min(di, na - di) < 3; })) continue; used.push(t); out.push(Mo.addJoint(m, A.id, t.i, B.id, t.j, stage, Object.assign({ type: 'bolt' }, t.s > 0.001 ? { ta: Math.round(t.s * 1000) / 1000 } : {}, t.t > 0.001 ? { tb: Math.round(t.t * 1000) / 1000 } : {}))); if (used.length >= 2) break; }
    }
    return out;
  }
  // the basket's surface: point (u, th) on the ruled surface through its rings, u = 0 at the base ring, 1 at the next...
  function surf(R, u, th) { const K = R.length; if (K === 1) return ringPoint(R[0], th); const k = M.clamp(Math.floor(u), 0, K - 2); const f = u - k; return M.lerp3(ringPoint(R[k], th), ringPoint(R[k + 1], th), f); }
  // which way a cladding stick runs at (u, th): its angle from straight up the surface
  function cladAngle(mode, b, o, u, th, K, rnd) {
    const jit = ((o.cladAngle == null ? 55 : o.cladAngle) / 55) * 14 * DEG * (rnd() - 0.5) * 2; const hand = (b.twist || 0) < 0 ? -1 : 1;
    switch (mode) {
      case 'rings': return Math.PI / 2 * (rnd() < 0.5 ? 1 : -1) + jit * 0.6;
      case 'twist': return hand * (38 * DEG + 0.25 * Math.sin(2 * th + u)) + jit;
      case 'rise': return jit * 0.8;
      case 'flow': return hand * (10 * DEG + 75 * DEG * Math.min(1, u / Math.max(1, K - 1)) ** 1.3) + jit * 0.7;
      default: return (rnd() < 0.5 ? -1 : 1) * (0.15 + 0.85 * rnd()) * (o.cladAngle || 55) * DEG;
    }
  }
  // cladding: thin sticks laid over the outside of a basket, following a direction over its surface (along the rings,
  // with the twist, rising, or flowing from one to the other), lashed wherever they cross the basket's rings and sticks,
  // their ends running on past it. Only sticks held in three places or more are kept. They go on band by band, bottom up.
  function clad(m, b, o, stage) {
    const mat = m.material; const R = rings(b); const K = R.length; const rnd = M.rng((b.seed || 3) * 104729 + 17); const out = []; if (K < 2) return out;
    const mode = b.cladDir || o.cladDir || 'random';
    // what a cladding stick can be lashed to: this basket's rings, stakes and braces (segments in a grid)
    const cs = 0.35; const grid = new Map(); const key = (x, y, z) => x + ',' + y + ',' + z;
    for (const r of m.rods.values()) { if (r.bk !== b.id || r.kind === 'clad') continue; const n = r.pts.length; const segs = r.closed ? n : n - 1;
      for (let j = 0; j < segs; j++) { const a = r.pts[j], c = r.pts[(j + 1) % n]; const mid = M.lerp3(a, c, 0.5); const g = key(...mid.map((v) => Math.floor(v / cs))); let l = grid.get(g); if (!l) grid.set(g, l = []); l.push({ r, j, a, c }); } }
    const area = R.reduce((a, r) => a + r.C, 0) / K * Math.max(0.5, M.dist(R[0].c, R[K - 1].c) + 0.4);
    const count = Math.max(6, Math.round((b.cladDensity || o.cladDensity || 5) * area)); const reach = o.cladReach == null ? 0.5 : o.cladReach;
    const bands = Array.from({ length: K - 1 }, () => []);
    for (let q = 0; q < count; q++) {
      // the rings mode lays sticks close along a ring (so they are lashed to it); the others start anywhere
      const u0 = mode === 'rings' && rnd() < 0.7 ? M.clamp(Math.round(rnd() * (K - 1)) + (rnd() - 0.5) * 0.25, 0, K - 1) : rnd() * (K - 1) * 1.04;
      const th0 = TAU * rnd(); const L = (o.cladLen || 2.6) * (mode === 'rings' ? 0.9 : 0.8) * (0.6 + 0.8 * rnd()); const a0 = cladAngle(mode, b, o, u0, th0, K, rnd);
      const half = (dir) => { const P = []; let u = u0, th = th0, s = 0; const ds = 0.1;
        while (s < L / 2) {
          if (u < 0 || u > K - 1) { if (P.length < 2) break; const d = M.norm(M.sub(P[P.length - 1], P[P.length - 2])); const run = Math.min(L / 2 - s, reach * (0.4 + 0.6 * rnd())); const e = M.add(P[P.length - 1], M.mul(d, run)); if (e[1] > 0.03) P.push(e); break; }
          const p = surf(R, u, th); if (p[1] < 0.03) break; P.push(p);
          const al = mode === 'random' ? a0 : a0 + (cladAngle(mode, b, o, u, th, K, () => 0.5) - cladAngle(mode, b, o, u0, th0, K, () => 0.5));
          const e = 1e-3; const Pu = M.len(M.sub(surf(R, M.clamp(u + e, 0, K - 1), th), surf(R, M.clamp(u - e, 0, K - 1), th))) / (2 * e) || 0.5; const Pt = M.len(M.sub(surf(R, u, th + e), surf(R, u, th - e))) / (2 * e) || 0.5;
          u += dir * ds * Math.cos(al) / Pu; th += dir * ds * Math.sin(al) / Pt; s += ds;
        }
        return P; };
      const up = half(1), dn = half(-1); const P = dn.reverse().concat(up.slice(1)); if (P.length < 4) continue;
      // the surface between rings is ruled, so it creases at each ring: a stick laid over it bends smoothly instead
      for (let it = 0; it < 6; it++) for (let i = 1; i < P.length - 1; i++) P[i] = M.lerp3(P[i], M.lerp3(P[i - 1], P[i + 1], 0.5), 0.5);
      const Lp = Mo.polyLen(P, false); const n = Mo.segCount(Lp, mat) + 1; const pts = Mo.resample(P, n, false);
      // lashed wherever it crosses the basket's rods: at most one per 0.35 m of stick, at most five
      const cand = [];
      for (let i = 0; i < n - 1; i++) { const mid = M.lerp3(pts[i], pts[i + 1], 0.5); const ci = mid.map((v) => Math.floor(v / cs));
        for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) for (const sg of grid.get(key(ci[0] + x, ci[1] + y, ci[2] + z)) || []) {
          const g = segSeg(pts[i], pts[i + 1], sg.a, sg.c); if (g.d < 0.07) cand.push({ i, s: g.s, rod: sg.r.id, j: sg.j, t: g.t, d: g.d, at: (i + g.s) * Lp / (n - 1) }); } }
      cand.sort((x, y) => x.d - y.d); const ties = [];
      for (const c of cand) { if (ties.some((t) => Math.abs(t.at - c.at) < 0.35)) continue; ties.push(c); if (ties.length >= 5) break; }
      // two lashings leave a curved stick free to swing round the line between them: three hold it
      if (ties.length < 3) continue;
      bands[M.clamp(Math.floor(u0), 0, K - 2)].push({ pts, Lp, ties });
    }
    // band by band, bottom up: each band its own stage
    bands.forEach((list, k) => {
      if (!list.length) return; if (k > 0 || out.length) stage = Mo.nextStage(m);
      for (const c of list) {
        // pre-bent (soaked) only if it really curves: a nearly straight stick's shape gives no hold on which way it turns
        const sag = Math.max(...c.pts.map((q) => { const A = c.pts[0], Bq = c.pts[c.pts.length - 1]; const ab = M.sub(Bq, A); const t = M.clamp(M.dot(M.sub(q, A), ab) / Math.max(1e-9, M.dot(ab, ab)), 0, 1); return M.dist(q, M.add(A, M.mul(ab, t))); }));
        const strain = maxCurv(c.pts) * SF.Phys.sectionOf(mat, { profile: 'clad' }).c1 * 1.15; const soak = strain > 0.5 * (mat.elastic_strain || 0.004) && sag > 0.04;
        if (!soak && strain > 0.5 * (mat.elastic_strain || 0.004)) continue;
        if (soak && (c.ties.length < 4 || c.Lp < 1.3)) continue; // a short pre-bent piece held at three points rocks on its lashings: it needs four // kinked but not curved enough to pre-bend: it would crack bent cold
        const rod = Mo.makeRod(m, 'clad', c.pts, c.Lp, stage, false, Object.assign({ profile: 'clad', cls: soak ? 'soak' : 'cold' }, soak ? { rest: c.pts } : {})); rod.bk = b.id; rod.part = 'clad'; rod.band = k; out.push(rod);
        for (const t of c.ties) Mo.addJoint(m, rod.id, t.i, t.rod, t.j, stage, Object.assign({}, t.s > 0.001 ? { ta: Math.round(t.s * 1000) / 1000 } : {}, t.t > 0.001 ? { tb: Math.round(t.t * 1000) / 1000 } : {}));
      }
    });
    return out;
  }
  // ---------------------------------------------------------------- free rings: placed one by one, any way up
  // a free ring: centre c, round C, its normal tipped tilt° from straight up towards az° (90 stands it on edge)
  function netOpts() { return { clad: true, density: 6, len: 1.9, spin: 0.4, hug: 0.8, reach: 0.4, seed: 5 }; }
  function freeRing(f) {
    const t = (f.tilt || 0) * DEG, a = (f.az || 0) * DEG; const n = [Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)]; const C = clampC(f.C || 4.4); const c = (f.c || [0, 1, 0]).slice();
    const reach = C / TAU * Math.sqrt(Math.max(0, 1 - n[1] * n[1])); const grounded = c[1] - reach < 0.12; if (grounded) c[1] = reach + 0.02;
    return { k: 0, c, C, n, grounded, flat: Math.abs(n[1]) > 0.94 };
  }
  // one free ring into the model: on its formwork (unless it lies flat on the ground), pegged where it meets the ground,
  // bolted wherever it crosses a ring already up
  function buildFree(m, f, stage) {
    const r = freeRing(f); const n = Math.max(24, Mo.segCount(r.C, m.material)); const pts = Array.from({ length: n }, (_, i) => ringPoint(r, TAU * i / n));
    const rod = Mo.makeRod(m, 'ring', pts, r.C, stage, true, { profile: 'ring', held: !(r.grounded && r.flat), cls: 'soak' }); rod.bk = 'net'; rod.fr = f.id; rod.part = 'ring';
    if (r.grounded) { let lo = 0; rod.pts.forEach((p, i) => { if (p[1] < rod.pts[lo][1]) lo = i; }); const feet = r.flat ? [0, 1, 2, 3].map((q) => Math.round(q * n / 4) % n) : [(lo - 1 + n) % n, lo, (lo + 1) % n]; rod.fix = feet.map((i) => ({ i, p: [rod.pts[i][0], Math.max(0.01, rod.pts[i][1]), rod.pts[i][2]] })); }
    connectRing(m, rod, stage, true); return rod;
  }
  // a run of rings swept from a to b: the path can arch up (lift) or coil round its line (coil), the rings stand across
  // the path (tip 0) or lie along it (tip 90), turn round it by twist° from end to end, and swell, taper or pulse in size
  function sweep(a, b, o, ids) {
    o = Object.assign({ count: 7, lift: 0.8, coil: 0, turns: 1, tip: 70, twist: 180, size: 'swell', C: 4.4, roll: 0 }, o || {}); const out = []; const n = Math.max(2, Math.min(24, Math.round(o.count)));
    const ab = M.sub(b, a); const Lh = Math.max(0.1, M.len(ab)); const T0 = M.norm(ab); const side = M.norm(M.cross(T0, Math.abs(T0[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0])); const upv = M.norm(M.cross(side, T0));
    const path = (s) => { const base = M.add(a, M.mul(ab, s)); const lift = M.mul(upv, 4 * o.lift * s * (1 - s)); const ang = TAU * o.turns * s; const coil = M.add(M.mul(side, o.coil * Math.cos(ang)), M.mul(upv, o.coil * Math.sin(ang))); return M.add(base, M.add(lift, coil)); };
    for (let i = 0; i < n; i++) {
      const s = n > 1 ? i / (n - 1) : 0.5; const p = path(s); const T = M.norm(M.sub(path(Math.min(1, s + 0.01)), path(Math.max(0, s - 0.01))));
      const S = M.norm(M.cross(T, [0, 1, 0])); const U = M.norm(M.cross(S, T)); const psi = ((o.roll || 0) + (o.twist || 0) * s) * DEG; const tip = (o.tip || 0) * DEG;
      const nrm = M.norm(M.add(M.mul(T, Math.cos(tip)), M.mul(M.add(M.mul(S, Math.cos(psi)), M.mul(U, Math.sin(psi))), Math.sin(tip))));
      let C = o.C; if (o.size === 'swell') C = o.C + 0.8 * Math.sin(Math.PI * s) - 0.4; else if (o.size === 'taper') C = o.C + 0.6 - 1.2 * s; else if (o.size === 'pulse') C = o.C + (i % 2 ? -0.5 : 0.4);
      const v = nrm[1] < 0 ? M.mul(nrm, -1) : nrm; const tilt = Math.acos(M.clamp(v[1], -1, 1)) / DEG; const az = Math.atan2(v[2], v[0]) / DEG;
      out.push({ id: ids ? ids() : 'F' + (i + 1), c: p.map((x) => Math.round(x * 1000) / 1000), C: Math.round(clampC(C) * 100) / 100, tilt: Math.round(tilt * 10) / 10, az: Math.round(az * 10) / 10 });
    }
    return out;
  }
  // whole-set moves for free rings: copies round a centre, a mirror, a twist that grows with height, a shake, a resize
  function ringOps(list, op, o, nextId) {
    o = o || {}; const L0 = list.map((f) => JSON.parse(JSON.stringify(f))); if (!L0.length) return L0; const cx = L0.reduce((a, f) => a + f.c[0], 0) / L0.length, cz = L0.reduce((a, f) => a + f.c[2], 0) / L0.length;
    const rot = (f, deg, y) => { const a = deg * DEG; const x = f.c[0] - cx, z = f.c[2] - cz; f.c[0] = Math.round((cx + x * Math.cos(a) - z * Math.sin(a)) * 1000) / 1000; f.c[2] = Math.round((cz + x * Math.sin(a) + z * Math.cos(a)) * 1000) / 1000; f.az = ((f.az || 0) + deg) % 360; void y; return f; };
    if (op === 'array') { const k = Math.max(2, Math.min(8, o.count || 3)); const out = L0.slice(); for (let j = 1; j < k; j++) for (const f of L0) out.push(Object.assign(rot(JSON.parse(JSON.stringify(f)), 360 * j / k), { id: nextId() })); return out; }
    if (op === 'mirror') { const out = L0.slice(); for (const f of L0) { const g = JSON.parse(JSON.stringify(f)); g.id = nextId(); g.c[0] = Math.round((2 * cx - f.c[0] + (o.gap || 0)) * 1000) / 1000; g.az = 180 - (f.az || 0); out.push(g); } return out; }
    if (op === 'twist') { const ys = L0.map((f) => f.c[1]); const y0 = Math.min(...ys), y1 = Math.max(...ys); return L0.map((f) => rot(f, (o.deg || 45) * (y1 > y0 ? (f.c[1] - y0) / (y1 - y0) : 0))); }
    if (op === 'shake') { const rnd = M.rng(o.seed || 7); return L0.map((f) => Object.assign(f, { tilt: M.clamp((f.tilt || 0) + (rnd() - 0.5) * 2 * (o.deg || 15), 0, 180), az: (f.az || 0) + (rnd() - 0.5) * 4 * (o.deg || 15), c: [f.c[0] + (rnd() - 0.5) * 0.3, f.c[1] + (rnd() - 0.5) * 0.2, f.c[2] + (rnd() - 0.5) * 0.3].map((v) => Math.round(v * 1000) / 1000) })); }
    if (op === 'size') return L0.map((f) => Object.assign(f, { C: Math.round(clampC((f.C || 4.4) + (o.dC || 0.2)) * 100) / 100 }));
    return L0;
  }
  // what a person with a ladder, bolts and clamps can and can't do with the free rings
  function freeChecks(m) {
    const out = []; const rings = Array.from(m.rods.values()).filter((r) => r.fr); const defs = new Map((m.meta.free || []).map((f) => [f.id, f]));
    for (const r of rings) {
      const f = defs.get(r.fr); const g = f ? freeRing(f) : null; const P = g ? Array.from({ length: 24 }, (_, i) => ringPoint(g, TAU * i / 24)) : r.pts;
      const bolts = m.joints.filter((j) => (j.a === r.id || j.b === r.id) && j.type === 'bolt').length; const top = Math.max(...P.map((p) => p[1])); const low = Math.min(...P.map((p) => p[1]));
      if (low > 0.05 && bolts < 2) out.push({ id: r.id, level: 'crit', text: r.fr + ' floats: it is bolted ' + (bolts ? 'at only one place' : 'to nothing') + '. Move it into or beside another ring (within 35 cm), or set it on the ground' });
      else if (low > 0.05 && bolts < 3) out.push({ id: r.id, level: 'warn', text: r.fr + ' hangs on two bolts: it can swing about them until something else holds it' });
      if (top > 3.6) out.push({ id: r.id, level: 'warn', text: r.fr + ' reaches ' + top.toFixed(1) + ' m: bolting it needs a scaffold tower, not a ladder' });
      else if (top > 2.4) out.push({ id: r.id, level: 'info', text: r.fr + ' reaches ' + top.toFixed(1) + ' m: bolt it from a ladder' });
    }
    // bolts where two rings cross at a glancing angle are hard to drill through: they need a block between
    for (const j of m.joints) { if (j.type !== 'bolt') continue; const A = m.rods.get(j.a), B2 = m.rods.get(j.b); if (!A || !B2 || A.kind !== 'ring' || B2.kind !== 'ring' || !(A.fr || B2.fr)) continue;
      const ta = Mo.tangentAt(A, j.ia), tb = Mo.tangentAt(B2, j.ib); const ang = Math.acos(Math.min(1, Math.abs(M.dot(ta, tb)))) / DEG; if (ang < 15) out.push({ id: A.fr ? A.id : B2.id, level: 'warn', text: 'rings cross at only ' + ang.toFixed(0) + '° at ' + j.id + ': bolt through a block between them' }); }
    return out;
  }
  // cladding grown over the free rings: each stick starts beside a ring and follows the rings' flow, running along the
  // nearest rings, spinning round them (spin) and held close to them (hug), lashed wherever it passes a rod
  function cladNet(m, o, stage) {
    const mat = m.material; const rnd = M.rng((o.seed || 5) * 7907 + 3); const out = [];
    const rings = Array.from(m.rods.values()).filter((r) => r.kind === 'ring').map((r) => { const n = r.pts.length; const c = r.pts.reduce((a, p) => M.add(a, p), [0, 0, 0]).map((v) => v / n); let nv = [0, 0, 0]; for (let i = 0; i < n; i++) nv = M.add(nv, M.cross(M.sub(r.pts[i], c), M.sub(r.pts[(i + 1) % n], c))); nv = M.norm(nv); const R = r.pts.reduce((a, p) => a + M.dist(p, c), 0) / n; return { r, c, n: nv, R }; });
    if (!rings.length) return out;
    const near = (p) => rings.map((g) => { const q0 = M.sub(p, g.c); const q = M.sub(q0, M.mul(g.n, M.dot(q0, g.n))); const lq = M.len(q); const dir = lq > 1e-6 ? M.mul(q, 1 / lq) : perp(g.n); const np = M.add(g.c, M.mul(dir, g.R)); return { g, np, d: M.dist(p, np), t: M.norm(M.cross(g.n, dir)) }; });
    const cs = 0.35; const grid = new Map(); const key = (x, y, z) => x + ',' + y + ',' + z;
    for (const r of m.rods.values()) { if (r.kind === 'clad') continue; const n = r.pts.length; const segs = r.closed ? n : n - 1; for (let j = 0; j < segs; j++) { const a = r.pts[j], c = r.pts[(j + 1) % n]; const g = key(...M.lerp3(a, c, 0.5).map((v) => Math.floor(v / cs))); let l = grid.get(g); if (!l) grid.set(g, l = []); l.push({ r, j, a, c }); } }
    const total = rings.reduce((a, g) => a + TAU * g.R, 0); const count = Math.max(8, Math.round((o.density || 6) * total * 0.5)); const sig = 0.45;
    const cl = SF.Phys.sectionOf(mat, { profile: 'clad' }).c1 * 1.15; const el = mat.elastic_strain || 0.004;
    for (let q = 0; q < count; q++) {
      const g0 = rings[Math.floor(rnd() * rings.length)]; const th = TAU * rnd(); const { u, w } = basis(g0.n); const radial = M.add(M.mul(u, Math.cos(th)), M.mul(w, Math.sin(th)));
      const off = M.add(M.mul(radial, (rnd() - 0.5) * 0.08), M.mul(g0.n, (rnd() - 0.5) * 0.08)); let p = M.add(M.add(g0.c, M.mul(radial, g0.R)), off); if (p[1] < 0.05) continue;
      let d = M.mul(M.norm(M.cross(g0.n, radial)), rnd() < 0.5 ? 1 : -1); const L = (o.len || 2.6) * (0.6 + 0.8 * rnd()); const P = [p]; const hand = rnd() < 0.5 ? 1 : -1;
      for (let s = 0; s < L; s += 0.08) {
        let f = [0, 0, 0], wsum = 0, best = null;
        for (const h of near(p)) { const wgt = Math.exp(-((h.d / sig) ** 2)); if (!best || h.d < best.d) best = h; if (wgt < 1e-3) continue; let t = h.t; if (M.dot(t, d) < 0) t = M.mul(t, -1); const rr = M.sub(p, h.np); const rl = M.len(rr); const spinv = rl > 1e-6 ? M.norm(M.cross(t, M.mul(rr, 1 / rl))) : [0, 0, 0]; f = M.add(f, M.mul(M.add(t, M.mul(spinv, hand * (o.spin || 0))), wgt)); wsum += wgt; }
        if (wsum < 0.02) break;
        d = M.norm(M.add(M.mul(d, 0.7), M.mul(M.norm(f), 0.3))); p = M.add(p, M.mul(d, 0.08));
        // held close to the nearest ring: drawn back towards it (hug), less the further the spin carries it
        const nb = near(p).reduce((x, y) => (y.d < x.d ? y : x)); if (nb.d < 0.45) p = M.add(p, M.mul(M.sub(nb.np, p), 0.25 * (o.hug == null ? 0.5 : o.hug)));
        if (p[1] < 0.03) break; P.push(p);
      }
      // the end runs on straight
      if (P.length > 3 && (o.reach || 0) > 0) { const e = M.add(P[P.length - 1], M.mul(d, (o.reach || 0) * rnd())); if (e[1] > 0.03) P.push(e); }
      if (P.length < 6) continue;
      for (let it = 0; it < 12; it++) for (let i = 1; i < P.length - 1; i++) P[i] = M.lerp3(P[i], M.lerp3(P[i - 1], P[i + 1], 0.5), 0.5);
      const Lp = Mo.polyLen(P, false); const nn = Mo.segCount(Lp, mat) + 1; const pts = Mo.resample(P, nn, false);
      const cand = [];
      for (let i = 0; i < nn - 1; i++) { const ci = M.lerp3(pts[i], pts[i + 1], 0.5).map((v) => Math.floor(v / cs));
        for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) for (const sg of grid.get(key(ci[0] + x, ci[1] + y, ci[2] + z)) || []) { const g = segSeg(pts[i], pts[i + 1], sg.a, sg.c); if (g.d < 0.11) cand.push({ i, s: g.s, rod: sg.r.id, j: sg.j, t: g.t, d: g.d, at: (i + g.s) * Lp / (nn - 1) }); } }
      cand.sort((x, y) => x.d - y.d); const ties = []; for (const c of cand) { if (ties.some((t) => Math.abs(t.at - c.at) < 0.35)) continue; ties.push(c); if (ties.length >= 6) break; }
      if (o.why) o.why.n = (o.why.n || 0) + 1;
      // the stick is laid onto the rods it is lashed to (the gap closed smoothly along it), so the lashings start slack
      if (ties.length >= 3) { const sh = pts.map(() => [0, 0, 0]); const wsum = pts.map(() => 0); const step = Lp / (nn - 1);
        for (const t of ties) { const sg = grid.get(key(...M.lerp3(pts[t.i], pts[t.i + 1], 0.5).map((v) => Math.floor(v / cs)))); void sg; const R0 = m.rods.get(t.rod); const n0 = R0.pts.length; const tgt = M.lerp3(R0.pts[t.j], R0.pts[(t.j + 1) % n0], t.t); const cur = M.lerp3(pts[t.i], pts[t.i + 1], t.s); const dlt = M.sub(tgt, cur);
          pts.forEach((q, i) => { const w = Math.exp(-(((i - t.i - t.s) * step / 0.45) ** 2)); sh[i] = M.add(sh[i], M.mul(dlt, w)); wsum[i] += w; }); }
        for (let i = 0; i < nn; i++) if (wsum[i] > 0) pts[i] = M.add(pts[i], M.mul(sh[i], 1 / Math.max(1, wsum[i]))); }
      const strain = maxCurv(pts) * cl; const A0 = pts[0], B0 = pts[nn - 1]; const ab = M.sub(B0, A0); const sag = Math.max(...pts.map((v) => { const t = M.clamp(M.dot(M.sub(v, A0), ab) / Math.max(1e-9, M.dot(ab, ab)), 0, 1); return M.dist(v, M.add(A0, M.mul(ab, t))); }));
      const soak = strain > 0.5 * el && sag > 0.04; if (!soak && strain > 0.5 * el) { if (o.why) o.why.kink = (o.why.kink || 0) + 1; continue; } if (ties.length < (soak ? 4 : 3) || (soak && Lp < 1.3)) { if (o.why) o.why.ties = (o.why.ties || 0) + 1; continue; }
      if (strain > (mat.soak_strain || 0.017)) { if (o.why) o.why.tight = (o.why.tight || 0) + 1; continue; } // tighter than a soaked thin stick goes
      const rod = Mo.makeRod(m, 'clad', pts, Lp, stage, false, Object.assign({ profile: 'clad', cls: soak ? 'soak' : 'cold' }, soak ? { rest: pts } : {})); rod.bk = 'net'; rod.part = 'clad'; out.push(rod);
      for (const t of ties) Mo.addJoint(m, rod.id, t.i, t.rod, t.j, stage, Object.assign({}, t.s > 0.001 ? { ta: Math.round(t.s * 1000) / 1000 } : {}, t.t > 0.001 ? { tb: Math.round(t.t * 1000) / 1000 } : {}));
    }
    if (out.length) Mo.autoJoin(m, out.map((r) => r.id), { radius: 0.06, perRod: 3, spacing: 0.6, perPair: 1 }, stage);
    return out;
  }
  // let the structure settle under its weight before cladding goes on, so the cladding is laid on it as it stands
  // (it is fitted to the sagged rings, not the drawn ones); a time budget keeps edits quick
  function settle(m, ms) {
    if (typeof SF.Phys === 'undefined' || !m.rods.size) return; const sim = SF.Phys.build(m); SF.Phys.relax(sim, { budgetMs: ms });
    for (const r of m.rods.values()) { const e = sim.index.get(r.id); if (!e) continue; r.pts = r.pts.map((_, i) => { const o = 3 * (e.off + i); return [sim.X[o], sim.X[o + 1], sim.X[o + 2]].map((v) => Math.round(v * 1000) / 1000); }); }
  }
  function perp(n) { return M.norm(M.cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])); }
  // free-ring layouts: a looping tunnel of rings that twist as they go, and a canopy of crossing loops
  function loopTunnel() { let k = 0; const id = () => 'F' + (++k); return sweep([-3, 0.7, 0], [3, 0.7, 0], { count: 14, lift: 0.5, coil: 0.2, turns: 1, tip: 80, twist: 240, size: 'swell', C: 4.4 }, id); }
  function canopy() { let k = 0; const id = () => 'F' + (++k); return sweep([-2.6, 0.6, -1.4], [2.4, 0.6, 1.2], { count: 8, lift: 1.4, coil: 0, tip: 80, twist: 160, size: 'swell', C: 4.6 }, id).concat(sweep([-2.2, 0.6, 1.8], [2.2, 0.6, -1.6], { count: 7, lift: 1.2, coil: 0.3, tip: 65, twist: -180, size: 'pulse', C: 4.2 }, id)); }
  const FREE_LAYOUTS = [['tunnel', 'Looping tunnel: rings swept along an arch, twisting', loopTunnel], ['canopy', 'Canopy: two sweeps of rings crossing', canopy]];
  // ---------------------------------------------------------------- one skin of cladding over the whole structure
  function skinOpts() { return { on: true, dir: 'flow', density: 10, len: 2.4, angle: 55, reach: 0.4, blend: 0.2, seed: 5 }; }
  // each basket as it stands: its settled rings in order (and its point), the surface ruled between them
  function shapes(m, baskets) {
    const out = [];
    for (const b of baskets) {
      const rr = Array.from(m.rods.values()).filter((r) => r.bk === b.id && r.kind === 'ring').sort((p, q) => (p.rk || 0) - (q.rk || 0)); if (!rr.length) continue;
      const ax = rr.map((r) => { const n = r.pts.length; const c = r.pts.reduce((a, p) => M.add(a, p), [0, 0, 0]).map((v) => v / n); const q = r.pts.map((p) => M.sub(p, c)); return { c, q, r: q.reduce((a, v) => a + M.len(v), 0) / n }; });
      let point = false;
      if (b.top === 'point') { const R = rings(b); const Rt = R[R.length - 1]; const h = b.apex != null ? b.apex : 0.6 + 0.9 * Rt.C / TAU; const top = ax[ax.length - 1]; ax.push({ c: M.add(top.c, M.mul(Rt.n, h)), q: null, r: 0 }); point = true; }
      if (ax.length === 1) ax.push({ c: M.add(ax[0].c, [0, 0.4, 0]), q: ax[0].q, r: ax[0].r });
      out.push({ id: b.id, ax, point });
    }
    return out;
  }
  // where a ring meets the half-plane from its centre in direction e (about the axis): between the two nodes either side
  function ringReach(R, e, axis) {
    if (!R.q) return [0, 0, 0]; const q = R.q, n = q.length; let best = null, bc = -2;
    const ang = (v) => Math.atan2(M.dot(M.cross(e, v), axis), M.dot(e, v));
    for (let i = 0; i < n; i++) { const c = M.dot(q[i], e) / Math.max(1e-9, M.len(q[i])); if (c > bc) { bc = c; best = i; } }
    const a0 = ang(q[best]); const j = a0 > 0 ? (best - 1 + n) % n : (best + 1) % n; const a1 = ang(q[j]);
    const t = Math.abs(a1 - a0) > 1e-9 ? M.clamp(a0 / (a0 - a1), 0, 1) : 0; return M.lerp3(q[best], q[j], t);
  }
  // signed distance (roughly) to one basket's ruled surface, negative inside, and whether the nearest place is past its
  // open top or below its base
  function sdBasket(sh, p) {
    let best = Infinity, past = false; const ax = sh.ax;
    for (let k = 0; k < ax.length - 1; k++) {
      const A = ax[k].c, B = ax[k + 1].c; const ab = M.sub(B, A); const L2 = Math.max(1e-9, M.dot(ab, ab)); const raw = M.dot(M.sub(p, A), ab) / L2; const t = M.clamp(raw, 0, 1);
      const axis = M.norm(ab); const o = M.add(A, M.mul(ab, t)); let e = M.sub(p, o); e = M.sub(e, M.mul(axis, M.dot(e, axis))); const le = M.len(e);
      if (le < 1e-6) { const d = -(ax[k].r + (ax[k + 1].r - ax[k].r) * t); if (Math.abs(d) < Math.abs(best)) { best = d; past = false; } continue; }
      e = M.mul(e, 1 / le); const S = M.lerp3(M.add(A, ringReach(ax[k], e, axis)), M.add(B, ringReach(ax[k + 1], e, axis)), t);
      const d = (M.dot(M.sub(p, S), e) >= 0 ? 1 : -1) * M.dist(p, S);
      if (Math.abs(d) < Math.abs(best)) { best = d; past = (k === ax.length - 2 && raw > 1.02 && !sh.point) || (k === 0 && raw < -0.02); }
    }
    return { d: best, past };
  }
  // the whole structure's surface: a smooth union of the baskets, so the skin runs across where pods meet
  function sdAll(shs, p, k) {
    let acc = 0, past = false, dmin = Infinity;
    for (const sh of shs) { const q = sdBasket(sh, p); acc += Math.exp(-q.d / k); if (q.d < dmin) { dmin = q.d; past = q.past; } }
    return { d: -k * Math.log(Math.max(1e-300, acc)), past };
  }
  // a cladding stick from points: smoothed, lashed where it passes the structure (three lashings, four if pre-bent),
  // laid onto those lashings, classed cold or soaked, or left off if it would crack or bend too tight
  function finishStick(m, P, grid, stage, bk) {
    const mat = m.material; const cs = 0.35; const key = (x, y, z) => x + ',' + y + ',' + z;
    for (let it = 0; it < 10; it++) for (let i = 1; i < P.length - 1; i++) P[i] = M.lerp3(P[i], M.lerp3(P[i - 1], P[i + 1], 0.5), 0.5);
    const Lp = Mo.polyLen(P, false); if (Lp < 0.8) return null; const nn = Mo.segCount(Lp, mat) + 1; const pts = Mo.resample(P, nn, false);
    const cand = [];
    for (let i = 0; i < nn - 1; i++) { const ci = M.lerp3(pts[i], pts[i + 1], 0.5).map((v) => Math.floor(v / cs));
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) for (const sg of grid.get(key(ci[0] + x, ci[1] + y, ci[2] + z)) || []) { const g = segSeg(pts[i], pts[i + 1], sg.a, sg.c); if (g.d < 0.11) cand.push({ i, s: g.s, rod: sg.r.id, j: sg.j, t: g.t, d: g.d, at: (i + g.s) * Lp / (nn - 1) }); } }
    cand.sort((x, y) => x.d - y.d); const ties = []; for (const c of cand) { if (ties.some((t) => Math.abs(t.at - c.at) < 0.35)) continue; ties.push(c); if (ties.length >= 6) break; }
    if (ties.length < 3) return null;
    { const sh = pts.map(() => [0, 0, 0]); const ws = pts.map(() => 0); const step = Lp / (nn - 1);
      for (const t of ties) { const R0 = m.rods.get(t.rod); const n0 = R0.pts.length; const dl = M.sub(M.lerp3(R0.pts[t.j], R0.pts[(t.j + 1) % n0], t.t), M.lerp3(pts[t.i], pts[t.i + 1], t.s));
        pts.forEach((q, i) => { const w = Math.exp(-(((i - t.i - t.s) * step / 0.45) ** 2)); sh[i] = M.add(sh[i], M.mul(dl, w)); ws[i] += w; }); }
      for (let i = 0; i < nn; i++) if (ws[i] > 0) pts[i] = M.add(pts[i], M.mul(sh[i], 1 / Math.max(1, ws[i]))); }
    const el = mat.elastic_strain || 0.004; const strain = maxCurv(pts) * SF.Phys.sectionOf(mat, { profile: 'clad' }).c1 * 1.15;
    const A0 = pts[0], B0 = pts[nn - 1]; const ab = M.sub(B0, A0); const sag = Math.max(...pts.map((v) => { const t = M.clamp(M.dot(M.sub(v, A0), ab) / Math.max(1e-9, M.dot(ab, ab)), 0, 1); return M.dist(v, M.add(A0, M.mul(ab, t))); }));
    const soak = strain > 0.5 * el && sag > 0.04; if (!soak && strain > 0.5 * el) return null; if (soak && (ties.length < 4 || Lp < 1.3)) return null; if (strain > (mat.soak_strain || 0.017)) return null;
    const rod = Mo.makeRod(m, 'clad', pts, Lp, stage, false, Object.assign({ profile: 'clad', cls: soak ? 'soak' : 'cold' }, soak ? { rest: pts } : {})); rod.bk = bk; rod.part = 'clad';
    for (const t of ties) Mo.addJoint(m, rod.id, t.i, t.rod, t.j, stage, Object.assign({}, t.s > 0.001 ? { ta: Math.round(t.s * 1000) / 1000 } : {}, t.t > 0.001 ? { tb: Math.round(t.t * 1000) / 1000 } : {}));
    return rod;
  }
  // the skin: thin sticks marched over the whole structure's surface (the smooth union of its baskets) in one direction
  // field, so they run on from pod to pod, never into the space inside where pods overlap; laid on in height bands
  function skin(m, baskets, so, stage) {
    const shs = shapes(m, baskets); if (!shs.length) return []; const k = Math.max(0.03, so.blend || 0.2); const rnd = M.rng((so.seed || 5) * 7919 + 11);
    const F = (p) => sdAll(shs, p, k); const grad = (p) => { const e = 0.01; return M.norm([F(M.add(p, [e, 0, 0])).d - F(M.add(p, [-e, 0, 0])).d, F(M.add(p, [0, e, 0])).d - F(M.add(p, [0, -e, 0])).d, F(M.add(p, [0, 0, e])).d - F(M.add(p, [0, 0, -e])).d]); };
    const onto = (p) => { for (let i = 0; i < 3; i++) { const f = F(p).d; if (Math.abs(f) < 0.003) break; p = M.sub(p, M.mul(grad(p), f)); } return p; };
    const cs = 0.35; const grid = new Map(); const key = (x, y, z) => x + ',' + y + ',' + z;
    for (const r of m.rods.values()) { if (r.kind === 'clad' || !r.bk) continue; const n = r.pts.length; const segs = r.closed ? n : n - 1; for (let j = 0; j < segs; j++) { const a = r.pts[j], c = r.pts[(j + 1) % n]; const g = key(...M.lerp3(a, c, 0.5).map((v) => Math.floor(v / cs))); let l = grid.get(g); if (!l) grid.set(g, l = []); l.push({ r, j, a, c }); } }
    let ymax = 0; for (const sh of shs) for (const a of sh.ax) ymax = Math.max(ymax, a.c[1]);
    const area = shs.reduce((a, sh) => { let s2 = 0; for (let i = 0; i < sh.ax.length - 1; i++) s2 += Math.PI * (sh.ax[i].r + sh.ax[i + 1].r) * M.dist(sh.ax[i].c, sh.ax[i + 1].c); return a + s2; }, 0);
    const count = Math.max(10, Math.round((so.density || 10) * area)); const maxA = (so.angle || 55) * DEG; const dir = so.dir || 'flow';
    const field = (p, n, a0, hand) => { let up = M.sub([0, 1, 0], M.mul(n, n[1])); if (M.len(up) < 0.15) up = M.sub([1, 0, 0], M.mul(n, n[0])); up = M.norm(up); const ar = M.norm(M.cross(n, up));
      let a; switch (dir) { case 'rings': a = Math.PI / 2; break; case 'rise': a = 0; break; case 'twist': a = hand * 40 * DEG; break; case 'flow': a = hand * (12 + 75 * M.clamp(p[1] / Math.max(0.5, ymax), 0, 1) ** 1.3) * DEG; break; default: a = 0; }
      a += a0; return M.add(M.mul(up, Math.cos(a)), M.mul(ar, Math.sin(a))); };
    const bands = [];
    for (let q = 0; q < count; q++) {
      const sh = shs[Math.floor(rnd() * shs.length)]; const kk = rnd() * (sh.ax.length - 1); const k0 = Math.min(sh.ax.length - 2, Math.floor(kk)); const f = kk - k0;
      const A = sh.ax[k0], Bq = sh.ax[k0 + 1]; const axis = M.norm(M.sub(Bq.c, A.c)); const { u, w } = basis(axis); const th = TAU * rnd(); const e = M.add(M.mul(u, Math.cos(th)), M.mul(w, Math.sin(th)));
      const p0 = M.lerp3(M.add(A.c, ringReach(A, e, axis)), M.add(Bq.c, ringReach(Bq, e, axis)), f);
      if (shs.some((o2) => o2 !== sh && sdBasket(o2, p0).d < -0.04)) continue; // inside another pod: no cladding there
      let p = onto(p0); if (M.dist(p, p0) > 0.4 || p[1] < 0.05) continue; // inside another pod: no cladding there
      const hand = (sh.id.charCodeAt(1) + q) % 2 ? 1 : -1; const a0 = dir === 'random' ? (rnd() - 0.5) * 2 * maxA : (rnd() - 0.5) * 0.35 * maxA; const L = (so.len || 2.4) * (0.6 + 0.8 * rnd());
      const half = (sg) => { const P = []; let pp = p, d = null, s = 0;
        while (s < L / 2) { const n = grad(pp); let v = field(pp, n, a0, hand); v = M.mul(v, sg); if (d && M.dot(v, d) < 0) v = M.mul(v, -1); d = d ? M.norm(M.add(M.mul(d, 0.7), M.mul(v, 0.3))) : v;
          let nx = onto(M.add(pp, M.mul(d, 0.08))); const st = F(nx); if (st.past || nx[1] < 0.03) { if (P.length > 2 && (so.reach || 0) > 0 && nx[1] > 0.03) P.push(M.add(pp, M.mul(d, (so.reach || 0) * rnd()))); break; }
          P.push(nx); pp = nx; s += 0.08; }
        return P; };
      const P = half(-1).reverse().concat([p], half(1)); if (P.length < 8) continue;
      bands.push({ P, y: P.reduce((a, v) => a + v[1], 0) / P.length });
    }
    // laid on in bands of 0.7 m, bottom up
    bands.sort((a, b2) => a.y - b2.y); const out = []; let band = -1;
    for (const c of bands) { const bi = Math.floor(c.y / 0.7); if (bi !== band) { if (band >= 0) stage = Mo.nextStage(m); band = bi; } const r = finishStick(m, c.P, grid, stage, 'skin'); if (r) out.push(r); }
    if (out.length) Mo.autoJoin(m, out.map((r) => r.id), { radius: 0.06, perRod: 3, spacing: 0.6, perPair: 1 }, stage);
    return out;
  }
  // the whole pile: every basket in order, each built and struck, then bolted together; then the cladding goes on
  function buildAll(m, baskets, o, s, free) {
    free = (free || m.meta.free || []).map((f) => Object.assign({}, f)); const net = Object.assign(netOpts(), m.meta.net || {}, o && o.net);
    // the skin's settings: kept in the model; designs from before it take theirs from their clad baskets
    const legacy = !m.meta.skin && (baskets || []).find((b) => b.clad); const skinRead = Object.assign(skinOpts(), legacy ? { dir: legacy.cladDir || 'flow' } : !m.meta.skin && !(o && o.skin) ? { on: false } : {}, m.meta.skin || {}, o && o.skin);
    clear(m); const bs = (baskets || []).map((b) => Object.assign({}, b)); m.meta.baskets = JSON.parse(JSON.stringify(bs)); m.meta.free = JSON.parse(JSON.stringify(free)); m.meta.net = net; o = Object.assign(opts(), o || {}); let stage = s; const out = [];
    bs.forEach((b, i) => { if (i > 0) stage = Mo.nextStage(m); out.push(...build(m, Object.assign(b, { strike: o.strike, ties: o.ties }), stage)); stage = m.meta.stage; });
    if (o.strike === 'end') { stage = Mo.nextStage(m); Mo.release(m, stage, new Set(out.map((r) => r.id))); }
    // free rings, one at a time on their formwork, each bolted to whatever it crosses; then the formwork comes out
    if (free.length) {
      const fr = []; for (const f of free) { if (out.length || fr.length) stage = Mo.nextStage(m); fr.push(buildFree(m, f, stage)); }
      stage = Mo.nextStage(m); Mo.release(m, stage, new Set(fr.map((r) => r.id))); out.push(...fr);
      if (net.clad) {
        settle(m, 700); stage = Mo.nextStage(m); const cn = cladNet(m, net, stage); stage = m.meta.stage;
        // sticks the settled structure would overload are left off (they would crack as the rings take their weight)
        const sim = SF.Phys.build(m); SF.Phys.relax(sim, { budgetMs: 900 }); const st = SF.Phys.stress(sim); const gone = [];
        sim.rods.forEach((r, k) => { if (r.kind === 'clad' && r.bk === 'net' && st.rodMax[k] > 0.95) gone.push(r.id); }); if (gone.length) Mo.remove(m, gone);
        const g = new Set(gone); out.push(...cn.filter((r) => !g.has(r.id)));
      }
    }
    // one skin of cladding over the whole structure, laid on it as it stands; sticks it would overload are left off
    const sk = m.meta.skin = skinRead;
    if (sk.on && bs.length) {
      settle(m, 600); stage = Mo.nextStage(m); const cl = skin(m, bs, sk, stage); stage = m.meta.stage; const g = new Set();
      // up to three passes: sticks over 95%, sticks whose lashings are overloaded, and the sticks lashed to any rod the
      // skin pushes past its strength come off
      for (let pass = 0; pass < 3; pass++) {
        const sim = SF.Phys.build(m); SF.Phys.relax(sim, { budgetMs: 900 }); const st = SF.Phys.stress(sim); const gone = new Set(); const over = new Set();
        sim.rods.forEach((r, k) => { if (r.kind === 'clad' && r.bk === 'skin') { if (st.rodMax[k] > 0.95) gone.add(r.id); } else if (st.rodMax[k] > 0.98) over.add(r.id); });
        sim.jointIds.forEach((id, q) => { if (sim.jointF[q] <= sim.jointCap[q]) return; const j = m.joints.find((x) => x.id === id); if (!j) return; for (const e of [j.a, j.b]) { const rr = m.rods.get(e); if (rr && rr.bk === 'skin') gone.add(e); } });
        if (over.size) for (const j of m.joints) { const ra = m.rods.get(j.a), rb = m.rods.get(j.b); if (!ra || !rb) continue; if (ra.bk === 'skin' && over.has(j.b)) gone.add(j.a); if (rb.bk === 'skin' && over.has(j.a)) gone.add(j.b); }
        if (!gone.size) break; Mo.remove(m, Array.from(gone)); gone.forEach((id) => g.add(id));
      }
      out.push(...cl.filter((r) => !g.has(r.id)));
    }
    return out;
  }
  // take the baskets out of the model (other rods stay)
  function clear(m) {
    const gone = Array.from(m.rods.values()).filter((r) => r.bk).map((r) => r.id); m.meta.baskets = []; const g = new Set(gone); Mo.remove(m, gone);
    if (m.meta.events) m.meta.events = m.meta.events.map((e) => Object.assign({}, e, { held: e.held.filter((id) => !g.has(id)), struck: e.struck.filter((r) => !r.bk), joints: e.joints.filter((j) => !g.has(j.a) && !g.has(j.b)) })).filter((e) => e.held.length || e.struck.length);
  }
  // a new basket at a point in plan, with the current defaults
  function make(design, x, z, C) {
    const o = Object.assign(opts(), design.basketOpts || {}); const ids = (design.baskets || []).map((b) => parseInt(String(b.id).slice(1), 10) || 0);
    return { id: 'B' + (Math.max(0, ...ids) + 1), x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000, C: clampC(C || 4.4), rings: o.rings, gap: o.gap, shape: o.shape, lean: o.lean, az: o.az,
      brace: o.brace, spacing: o.spacing, tops: o.tops, door: o.door, doorAz: o.doorAz, ground: o.ground, strike: o.strike, seed: o.seed, clad: !!o.clad, top: o.top || 'open', apex: o.apex != null ? o.apex : undefined,
      twist: o.twist, tilt: o.tilt, drift: o.drift, tiltMode: o.tiltMode, cladDir: o.cladDir };
  }
  // the notebook plan (Nov 2026): six baskets round a big one, stacked to different heights, clad all over
  function notebook(design) {
    design = design || {};
    const spots = [[0.55, -0.55, 5.0, 4, 'barrel', 0, 0, 'lattice'], [1.11, -1.65, 3.7, 6, 'straight', 8, 300, 'stakes'], [-0.79, -0.32, 4.15, 5, 'taper', 0, 0, 'lattice'],
      [-0.18, 0.56, 3.9, 3, 'flare', 0, 0, 'diagonal'], [-1.29, 0.72, 3.77, 2, 'straight', 0, 0, 'diagonal'], [0.52, 1.43, 3.7, 3, 'straight', 10, 70, 'lattice']];
    return spots.map(([x, z, C, n, shape, lean, az, brace], i) => Object.assign(make({ baskets: [], basketOpts: design.basketOpts }, x, z, C), { id: 'B' + (i + 1), rings: n, gap: 0.5, shape, lean, az, brace, tops: 0.4, door: false, seed: 5 + i, clad: true }));
  }
  // one basket from a short list: x, z, base ring, rings, gap, shape, lean, lean to, twist, ring tilt, drift, tilt pattern, bracing, cladding direction
  function spec(design, i, a) {
    const [x, z, C, n, gap, shape, lean, az, twist, tilt, drift, tiltMode, brace, dir, tops] = a;
    return Object.assign(make({ baskets: [], basketOpts: design.basketOpts }, x, z, C), { id: 'B' + (i + 1), rings: n, gap, shape, lean, az, twist, tilt, drift, tiltMode, brace, tops: tops == null ? 0.3 : tops, door: false, seed: 11 + 7 * i, clad: !!dir, cladDir: dir || 'random', cladDensity: 16 });
  }
  // a swirling tower: seven rings tipping round in turn, clad along the rings, with two smaller swirls beside it
  function swirl(design) {
    design = design || {};
    return [[0, 0, 5.0, 7, 0.45, 'barrel', 4, 30, 40, 24, 0.35, 'same', 'lattice', 'rings', 0.4], [1.35, 0.55, 3.9, 4, 0.45, 'taper', 10, 20, -45, 22, 0.2, 'same', 'lattice', 'rings', 0.3],
      [-1.2, 0.75, 3.7, 3, 0.45, 'flare', 8, 160, 50, 26, 0.15, 'alt', 'diagonal', 'twist', 0.3]].map((a, i) => spec(design, i, a));
  }
  // a leaning flame: the stack leans and twists, the cladding runs up it and flares out past the top
  function flame(design) {
    design = design || {};
    return [[0, 0, 4.6, 6, 0.5, 'taper', 14, 200, 18, 16, 0.25, 'same', 'lattice', 'rise', 0.6], [0.95, -0.85, 3.8, 4, 0.5, 'taper', 12, 300, -20, 14, 0.15, 'same', 'stakes', 'rise', 0.5]].map((a, i) => spec(design, i, a));
  }
  // the overlapping plan: rings overlapping round a centre, each stack fanning out, bolted where they cross
  function bloom(design) {
    design = design || {}; const out = [];
    for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + 0.3; const r = 0.95 + 0.12 * (i % 2); out.push(spec(design, i, [r * Math.cos(a), r * Math.sin(a), [4.8, 4.2, 4.5, 3.9, 4.4][i], 3 + (i % 3), 0.5, ['barrel', 'flare', 'wave', 'taper', 'barrel'][i], 6, a * 180 / Math.PI, (i % 2 ? -1 : 1) * 30, 28, 0.2, 'open', i % 2 ? 'diagonal' : 'lattice', 'twist', 0.4])); }
    return out;
  }
  // two baskets leaning into each other and crossing, as in the base-basket sketch
  function crossed(design) {
    design = design || {};
    return [[-0.6, 0, 4.4, 5, 0.5, 'flare', 16, 0, 12, 14, 0.2, 'same', 'lattice', 'flow', 0.4], [0.6, 0.15, 4.2, 5, 0.5, 'flare', 16, 180, -12, 14, 0.2, 'same', 'lattice', 'flow', 0.4],
      [0, 1.25, 3.7, 2, 0.5, 'straight', 0, 0, 0, 18, 0, 'alt', 'diagonal', 'random', 0.2]].map((a, i) => spec(design, i, a));
  }
  // baskets along a golden spiral, shrinking and turning as they go round
  function golden(design) {
    design = design || {}; const out = []; const g = 1.618;
    for (let i = 0; i < 6; i++) { const a = i * 0.9; const r = 0.45 * Math.pow(g, a / (Math.PI / 2)) * 0.55 + 0.2 * i; const C = 5.0 - i * 0.2;
      out.push(spec(design, i, [r * Math.cos(a), r * Math.sin(a), C, Math.max(2, 6 - Math.floor(i / 1.5)), 0.5, i % 2 ? 'taper' : 'barrel', 5 + i, a * 180 / Math.PI + 90, 25 + 5 * i, 16 + 2 * i, 0.15, 'same', i % 3 === 1 ? 'diagonal' : 'lattice', i % 2 ? 'flow' : 'rings', 0.3])); }
    return out;
  }
  // two pointed baskets side by side under one skin (the sketch: two basket forms, one cohesive structure)
  function pair(design) {
    design = design || {};
    return [[-0.95, 0, 6.0, 5, 0.5, 'taper', 4, 0, 10, 6, 0.05, 'same', 'stakes', 'flow', 0], [0.7, 0.2, 5.0, 4, 0.5, 'taper', 6, 180, -10, 6, 0.05, 'same', 'stakes', 'flow', 0]]
      .map((a, i) => Object.assign(spec(design, i, a), { top: 'point', apex: 1.3 - 0.2 * i, spacing: 0.4 }));
  }
  const LAYOUTS = [['pair', 'Two pointed pods, one skin (your sketch)', pair], ['swirl', 'Swirling tower: rings tipping round, clad along them', swirl], ['bloom', 'Overlapping bloom: five stacks fanning out', bloom], ['flame', 'Leaning flame: cladding rising', flame],
    ['crossed', 'Crossing baskets: two stacks leaning into each other', crossed], ['golden', 'Golden spiral: six baskets turning', golden], ['notebook', 'Notebook plan: six baskets, clad', notebook], ['pile', 'Pile of seven baskets', pile]];
  // the pile from the plan sketch: rings of different sizes scattered and touching, some leaning
  function pile(design) {
    design = design || {};
    const spots = [[0, 0, 5.0, 5, 'barrel', 0, 0, true], [1.55, 0.35, 4.6, 4, 'taper', 10, 20, false], [-1.3, 0.95, 4.2, 6, 'wave', 8, 150, false], [0.45, -1.5, 3.9, 3, 'flare', 12, 280, false],
      [-1.05, -1.2, 4.4, 5, 'barrel', 9, 220, false], [2.2, -1.1, 3.7, 2, 'straight', 0, 0, false], [0.35, 1.6, 3.8, 4, 'taper', 10, 90, false]];
    return spots.map(([x, z, C, n, shape, lean, az, door], i) => Object.assign(make({ baskets: [], basketOpts: design.basketOpts }, x, z, C), { id: 'B' + (i + 1), rings: n, shape, lean, az, door, doorAz: 300, seed: 3 + i, brace: i % 3 === 1 ? 'diagonal' : i % 3 === 2 ? 'stakes' : 'lattice' }));
  }

  // ---------------------------------------------------------------- stock and checks
  // what the design uses against what is in the yard: rings take a pole each, sticks are packed into 5 m lengths
  function materials(model, design) {
    const st = Object.assign(stock(), design && design.stock); const rings = [], sticks = [], thin = []; let bolts = 0, splices = 0, lashes = 0;
    for (const r of model.rods.values()) { if (r.kind === 'ring') rings.push(r.L); else if (r.kind === 'stake' || r.kind === 'brace' || r.kind === 'stick') sticks.push(r.L); else if (r.kind === 'clad') thin.push(r.L); }
    for (const e of model.meta.events || []) for (const r of e.struck) if (r.kind === 'ring') rings.push(r.L);
    let poleCount = 0; for (const L of rings) { const k = ringPoles(L); poleCount += k; splices += k > 1 ? k : 0; bolts += 2 * Math.max(1, k); }
    for (const j of model.joints) { if (j.type === 'bolt') bolts++; else lashes++; }
    // sticks longer than stock are spliced from two; the rest packed first-fit into 5 m lengths
    const pack = (list) => { const pieces = []; for (const L of list) { let l = L; while (l > LIMITS.stick) { pieces.push(LIMITS.stick); l -= LIMITS.stick - 0.3; } pieces.push(l); }
      pieces.sort((a, b) => b - a); const bins = []; for (const p of pieces) { const k = bins.findIndex((v) => v + p + 0.01 <= LIMITS.stick); if (k >= 0) bins[k] += p + 0.01; else bins.push(p); } return { pieces, bins }; };
    const { pieces, bins } = pack(sticks); const tp = pack(thin); const thinLen = thin.reduce((a, b) => a + b, 0);
    const poles = rings.length; const stickLen = sticks.reduce((a, b) => a + b, 0);
    const rows = [
      { what: 'Rings (5 m poles, 18-20 mm)', need: poleCount, have: st.poles, unit: 'poles', note: splices ? splices + ' splices: rings bigger than one 5 m pole are made of several, each lap bolted twice' : 'one pole per ring, lapped and bolted' },
      { what: 'Sticks (20 × 20 mm, 5 m)', need: bins.length, have: st.sticks, unit: 'sticks', note: stickLen.toFixed(0) + ' m of sticks in ' + pieces.length + ' pieces' },
      { what: 'Thin sticks (10 × 20 mm, 5 m)', need: tp.bins.length, have: st.thin, unit: 'sticks', note: thin.length ? thinLen.toFixed(0) + ' m of cladding in ' + tp.pieces.length + ' pieces, lashed at ' + lashes + ' places' : 'for cladding' },
      { what: 'Bolts (with big washers)', need: bolts, have: st.bolts, unit: 'bolts', note: 'two at each ring lap, one at each crossing' },
      { what: 'Clamps', need: Math.min(rings.length, 8), have: st.clamps, unit: 'clamps', note: 'to hold rings round their formwork while bolting (eight in use at once)' }
    ];
    return { rows, rings: rings.length, sticks: pieces.length, stickLen, thin: tp.pieces.length, thinLen, lashes, bolts, splices };
  }
  // what breaks the tested limits: rings outside the sizes that can be bent, sticks bent tighter than a soaked stick goes
  function issues(model) {
    const out = [];
    for (const r of model.rods.values()) {
      if (r.kind === 'ring') {
        // what it takes to make and put up a ring of this size by hand
        const D = r.L / Math.PI, k = ringPoles(r.L), top = Math.max(...r.pts.map((p) => p[1]));
        if (r.L < LIMITS.cMin - 0.01) out.push({ id: r.id, level: 'crit', text: 'ring ' + D.toFixed(2) + ' m across: tighter than the 1.2 m a soaked pole bends to' });
        else {
          if (r.L > LIMITS.cTested + 0.01) out.push({ id: r.id, level: 'warn', text: 'ring ' + r.L.toFixed(1) + ' m round: bigger than the 4.5 m bent so far. Bend a test ring first' });
          if (D > 3.5) out.push({ id: r.id, level: 'warn', text: 'ring ' + D.toFixed(1) + ' m across, ' + k + ' poles spliced: it sags under its own weight while it is bolted. Bend it on a formwork that size with six people, and prop it until it is braced' });
          else if (D > 2.5) out.push({ id: r.id, level: 'warn', text: 'ring ' + D.toFixed(1) + ' m across, ' + k + ' poles spliced: bend it round a formwork that size with four people' });
          else if (k > 1) out.push({ id: r.id, level: 'info', text: 'ring ' + r.L.toFixed(1) + ' m round: ' + k + ' poles spliced with bolted laps' });
        }
        if (top > 3.6) out.push({ id: r.id, level: 'warn', text: 'ring up to ' + top.toFixed(1) + ' m high: bolt it from a scaffold tower, not a ladder' });
      }
      if ((r.kind === 'stake' || r.kind === 'brace') && r.pts.length > 2) {
        const kmax = maxCurv(r.pts);
        if (kmax > 1 / LIMITS.soakR) out.push({ id: r.id, level: 'crit', text: 'stick bent to ' + (1 / kmax).toFixed(2) + ' m radius: tighter than the 0.59 m a soaked 20 mm stick takes' });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- rings in a sketch
  // Hough circles in a grey image (0 dark .. 1 light, w × h): ink is whatever differs from the paper.
  // returns circles {x, y, r} in pixels, strongest first, none overlapping much
  function findCircles(gray, w, h, o) {
    o = o || {}; let sum = 0; for (let i = 0; i < gray.length; i++) sum += gray[i]; const mean = sum / gray.length; const dark = mean > 0.5;
    // ink is a stroke that stands out from the paper around it (so ruled lines, shading and big dark patches don't count)
    const I = new Float64Array((w + 1) * (h + 1)); for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += gray[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
    const R = Math.max(3, Math.round(Math.min(w, h) / 40)); const local = (x, y) => { const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1); return (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
    const thr = o.contrast || 0.16;
    const pts = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = gray[y * w + x], l = local(x, y); if (dark ? v < l - thr : v > l + thr) pts.push(x, y); }
    const rMin = Math.max(4, Math.round(o.rMin || Math.min(w, h) * 0.04)), rMax = Math.round(o.rMax || Math.min(w, h) * 0.4); const step = Math.max(1, Math.round((rMax - rMin) / 40));
    const radii = []; for (let r = rMin; r <= rMax; r += step) radii.push(r);
    const A = 64; const cs = Array.from({ length: A }, (_, k) => Math.cos(TAU * k / A)), sn = Array.from({ length: A }, (_, k) => Math.sin(TAU * k / A));
    const acc = radii.map(() => new Float32Array(w * h)); const stride = pts.length > 24000 ? Math.ceil(pts.length / 24000) * 2 : 2;
    for (let p = 0; p < pts.length; p += stride) { const x = pts[p], y = pts[p + 1]; for (let ri = 0; ri < radii.length; ri++) { const r = radii[ri], a = acc[ri]; for (let k = 0; k < A; k++) { const cx = Math.round(x - r * cs[k]), cy = Math.round(y - r * sn[k]); if (cx >= 0 && cy >= 0 && cx < w && cy < h) a[cy * w + cx] += 1; } } }
    // ink grown by a pixel, so a hand-drawn round that wobbles still counts
    const ink = new Uint8Array(w * h); for (let p = 0; p < pts.length; p += 2) { const x = pts[p], y = pts[p + 1]; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) ink[Y * w + X] = 1; } }
    // how much of a circle's round is inked: the test a candidate has to pass
    const cover = (cx, cy, r) => { const n = Math.max(48, Math.round(TAU * r)); let hit = 0, inside = 0; for (let k = 0; k < n; k++) { const a = TAU * k / n; const x = Math.round(cx + r * Math.cos(a)), y = Math.round(cy + r * Math.sin(a)); if (x < 0 || y < 0 || x >= w || y >= h) continue; inside++; if (ink[y * w + x]) hit++; } return cx - r >= -1 && cy - r >= -1 && cx + r <= w && cy + r <= h ? hit / n : 0; };
    const cand = []; const scale = stride / 2;
    for (let ri = 0; ri < radii.length; ri++) { const r = radii[ri], a = acc[ri]; const full = Math.min(A, TAU * r) / scale * 0.5;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const v = a[y * w + x]; if (v < full * 0.3) continue; let peak = true; for (let dy = -1; dy <= 1 && peak; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && a[(y + dy) * w + x + dx] > v) { peak = false; break; } if (peak) cand.push({ x, y, r, v }); } }
    cand.sort((p, q) => q.v - p.v); const top = cand.slice(0, 1500);
    for (const c of top) { c.c = cover(c.x, c.y, c.r); c.s = c.c * Math.sqrt(c.r); }
    // the best-covered circles first, bigger ones preferred; none sitting mostly on top of a chosen one
    const good = top.filter((c) => c.c >= (o.cover || 0.6)).sort((p, q) => q.s - p.s); const out = [];
    for (const c of good) { if (out.some((d) => Math.hypot(d.x - c.x, d.y - c.y) < Math.max(d.r, c.r) * 0.8)) continue; out.push({ x: c.x, y: c.y, r: c.r, s: c.c }); if (out.length >= (o.max || 24)) break; }
    return out;
  }
  // sketch circles to baskets, at the sketch's own scale: the biggest circle drawn becomes the biggest ring a 5 m pole
  // makes, the rest keep their size against it (anything smaller than the tightest ring is made that size).
  // cx, cy: the pixel at the origin (the circles' middle unless given)
  function fromCircles(design, circles, o) {
    o = o || {}; if (!circles.length) return { baskets: [], mpp: 0.01 }; const rMax = Math.max(...circles.map((c) => c.r));
    const mpp = o.mpp || LIMITS.pole / TAU / rMax; // metres per pixel
    const cx = o.cx != null ? o.cx : circles.reduce((a, c) => a + c.x, 0) / circles.length, cy = o.cy != null ? o.cy : circles.reduce((a, c) => a + c.y, 0) / circles.length;
    const bs = []; const temp = { baskets: [], basketOpts: design.basketOpts };
    circles.forEach((c, i) => { const b = make(temp, (c.x - cx) * mpp, (c.y - cy) * mpp, clampC(TAU * c.r * mpp)); b.id = 'B' + (i + 1); b.seed = 3 + i; temp.baskets.push(b); bs.push(b); });
    return { baskets: bs, mpp, cx, cy };
  }
  return { LIMITS, ringPoles, skinOpts, skin, shapes, sdBasket, pair, SHAPES, BRACES, TILTS, CLAD_DIRS, LAYOUTS, FREE_LAYOUTS, netOpts, freeRing, buildFree, sweep, ringOps, freeChecks, cladNet, connectRing, surf, notebook, clad, stock, opts, rings, ringPoint, build, buildAll, tie, clear, make, pile, materials, issues, findCircles, fromCircles, clampC };
})();
