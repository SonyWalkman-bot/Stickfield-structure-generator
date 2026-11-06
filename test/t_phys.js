const { load, ALL } = require('./load'); const SF = load(ALL); const M = SF.M, PH = SF.Phys;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const mat = SF.Defaults.params().material;
const mk = (rods, joints, m) => ({ rods: new Map(rods.map((r) => [r.id, r])), joints: joints || [], material: Object.assign({}, mat, m || {}) });
const line = (a, b, n) => Array.from({ length: n }, (_, i) => M.lerp3(a, b, i / (n - 1)));
// 1. cantilever under self-weight, clamped at x = 0 along +x
{
  const L = 2, n = 8; const r = { id: 'r1', kind: 'rod', profile: 'stick', L, closed: false, pts: line([0, 1, 0], [L, 1, 0], n), fix: [{ i: 0, p: [0, 1, 0], d: [1, 0, 0] }] };
  const model = mk([r]); const sim = PH.build(model); const t = Date.now(); const res = PH.relax(sim, { budgetMs: 8000 });
  const tip = PH.positions(sim, 'r1')[n - 1]; const sp = PH.sectionOf(model.material, r); const v = L / (n - 1);
  const Lc = L - v / 2; const exact = sp.weight * Lc ** 4 / (8 * sp.EI); // the clamp (two fixed nodes) acts half a segment in
  console.log('  cantilever iters', res.iterations, 'settled', res.settled, 'ms', Date.now() - t, 'tip drop', (1 - tip[1]).toFixed(5), 'exact (L - v/2)', exact.toFixed(5), 'exact L', (sp.weight * L ** 4 / (8 * sp.EI)).toFixed(5));
  ok(Math.abs((1 - tip[1]) / exact - 1) < 0.03, 'cantilever tip within 3% of beam theory');
}
// 2. 8 m rod sprung between pins 5 m apart (no weight): rise against the pinned elastica
{
  const L = 8, c = 5, n = 28; const e = M.elastica(L, c, 200);
  // start from a circular arc of the right length (as Basketry does), pinned ends
  let lo = 1e-6, hi = Math.PI - 1e-6; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (Math.sin(m) / m > c / L) lo = m; else hi = m; } const d = (lo + hi) / 2; const R = L / (2 * d);
  const pts = Array.from({ length: n }, (_, i) => { const t = -d + 2 * d * i / (n - 1); return [R * Math.sin(t), R * Math.cos(t) - R * Math.cos(d), 0]; });
  const r = { id: 'a', kind: 'arch', profile: 'stick', L, closed: false, pts, fix: [{ i: 0, p: pts[0].slice() }, { i: n - 1, p: pts[n - 1].slice() }] };
  const model = mk([r], [], { gravity: 0 }); const sim = PH.build(model); const t = Date.now(); const res = PH.relax(sim, { budgetMs: 15000 });
  const P = PH.positions(sim, 'a'); const rise = Math.max(...P.map((p) => p[1]));
  console.log('  elastica iters', res.iterations, 'settled', res.settled, 'ms', Date.now() - t, 'rise', rise.toFixed(4), 'analytic', e.H.toFixed(4), 'start', (R - R * Math.cos(d)).toFixed(4));
  ok(Math.abs(rise / e.H - 1) < 0.03, 'sprung arch rise within 3% of the pinned elastica');
  // the thrust: horizontal reaction at a pin vs elastica (P = EI * lam, lam = (2K/L)^2)
  const re = PH.reactions(sim); console.log('  pin thrust', re.map((q) => q.F[0].toFixed(1)).join(', '));
}
// 3. a steam-bent hoop turned 40 degrees from its rest pose keeps its shape and pose (rest curvature turns with it)
{
  const n = 24, Lh = 6, Rh = Lh / (2 * Math.PI); const circ = Array.from({ length: n }, (_, i) => { const a = 2 * Math.PI * i / n; return [Rh * Math.cos(a), 2 + Rh * Math.sin(a), 0]; });
  const rot = (p, ang) => { const c = Math.cos(ang), s = Math.sin(ang); const y = p[1] - 2; return [p[0] * c, 2 + y, p[0] * s]; };
  const pts = circ.map((p) => rot(p, 40 * Math.PI / 180));
  const r = { id: 'h', kind: 'hoop', profile: 'frame', L: Lh, closed: true, pts, rest: circ, held: false };
  const model = mk([r], [], { gravity: 0 }); const sim = PH.build(model); const r0 = sim.residual; PH.relax(sim, { budgetMs: 3000 });
  const P = PH.positions(sim, 'h'); let dev = 0; for (let i = 0; i < n; i++) dev = Math.max(dev, M.dist(P[i], pts[i]));
  console.log('  hoop moved', (dev * 1000).toFixed(2), 'mm');
  ok(dev < 0.005, 'turned steam-bent hoop stays as placed (rest shape turns with it)');
}
// 4. lashing carries the weight of a hanging rod
{
  const A = { id: 'A', kind: 'rod', profile: 'frame', L: 2, closed: false, pts: line([-1, 2, 0], [1, 2, 0], 9), held: true };
  const B = { id: 'B', kind: 'rod', profile: 'stick', L: 1.5, closed: false, pts: line([0, 2, 0], [0, 0.5, 0], 6) };
  const model = mk([A, B], [{ id: 'j1', a: 'A', ia: 4, b: 'B', ib: 0 }]); const sim = PH.build(model); PH.relax(sim, { budgetMs: 4000, tol: 1e-10 });
  const w = PH.sectionOf(model.material, B).weight * 1.5; console.log('  joint force', sim.jointF[0].toFixed(2), 'N, weight', w.toFixed(2), 'N');
  ok(Math.abs(sim.jointF[0] / w - 1) < 0.02, 'lashing force equals the weight it holds');
}
console.log(bad ? 'FAILURES ' + bad : 'ALL OK'); process.exitCode = bad ? 1 : 0;
