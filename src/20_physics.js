/* Weavefield — rod physics, after Basketry's mass–spring rods.
   Every rod is a chain of nodes about 0.3 m apart. Stretch springs join neighbouring nodes; a bending spring on each
   node triple pulls its second difference towards the rest shape (straight for sticks bent cold, the placed shape for
   steam- or soak-bent ones, turned with the rod so a tilting hoop keeps its own curve). Lashings are zero-length springs
   between a node on each of two rods; a ground socket fixes an end, pinned or clamped along a direction; the ground
   pushes back with friction everywhere else. Dynamic relaxation with nodal masses sized from each node's stiffness
   (Gershgorin), as Basketry does, so it is stable at a unit step and can run live; kinetic damping (Barnes) settles it. */
SF.Phys = (function () {
  'use strict';
  const M = SF.M;
  const AX = 30;      // stretch springs are this many times stiffer than the bending springs (soft, so it converges fast)
  const MASS = 0.5;   // nodal mass = MASS x the node's stiffness row sum (Barnes: half the Gershgorin bound)
  const VMAX = 0.2;   // a node moving this far in one step means the masses are too light: stop and add mass
  const TOL = 1e-6;   // settled when every node's out-of-balance force / stiffness is below this (metres) ...
  const VTOL = 5e-6;  // ... and nothing moves more than this per step (forces also vanish when a swing passes through rest)

  // ------------------------------------------------------------ profiles and sections
  function species(mat) { return SF.Defaults.SPECIES.find((s) => s.id === mat.species) || SF.Defaults.SPECIES[0]; }
  function profiles(mat) {
    const sp = species(mat); const out = {}; const ov = mat.profiles || {};
    const ids = new Set(Object.keys(SF.Defaults.PROFILES).concat(Object.keys(ov)));
    for (const id of ids) {
      const d = SF.Defaults.PROFILES[id] || {}, o = ov[id] || {}; const timber = !!(d.timber || o.timber);
      const pick = (k, fromSp, dflt) => (o[k] != null ? o[k] : timber ? fromSp : d[k] != null ? d[k] : dflt);
      out[id] = { id, label: o.label || d.label || id, section_mm: o.section_mm || d.section_mm || 20, steam: o.steam != null ? !!o.steam : !!d.steam, staked: !!(o.staked || d.staked), timber,
        E_gpa: pick('E_gpa', sp.E_gpa, 10), density: pick('density', sp.density, 650), strength_mpa: pick('strength_mpa', sp.mor * (mat.strength_factor || 0.6), 60) };
    }
    return out;
  }
  // section properties of a rod (bundles of n rods lashed along their length act partly as one: I = n * I1 * n^action)
  function sectionOf(mat, rod, profs) {
    profs = profs || profiles(mat);
    const pr = profs[rod.profile] || profs.stick; const nb = Math.max(1, Math.min(12, Math.round(rod.bundle || 1)));
    const o = M.clamp(mat.bundle_action == null ? 0.5 : mat.bundle_action, 0, 1);
    const a = pr.section_mm / 1000, E = pr.E_gpa * 1e9; const A = nb * a * a, I = nb * (a ** 4 / 12) * nb ** o;
    return { profile: pr.id, bundle: nb, section_mm: pr.section_mm, density: pr.density, E, A, I, EI: E * I, c: a / 2 * nb ** (o / 2), c1: a / 2,
      width: a * Math.sqrt(nb), weight: pr.density * A * 9.81 * (mat.gravity == null ? 1 : mat.gravity), fb: pr.strength_mpa * 1e6,
      steam: !!(pr.steam || rod.rest), staked: !!pr.staked };
  }
  const segLen = (rod) => rod.L / (rod.closed ? rod.pts.length : rod.pts.length - 1);

  // ------------------------------------------------------------ build a simulation from the design
  // warm(rod) may return {X, V} (positions and velocities for that rod's nodes) to carry on from a previous simulation
  function build(model, warm) {
    const mat = model.material; const profs = profiles(mat);
    const rods = Array.from(model.rods.values()); const index = new Map(); let N = 0;
    rods.forEach((r, k) => { index.set(r.id, { off: N, n: r.pts.length, k }); N += r.pts.length; });
    const X = new Float64Array(3 * N), V = new Float64Array(3 * N), F = new Float64Array(3 * N);
    const S = new Float64Array(N), W = new Float64Array(N), G = new Float64Array(N), fixed = new Uint8Array(N), nodeRod = new Int32Array(N);
    const seg = [], bend = [], rest = [], pre = [], segRod = [];
    const rodP = rods.map((r) => sectionOf(mat, r, profs));
    rods.forEach((r, k) => {
      const { off, n } = index.get(r.id); const v = segLen(r); const sp = rodP[k];
      const kb = sp.EI / (v * v * v), ka = AX * kb; const w = warm ? warm(r) : null;
      for (let i = 0; i < n; i++) {
        const g = off + i, p = r.pts[i];
        if (w) { X[3 * g] = w.X[3 * i]; X[3 * g + 1] = w.X[3 * i + 1]; X[3 * g + 2] = w.X[3 * i + 2]; V[3 * g] = w.V[3 * i]; V[3 * g + 1] = w.V[3 * i + 1]; V[3 * g + 2] = w.V[3 * i + 2]; }
        else { X[3 * g] = p[0]; X[3 * g + 1] = p[1]; X[3 * g + 2] = p[2]; }
        nodeRod[g] = k; W[g] = sp.weight * v * (!r.closed && (i === 0 || i === n - 1) ? 0.5 : 1); G[g] = sp.width / 2;
      }
      const ns = r.closed ? n : n - 1;
      for (let i = 0; i < ns; i++) { seg.push(off + i, off + (i + 1) % n, v, ka); segRod.push(k); }
      const R0 = sp.steam && r.rest && r.rest.length === n ? r.rest : sp.steam ? r.pts : null;
      const b0 = bend.length / 4;
      for (let i = 0; i < n; i++) {
        if (!r.closed && (i === 0 || i === n - 1)) continue;
        const a = (i - 1 + n) % n, c = (i + 1) % n; bend.push(off + a, off + i, off + c, kb);
        if (R0) rest.push(R0[a][0] - 2 * R0[i][0] + R0[c][0], R0[a][1] - 2 * R0[i][1] + R0[c][1], R0[a][2] - 2 * R0[i][2] + R0[c][2]);
        else rest.push(0, 0, 0);
      }
      if (R0 && n >= 3) { // keep the reference shape (centred) to turn the rest curvature with the rod
        let cx = 0, cy = 0, cz = 0; for (const p of R0) { cx += p[0]; cy += p[1]; cz += p[2]; } cx /= n; cy /= n; cz /= n;
        const ref = new Float64Array(3 * n); R0.forEach((p, i) => { ref[3 * i] = p[0] - cx; ref[3 * i + 1] = p[1] - cy; ref[3 * i + 2] = p[2] - cz; });
        pre.push({ k, off, n, b0, nb: bend.length / 4 - b0, ref, r0: Float64Array.from(rest.slice(3 * b0)) });
      }
      if (r.held || sp.staked) for (let i = 0; i < n; i++) fixed[off + i] = 1;
      for (const fx of r.fix || []) {
        if (fx.i < 0 || fx.i >= n) continue; const g = off + fx.i; fixed[g] = 1; X[3 * g] = fx.p[0]; X[3 * g + 1] = fx.p[1]; X[3 * g + 2] = fx.p[2];
        if (fx.d) { const g2 = off + (fx.i === 0 ? 1 : fx.i - 1); fixed[g2] = 1; for (let c = 0; c < 3; c++) X[3 * g2 + c] = fx.p[c] + fx.d[c] * v; }
      }
    });
    // lashings: zero-length springs between a point on each rod (a node, or part-way along the segment after it: t)
    const jt = [], jointIds = [], jcap = [];
    const at = (E, rod, i, t) => { const n = E.n; i = M.clamp(i, 0, n - 1); t = t > 0 ? Math.min(t, 0.999) : 0; let i2 = i + 1; if (i2 >= n) { if (rod.closed) i2 = 0; else { i2 = i; t = 0; } } return [E.off + i, E.off + i2, t]; };
    // and the grip of the twine: weak springs across each lashing between the nodes either side of it on both rods, so a
    // lashed stick resists turning in its lashings (joint_rot, N m per radian) instead of swinging freely about them
    // the grip is as firm as the thinner rod lets it be (joint_rot is for a lashing on sticks; rattan weavers are gripped less),
    // and a lashing tied in the latest stage is snugged up once things have settled (its grip creeps until then)
    const br = [], brNew = [], brJ = []; const kr = mat.joint_rot == null ? 15 : mat.joint_rot; const ps = profs.stick; const EIref = ps.E_gpa * 1e9 * Math.pow(ps.section_mm / 1000, 4) / 12;
    const latest = model.meta && model.meta.stage;
    const sides = (E, rod, p) => { const n = E.n, i = p[0] - E.off; const lo = p[2] > 0 ? i : i - 1, hi = p[2] > 0 ? (p[1] - E.off) : i + 1; const out = []; for (const q of [lo, hi]) { const qq = rod.closed ? (q + n) % n : q; if (qq >= 0 && qq < n) out.push(E.off + qq); } return out; };
    for (const j of model.joints) {
      const A = index.get(j.a), B = index.get(j.b); if (!A || !B) continue;
      const pa = at(A, rods[A.k], j.ia, j.ta || 0), pb = at(B, rods[B.k], j.ib, j.tb || 0); if (pa[0] === pb[0] && !pa[2] && !pb[2]) continue;
      const wr = Math.max(1, Math.min(4, Math.round(j.wraps || 1))); // a lashing bound twice is twice as stiff and strong
      jt.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], (j.k || mat.joint_stiffness) * wr); jointIds.push(j.id); jcap.push(mat.joint_capacity_n * wr);
      // the grip remembers the lie of the two rods when the lashing was tied (j.grip, written once it first settles), so
      // rebuilding the simulation does not let a lashed stick ratchet round a little more each time
      const kj = kr * Math.min(1, rodP[A.k].EI / EIref, rodP[B.k].EI / EIref); const fresh = j.stage === latest ? 1 : 0;
      if (kj > 0) {
        const pairs = []; for (const u of sides(A, rods[A.k], pa)) for (const w of sides(B, rods[B.k], pb)) pairs.push([u, w, Math.hypot(X[3 * w] - X[3 * u], X[3 * w + 1] - X[3 * u + 1], X[3 * w + 2] - X[3 * u + 2])]);
        const g = Array.isArray(j.grip) && j.grip.length === pairs.length ? j.grip : null;
        pairs.forEach(([u, w, d], b) => { const d0 = g ? g[b] : d; const dk = Math.max(d0, 0.05); br.push(u, w, d0, kj / (2 * dk * dk)); brNew.push(!g && fresh ? 1 : 0); brJ.push(jointIds.length - 1); });
      }
    }
    for (let q = 0; q < seg.length; q += 4) { S[seg[q]] += 2 * seg[q + 3]; S[seg[q + 1]] += 2 * seg[q + 3]; }
    for (let q = 0; q < bend.length; q += 4) { S[bend[q]] += 4 * bend[q + 3]; S[bend[q + 1]] += 8 * bend[q + 3]; S[bend[q + 2]] += 4 * bend[q + 3]; }
    for (let q = 0; q < br.length; q += 4) { S[br[q]] += 2 * br[q + 3]; S[br[q + 1]] += 2 * br[q + 3]; }
    for (let q = 0; q < jt.length; q += 7) { const k = jt[q + 6]; S[jt[q]] += 2 * k * (1 - jt[q + 2]); S[jt[q + 1]] += 2 * k * jt[q + 2]; S[jt[q + 3]] += 2 * k * (1 - jt[q + 5]); S[jt[q + 4]] += 2 * k * jt[q + 5]; }
    const mk = SF.Phys && SF.Phys.tune && SF.Phys.tune.mass || MASS; const Mn = new Float64Array(N); for (let g = 0; g < N; g++) Mn[g] = mk * Math.max(S[g], 1);
    const sim = { mat, N, X, V, F, M: Mn, S, W, G, fixed, nodeRod, rods, rodP, index, ver: rods.map((r) => r.v || 0),
      seg: Float64Array.from(seg), segRod: Int32Array.from(segRod), segN: new Float64Array(seg.length / 4),
      bend: Float64Array.from(bend), rest: Float64Array.from(rest), pre,
      jt: Float64Array.from(jt), br: Float64Array.from(br), brNew: Uint8Array.from(brNew), brJ: Int32Array.from(brJ), creep: brNew.some((v) => v), jointIds, jointCap: Float64Array.from(jcap), jointF: new Float64Array(jt.length / 7),
      damping: SF.Phys && SF.Phys.tune && SF.Phys.tune.damping || 0.995, kinetic: !(SF.Phys && SF.Phys.tune && SF.Phys.tune.kinetic === false), residual: Infinity, iterations: 0, kePrev: 0, settledAt: -1 };
    updateRest(sim); forces(sim);
    return sim;
  }
  // carry on from a previous simulation for every rod that is unchanged (same node count, not edited since)
  function warmFrom(prev) {
    if (!prev) return null;
    return (rod) => {
      const e = prev.index.get(rod.id); if (!e || e.n !== rod.pts.length) return null;
      if ((rod.v || 0) > prev.ver[e.k]) return null; // edited since: start from its stored shape
      return { X: prev.X.subarray(3 * e.off, 3 * (e.off + e.n)), V: prev.V.subarray(3 * e.off, 3 * (e.off + e.n)) };
    };
  }

  // ------------------------------------------------------------ forces
  function forces(sim) {
    const { X, F, W, seg, segN, bend, rest, jt, jointF, N } = sim;
    F.fill(0); for (let g = 0; g < N; g++) F[3 * g + 1] -= W[g];
    for (let q = 0, s = 0; q < seg.length; q += 4, s++) {
      const a = 3 * seg[q], b = 3 * seg[q + 1]; const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2];
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9; const t = seg[q + 3] * (l - seg[q + 2]); segN[s] = t; const f = t / l;
      F[a] += f * dx; F[a + 1] += f * dy; F[a + 2] += f * dz; F[b] -= f * dx; F[b + 1] -= f * dy; F[b + 2] -= f * dz;
    }
    for (let q = 0, r = 0; q < bend.length; q += 4, r += 3) {
      const a = 3 * bend[q], m = 3 * bend[q + 1], c = 3 * bend[q + 2], k = bend[q + 3];
      const fx = k * (X[a] - 2 * X[m] + X[c] - rest[r]), fy = k * (X[a + 1] - 2 * X[m + 1] + X[c + 1] - rest[r + 1]), fz = k * (X[a + 2] - 2 * X[m + 2] + X[c + 2] - rest[r + 2]);
      F[a] -= fx; F[a + 1] -= fy; F[a + 2] -= fz; F[m] += 2 * fx; F[m + 1] += 2 * fy; F[m + 2] += 2 * fz; F[c] -= fx; F[c + 1] -= fy; F[c + 2] -= fz;
    }
    const br = sim.br;
    for (let q = 0; q < br.length; q += 4) {
      const a = 3 * br[q], b = 3 * br[q + 1]; const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2];
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9; const f = br[q + 3] * (l - br[q + 2]) / l;
      F[a] += f * dx; F[a + 1] += f * dy; F[a + 2] += f * dz; F[b] -= f * dx; F[b + 1] -= f * dy; F[b + 2] -= f * dz;
    }
    for (let q = 0, j = 0; q < jt.length; q += 7, j++) {
      const a0 = 3 * jt[q], a1 = 3 * jt[q + 1], wa = jt[q + 2], b0 = 3 * jt[q + 3], b1 = 3 * jt[q + 4], wb = jt[q + 5], k = jt[q + 6], ua = 1 - wa, ub = 1 - wb;
      const dx = X[b0] * ub + X[b1] * wb - X[a0] * ua - X[a1] * wa, dy = X[b0 + 1] * ub + X[b1 + 1] * wb - X[a0 + 1] * ua - X[a1 + 1] * wa, dz = X[b0 + 2] * ub + X[b1 + 2] * wb - X[a0 + 2] * ua - X[a1 + 2] * wa;
      jointF[j] = k * Math.sqrt(dx * dx + dy * dy + dz * dz); const fx = k * dx, fy = k * dy, fz = k * dz;
      F[a0] += fx * ua; F[a0 + 1] += fy * ua; F[a0 + 2] += fz * ua; F[a1] += fx * wa; F[a1 + 1] += fy * wa; F[a1 + 2] += fz * wa;
      F[b0] -= fx * ub; F[b0 + 1] -= fy * ub; F[b0 + 2] -= fz * ub; F[b1] -= fx * wb; F[b1 + 1] -= fy * wb; F[b1 + 2] -= fz * wb;
    }
  }

  // turn each pre-bent rod's rest curvature with the rod: best-fit rotation of its reference shape onto where it is (Kabsch)
  function updateRest(sim) {
    const { X, rest } = sim;
    for (const p of sim.pre) {
      const { off, n, ref } = p; let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < n; i++) { cx += X[3 * (off + i)]; cy += X[3 * (off + i) + 1]; cz += X[3 * (off + i) + 2]; } cx /= n; cy /= n; cz /= n;
      const H = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // sum ref_i (cur_i - c)^T
      for (let i = 0; i < n; i++) {
        const ax = ref[3 * i], ay = ref[3 * i + 1], az = ref[3 * i + 2]; const bx = X[3 * (off + i)] - cx, by = X[3 * (off + i) + 1] - cy, bz = X[3 * (off + i) + 2] - cz;
        H[0] += ax * bx; H[1] += ax * by; H[2] += ax * bz; H[3] += ay * bx; H[4] += ay * by; H[5] += ay * bz; H[6] += az * bx; H[7] += az * by; H[8] += az * bz;
      }
      const R = kabsch(H); if (!R) continue;
      for (let b = 0; b < p.nb; b++) {
        const o = 3 * (p.b0 + b), x = p.r0[3 * b], y = p.r0[3 * b + 1], z = p.r0[3 * b + 2];
        rest[o] = R[0] * x + R[1] * y + R[2] * z; rest[o + 1] = R[3] * x + R[4] * y + R[5] * z; rest[o + 2] = R[6] * x + R[7] * y + R[8] * z;
      }
    }
  }
  // rotation R (row-major) minimising sum |R a_i - b_i|^2 given H = sum a_i b_i^T; works for flat shapes (rank 2)
  function kabsch(H) {
    const B = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; // H^T H
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += H[3 * k + i] * H[3 * k + j]; B[i][j] = s; }
    const e = M.eigSym3(B); const v1 = e.vectors[2], v2 = e.vectors[1]; const s1 = Math.sqrt(Math.max(0, e.values[2])), s2 = Math.sqrt(Math.max(0, e.values[1]));
    if (!(s1 > 1e-12) || !(s2 > 1e-9 * s1)) return null;
    const Hv = (v) => [H[0] * v[0] + H[1] * v[1] + H[2] * v[2], H[3] * v[0] + H[4] * v[1] + H[5] * v[2], H[6] * v[0] + H[7] * v[1] + H[8] * v[2]];
    const u1 = M.norm(Hv(v1)), u2n = Hv(v2); const d = M.dot(u2n, u1); const u2 = M.norm([u2n[0] - d * u1[0], u2n[1] - d * u1[1], u2n[2] - d * u1[2]]);
    const u3 = M.cross(u1, u2), v3 = M.cross(v1, v2);
    const R = new Array(9); // R = sum v_k u_k^T
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[3 * i + j] = v1[i] * u1[j] + v2[i] * u2[j] + v3[i] * u3[j];
    return R;
  }

  // ------------------------------------------------------------ dynamic relaxation
  function iterate(sim, steps) {
    const { X, V, F, M: Mn, S, G, fixed, N } = sim; let res = 0; const kin = sim.kinetic && !sim.drag; // viscous while a hand moves a node
    const mu = sim.mat.ground_mu == null ? 0.5 : sim.mat.ground_mu;
    const dr = sim.drag;
    for (let c = 0; c < steps; c++) {
      if (dr) { // a node held by the hand moves towards the cursor a few millimetres per step
        const o = 3 * dr.g; const dx = dr.p[0] - X[o], dy = dr.p[1] - X[o + 1], dz = dr.p[2] - X[o + 2]; const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        dr.moving = d > 1e-6; if (dr.moving) { const s = d > dr.step ? dr.step / d : 1; X[o] += dx * s; X[o + 1] += dy * s; X[o + 2] += dz * s; if (X[o + 1] < G[dr.g]) X[o + 1] = G[dr.g]; }
      }
      forces(sim); res = 0; let vmax = 0, ke = 0; const dmp = kin ? 1 : sim.drag ? 0.97 : sim.damping; const kick = kin && sim.restart ? 0.5 : 1; sim.restart = false;
      for (let g = 0; g < N; g++) {
        if (fixed[g]) continue; const o = 3 * g, im = kick / Mn[g];
        if (X[o + 1] <= G[g] + 1e-7 && F[o + 1] < 0) {
          // resting on the ground: it pushes back, and friction holds the node still up to mu times that push (Coulomb)
          const fx = F[o], fz = F[o + 2]; const fh = Math.sqrt(fx * fx + fz * fz), cap = -F[o + 1] * mu; F[o + 1] = 0;
          if (fh <= cap) { F[o] = 0; F[o + 2] = 0; V[o] = 0; V[o + 2] = 0; } else { const k = (fh - cap) / fh; F[o] = fx * k; F[o + 2] = fz * k; }
          if (V[o + 1] < 0) V[o + 1] = 0;
        }
        let vx = V[o] * dmp + F[o] * im, vy = V[o + 1] * dmp + F[o + 1] * im, vz = V[o + 2] * dmp + F[o + 2] * im;
        X[o] += vx; X[o + 1] += vy; X[o + 2] += vz;
        if (X[o + 1] < G[g]) { X[o + 1] = G[g]; if (vy < 0) vy = 0; } // no sinking into the ground
        V[o] = vx; V[o + 1] = vy; V[o + 2] = vz;
        const r = Math.sqrt(F[o] * F[o] + F[o + 1] * F[o + 1] + F[o + 2] * F[o + 2]) / Math.max(S[g], 1); if (r > res) res = r;
        const vm = Math.abs(vx) + Math.abs(vy) + Math.abs(vz); if (vm > vmax) vmax = vm;
        ke += Mn[g] * (vx * vx + vy * vy + vz * vz);
      }
      if (vmax >= VMAX) { V.fill(0); for (let g = 0; g < N; g++) Mn[g] *= 1.25; sim.kePrev = 0; }
      else if (kin && ke < sim.kePrev) {
        // kinetic damping (Barnes): the energy peaked half a step back; return there, stop everything and restart with a half kick
        for (let g = 0; g < N; g++) { if (fixed[g]) continue; const o = 3 * g, im = 1 / Mn[g];
          X[o] -= 1.5 * V[o] - 0.5 * F[o] * im; X[o + 1] -= 1.5 * V[o + 1] - 0.5 * F[o + 1] * im; X[o + 2] -= 1.5 * V[o + 2] - 0.5 * F[o + 2] * im; if (X[o + 1] < G[g]) X[o + 1] = G[g]; }
        V.fill(0); sim.kePrev = 0; sim.restart = true;
      } else sim.kePrev = ke;
      sim.iterations++; sim.vmax = vmax;
      if ((sim.iterations & 31) === 0 && sim.pre.length) updateRest(sim);
      if (sim.creep && (sim.iterations & 15) === 0) { // new lashings' grip follows until the structure has (nearly) settled, then holds
        const br = sim.br, bn = sim.brNew;
        for (let q = 0, b = 0; q < br.length; q += 4, b++) if (bn[b]) { const u = 3 * br[q], w = 3 * br[q + 1]; br[q + 2] = Math.hypot(X[w] - X[u], X[w + 1] - X[u + 1], X[w + 2] - X[u + 2]); }
        if (res < 20 * TOL && vmax < 20 * VTOL) sim.creep = false;
      }
    }
    sim.residual = res; return res;
  }
  const settled = (sim) => sim.residual < TOL && sim.vmax < VTOL && !(sim.drag && sim.drag.moving);
  // take hold of a node and move it by hand (Basketry's pull): it follows the cursor; the force the hand needs is reported
  function grab(sim, g) { if (g < 0 || g >= sim.N || sim.fixed[g]) return null; const o = 3 * g; sim.drag = { g, p: [sim.X[o], sim.X[o + 1], sim.X[o + 2]], start: [sim.X[o], sim.X[o + 1], sim.X[o + 2]], step: 0.004, moving: false, peak: 0 }; sim.fixed[g] = 1; return sim.drag; }
  function drop(sim) { if (!sim.drag) return; sim.fixed[sim.drag.g] = 0; sim.drag = null; sim.kePrev = 0; }
  function handForce(sim) { const d = sim.drag; if (!d) return 0; const o = 3 * d.g; const f = Math.hypot(sim.F[o], sim.F[o + 1], sim.F[o + 2]); d.peak = Math.max(d.peak, f); return f; }
  // run until settled or out of time; returns {iterations, residual, settled}
  function relax(sim, opts) {
    opts = opts || {}; const t0 = Date.now(); const budget = opts.budgetMs == null ? 2500 : opts.budgetMs; const tol = opts.tol || TOL;
    const maxIt = opts.maxIterations || 400000; let it = 0;
    while (it < maxIt && Date.now() - t0 < budget) { iterate(sim, 50); it += 50; if (sim.residual < tol && sim.vmax < VTOL) break; }
    return { iterations: it, residual: sim.residual, settled: sim.residual < tol && sim.vmax < VTOL };
  }

  // ------------------------------------------------------------ results
  function positions(sim, id) {
    const e = sim.index.get(id); if (!e) return null; const out = [];
    for (let i = 0; i < e.n; i++) { const o = 3 * (e.off + i); out.push([sim.X[o], sim.X[o + 1], sim.X[o + 2]]); }
    return out;
  }
  function jointEnds(sim, j) {
    const q = 7 * j, X = sim.X; const p = (n0, n1, w) => [X[3 * n0] * (1 - w) + X[3 * n1] * w, X[3 * n0 + 1] * (1 - w) + X[3 * n1 + 1] * w, X[3 * n0 + 2] * (1 - w) + X[3 * n1 + 2] * w];
    return [p(sim.jt[q], sim.jt[q + 1], sim.jt[q + 2]), p(sim.jt[q + 3], sim.jt[q + 4], sim.jt[q + 5])];
  }
  // curvature at each node (turning angle / mean segment length), stress per segment and the worst per rod
  // total stress = axial + E c |kappa - rest kappa|; added = axial + E c |kappa - kappa when the rod was placed|
  function stress(sim) {
    const { X, bend, rest, seg, segN, rodP, N } = sim; const kap = new Float64Array(N), kap0 = new Float64Array(N), dk = new Float64Array(N);
    for (let q = 0, r = 0; q < bend.length; q += 4, r += 3) {
      const a = 3 * bend[q], m = 3 * bend[q + 1], c = 3 * bend[q + 2];
      const ux = X[m] - X[a], uy = X[m + 1] - X[a + 1], uz = X[m + 2] - X[a + 2], wx = X[c] - X[m], wy = X[c + 1] - X[m + 1], wz = X[c + 2] - X[m + 2];
      const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx; const ang = Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), ux * wx + uy * wy + uz * wz);
      const L = 0.5 * (Math.sqrt(ux * ux + uy * uy + uz * uz) + Math.sqrt(wx * wx + wy * wy + wz * wz)); const g = bend[q + 1]; const L2 = Math.max(L * L, 1e-9);
      kap[g] = ang / Math.max(L, 1e-6); kap0[g] = Math.sqrt(rest[r] * rest[r] + rest[r + 1] * rest[r + 1] + rest[r + 2] * rest[r + 2]) / L2;
      // the change of curvature from rest, as a vector (what the bending spring resists): this is what stresses the fibres
      const ex = wx - ux - rest[r], ey = wy - uy - rest[r + 1], ez = wz - uz - rest[r + 2]; dk[g] = Math.sqrt(ex * ex + ey * ey + ez * ez) / L2;
    }
    const placed = new Float64Array(N).fill(NaN);
    for (const rod of sim.rods) { if (!rod.k0) continue; const e = sim.index.get(rod.id); for (let i = 0; i < e.n && i < rod.k0.length; i++) placed[e.off + i] = rod.k0[i] / 1000; }
    const ns = segN.length; const segStress = new Float64Array(ns), segUtil = new Float64Array(ns), segLoad = new Float64Array(ns);
    const nr = sim.rods.length; const rodMax = new Float64Array(nr), rodStress = new Float64Array(nr), rodLoad = new Float64Array(nr), rodForm = new Float64Array(nr);
    for (let q = 0, s = 0; q < seg.length; q += 4, s++) {
      const i = seg[q], j = seg[q + 1]; const k = sim.nodeRod[i]; const p = rodP[k];
      const ax = Math.abs(segN[s]) / p.A;
      const pk = (g) => (Number.isNaN(placed[g]) ? kap[g] : placed[g]);
      // bending into place (each rod of a bundle bent on its own: c1), at most the bending there is now; the rest of the
      // bending is added by the loads since (the bundle acting partly as one: c)
      const bk = Math.max(dk[i], dk[j]); const fk = Math.min(bk, Math.max(Math.abs(pk(i) - kap0[i]), Math.abs(pk(j) - kap0[j])));
      const form = p.E * p.c1 * fk, load = p.E * p.c * (bk - fk);
      const added = ax + load, total = added + form;
      segStress[s] = total / 1e6; segUtil[s] = total / p.fb; segLoad[s] = added / 1e6;
      if (segUtil[s] > rodMax[k]) { rodMax[k] = segUtil[s]; rodStress[k] = segStress[s]; }
      if (segLoad[s] > rodLoad[k]) rodLoad[k] = segLoad[s];
      if (form / 1e6 > rodForm[k]) rodForm[k] = form / 1e6;
    }
    return { kappa: kap, kappa0: kap0, segStress, segUtil, segLoad, rodMax, rodStress, rodLoad, rodForm, jointF: sim.jointF };
  }
  // what each ground socket must hold: force on the fixed node(s) of a rod end, and the moment of a clamp about the end
  function reactions(sim) {
    forces(sim); const out = [];
    sim.rods.forEach((rod, k) => {
      const e = sim.index.get(rod.id);
      for (const fx of rod.fix || []) {
        const g = e.off + fx.i; const nodes = [g]; if (fx.d) nodes.push(e.off + (fx.i === 0 ? 1 : fx.i - 1));
        const Fr = [0, 0, 0], Mo = [0, 0, 0];
        for (const n of nodes) {
          const f = [-sim.F[3 * n], -sim.F[3 * n + 1], -sim.F[3 * n + 2]]; Fr[0] += f[0]; Fr[1] += f[1]; Fr[2] += f[2];
          const r = [sim.X[3 * n] - fx.p[0], sim.X[3 * n + 1] - fx.p[1], sim.X[3 * n + 2] - fx.p[2]]; const m = M.cross(r, f); Mo[0] += m[0]; Mo[1] += m[1]; Mo[2] += m[2];
        }
        out.push({ rod: rod.id, i: fx.i, p: fx.p, clamp: !!fx.d, F: Fr, down: Math.max(0, Fr[1]), up: Math.max(0, -Fr[1]), side: Math.hypot(Fr[0], Fr[2]), moment: M.len(Mo) });
      }
    });
    return out;
  }
  return { AX, TOL, VTOL, settled, grab, drop, handForce, jointEnds, profiles, sectionOf, segLen, build, warmFrom, forces, iterate, relax, positions, stress, reactions, updateRest, kabsch };
})();
