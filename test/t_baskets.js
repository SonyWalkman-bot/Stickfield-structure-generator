// Baskets: rings stacked and braced into baskets, a pile of them bolted together, built ring by ring. Checks that the
// pile stands under its own weight at every stage, that rings stay inside the sizes that can be bent, that stock is
// counted, and that circles are found in a drawn plan.
const { load, ALL } = require('./load'); const SF = load(ALL); const PH = SF.Phys, Mo = SF.Model, B = SF.Basket;
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
const W = SF.World.create(SF.Defaults.design(), SF.Defaults.params());
W.edit((m, s) => B.buildAll(m, B.pile({}), null, s));
const kinds = {}; for (const r of W.model.rods.values()) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
ok(W.model.meta.baskets.length === 7 && kinds.ring >= 20 && (kinds.stake || 0) + (kinds.brace || 0) > 50, '7 baskets: ' + JSON.stringify(kinds) + ', ' + W.model.joints.length + ' bolts and lashings');
ok(Array.from(W.model.rods.values()).filter((r) => r.kind === 'ring').every((r) => r.L >= B.LIMITS.cMin - 1e-6 && r.L <= B.LIMITS.cMax + 1e-6), 'every ring 3.7-5.0 m round');
ok(!Array.from(W.model.rods.values()).some((r) => r.held), 'formwork struck after each basket');
const r = PH.relax(W.sim, { budgetMs: 15000 }); W.settled = r.settled; W.sync(); const S = SF.Checks.summary(W);
ok(r.settled, 'the pile settles (' + r.iterations + ' iterations)');
ok(S.peak < 1 && S.maxTieU < 1, 'peak stress ' + (S.peak * 100).toFixed(0) + '%, busiest bolt ' + (S.maxTieU * 100).toFixed(0) + '% of capacity');
let lo = Infinity; for (let g = 0; g < W.sim.N; g++) lo = Math.min(lo, W.sim.X[3 * g + 1]); ok(lo > -0.02, 'nothing sinks through the ground (lowest ' + lo.toFixed(3) + ' m)');
ok(B.issues(W.model).every((x) => x.level !== 'crit'), 'no stick bent tighter than a soaked stick goes');
const mat = B.materials(W.model, {}); ok(mat.rows.every((x) => x.need <= x.have), 'fits the stock: ' + mat.rows.map((x) => x.need + '/' + x.have + ' ' + x.unit).join(', '));
// each stage of the build stands as it goes up
const stages = Mo.stages(W.model); let worst = 0, worstK = 0, sunk = 0;
for (const k of stages.filter((_, i) => i % 3 === 0 || i === stages.length - 1)) {
  const m = Mo.stageModel(W.model, k); m.material = W.model.material; const sim = PH.build(m); PH.relax(sim, { budgetMs: 1500 }); const st = PH.stress(sim);
  for (let q = 0; q < st.rodMax.length; q++) if (st.rodMax[q] > worst) { worst = st.rodMax[q]; worstK = k; }
  for (let g = 0; g < sim.N; g++) if (sim.X[3 * g + 1] < -0.05) sunk++;
}
ok(worst < 1 && sunk === 0, stages.length + ' stages: worst stress while building ' + (worst * 100).toFixed(0) + '% (stage ' + worstK + ')');
// undo brings the basket definitions back with the rods
W.edit((m, s) => B.buildAll(m, [], null, s)); ok(W.model.rods.size === 0, 'baskets removed'); W.undoLast(); ok(W.model.meta.baskets.length === 7 && W.model.rods.size > 50, 'undo brings them back');
// rings drawn in a plan are found
{
  const w = 200, h = 160; const g = new Float32Array(w * h).fill(1); const circ = [[60, 70, 30], [130, 60, 22], [120, 120, 16]];
  for (const [cx, cy, rr] of circ) for (let a = 0; a < 720; a++) { const x = Math.round(cx + rr * Math.cos(a / 720 * 2 * Math.PI)), y = Math.round(cy + rr * Math.sin(a / 720 * 2 * Math.PI)); g[y * w + x] = 0; g[y * w + x + 1] = 0; }
  const f = B.findCircles(g, w, h, { max: 6 }); const hit = circ.filter(([cx, cy, rr]) => f.some((c) => Math.hypot(c.x - cx, c.y - cy) < 3 && Math.abs(c.r - rr) < 4));
  ok(hit.length === 3, 'found ' + hit.length + ' of 3 drawn rings (' + f.length + ' circles in all)');
  const fit = B.fromCircles({}, f.slice(0, 3)); ok(fit.baskets.every((b) => b.C >= 3.7 && b.C <= 5.0), 'sketch circles become baskets 3.7-5.0 m round');
}
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exitCode = fails ? 1 : 0;
