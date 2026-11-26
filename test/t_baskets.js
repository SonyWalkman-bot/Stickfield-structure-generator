// Baskets: rings stacked and braced into baskets, a pile of them bolted together, built ring by ring. Checks that the
// pile stands under its own weight at every stage, that rings stay inside the sizes that can be bent, that stock is
// counted, and that circles are found in a drawn plan.
const { load, ALL } = require('./load'); const SF = load(ALL); const PH = SF.Phys, Mo = SF.Model, B = SF.Basket;
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
const W = SF.World.create(SF.Defaults.design(), SF.Defaults.params());
W.edit((m, s) => B.buildAll(m, B.pile({}), null, s));
const kinds = {}; for (const r of W.model.rods.values()) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
ok(W.model.meta.baskets.length === 7 && kinds.ring >= 20 && (kinds.stake || 0) + (kinds.brace || 0) > 50, '7 baskets: ' + JSON.stringify(kinds) + ', ' + W.model.joints.length + ' bolts and lashings');
ok(Array.from(W.model.rods.values()).filter((r) => r.kind === 'ring').every((r) => r.L >= B.LIMITS.cMin - 1e-6 && r.L <= B.LIMITS.cMax + 1e-6), 'every ring at least 1.2 m across');
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
// the notebook plan: six baskets clad in thin sticks stand, and the cladding is counted against the thin sticks
{
  const W2 = SF.World.create(SF.Defaults.design(), SF.Defaults.params()); W2.edit((m, s) => B.buildAll(m, B.notebook({}), null, s));
  const clad = Array.from(W2.model.rods.values()).filter((r) => r.kind === 'clad'); ok(W2.model.meta.baskets.length === 6 && clad.length > 30, '6 baskets with ' + clad.length + ' cladding sticks');
  ok(clad.every((r) => W2.model.joints.filter((j) => j.a === r.id || j.b === r.id).length >= 3), 'every cladding stick is lashed in three places or more');
  const r2 = PH.relax(W2.sim, { budgetMs: 20000 }); W2.settled = r2.settled; W2.sync(); const S2 = SF.Checks.summary(W2);
  ok(r2.settled && S2.peak < 1 && S2.maxTieU < 1, 'clad baskets settle: peak ' + (S2.peak * 100).toFixed(0) + '%, busiest lashing ' + (S2.maxTieU * 100).toFixed(0) + '%');
  const m2 = B.materials(W2.model, {}); const thin = m2.rows.find((x) => /Thin/.test(x.what)); ok(thin.need > 10 && thin.need <= thin.have, 'cladding uses ' + thin.need + ' of ' + thin.have + ' thin sticks');
  ok(B.issues(W2.model).every((x) => x.level !== 'crit'), 'nothing bent beyond what the material does');
}
// every layout: twisted, tipped and overlapping rings bolted where they cross, clad along the shape, and it all stands
for (const [id, , fn] of B.LAYOUTS) {
  const W3 = SF.World.create(SF.Defaults.design(), SF.Defaults.params()); W3.edit((m, s) => B.buildAll(m, fn({}), null, s));
  const rings = Array.from(W3.model.rods.values()).filter((r) => r.kind === 'ring'); const ringBolts = W3.model.joints.filter((j) => j.type === 'bolt' && W3.model.rods.get(j.a).kind === 'ring' && W3.model.rods.get(j.b).kind === 'ring').length;
  const r3 = PH.relax(W3.sim, { budgetMs: 20000 }); W3.settled = r3.settled; W3.sync(); const S3 = SF.Checks.summary(W3);
  ok(r3.settled && S3.peak < 1.05 && B.issues(W3.model).every((x) => x.level !== 'crit'), id + ': ' + rings.length + ' rings, ' + ringBolts + ' ring-to-ring bolts, settles, peak ' + (S3.peak * 100).toFixed(0) + '%');
}
{
  let k = 0; const id = () => 'F' + (++k); const s = B.sweep([0, 1, 0], [4, 1, 0], { count: 6, tip: 80, twist: 360 }, id);
  ok(s.length === 6 && s.every((f) => f.C >= 3.7 && f.C <= 5.0), 'a sweep makes 6 rings inside the sizes that bend');
  const arr = B.ringOps(s, 'array', { count: 3 }, id); ok(arr.length === 18 && new Set(arr.map((f) => f.id)).size === 18, 'copied round three times: 18 rings, each its own id');
}
// two pointed baskets under one skin: the bracing runs past the top ring to a point, and the cladding runs on from one
// basket to the other without going into the space where they overlap
{
  const W5 = SF.World.create(SF.Defaults.design(), SF.Defaults.params()); const bs = B.pair({}); W5.edit((m, s) => B.buildAll(m, bs, null, s));
  const rods = Array.from(W5.model.rods.values()); const skin = rods.filter((r) => r.bk === 'skin');
  const both = skin.filter((r) => { const on = new Set(); for (const j of W5.model.joints) { const o = j.a === r.id ? j.b : j.b === r.id ? j.a : null; const q = o && W5.model.rods.get(o); if (q && q.bk && q.bk !== 'skin') on.add(q.bk); } return on.size > 1; });
  ok(skin.length > 40 && both.length >= 3, 'one skin: ' + skin.length + ' cladding sticks, ' + both.length + ' of them lashed to both baskets');
  const sh = B.shapes(W5.model, bs); const inside = skin.filter((r) => r.pts.some((p) => sh.every((q) => q !== undefined) && sh.filter((q) => B.sdBasket(q, p).d < -0.15).length > 0)).length;
  ok(inside <= skin.length * 0.05, 'cladding stays on the outside: ' + inside + ' sticks dip more than 0.15 m inside a basket');
  for (const b of bs) { const R = B.rings(b); const Rt = R[R.length - 1]; const apex = SF.M.add(Rt.c, SF.M.mul(Rt.n, b.apex)); const tips = rods.filter((r) => r.bk === b.id && r.kind === 'stake' && SF.M.dist(r.pts[r.pts.length - 1], apex) < 0.05).length;
    ok(tips >= 6, b.id + ': ' + tips + ' sticks run past the top ring and are bound at its point'); }
  const r5 = PH.relax(W5.sim, { budgetMs: 20000 }); const S5 = SF.Checks.summary(W5); ok(r5.settled && S5.peak < 1, 'the two pods settle under their skin: peak ' + (S5.peak * 100).toFixed(0) + '%');
}
// rings: no upper size, but big ones are spliced from several poles and flagged for the crew; under 1.2 m across is impossible
{
  const big = Object.assign(B.make({ baskets: [] }, 0, 0, 9), { C: 9, rings: 12, gap: 0.45, shape: 'straight' }); const R = B.rings(big);
  ok(R.length === 12 && Math.abs(R[0].C - 9) < 1e-9, 'a basket takes 12 rings, the base 9 m round');
  const W6 = SF.World.create(SF.Defaults.design(), SF.Defaults.params()); W6.edit((m, s) => B.buildAll(m, [Object.assign(big, { rings: 2 })], null, s));
  const mt = B.materials(W6.model, {}); const iss = B.issues(W6.model);
  ok(B.ringPoles(9) === 3 && mt.splices >= 4 && iss.some((x) => x.level === 'warn' && /spliced/.test(x.text)) && iss.every((x) => x.level !== 'crit'), '9 m rings: ' + B.ringPoles(9) + ' poles each, flagged as hard to bend by hand');
  ok(B.clampC(2) === B.LIMITS.cMin && Math.abs(B.LIMITS.cMin / Math.PI - 1.2) < 1e-9, 'no ring tighter than 1.2 m across');
}
// one ring moved on its own: only that ring changes size
{
  const bs = B.LAYOUTS.find((l) => l[0] === 'swirl')[2]({}); const before = B.rings(bs[0]).map((r) => r.C); bs[0].ringEdits = { 3: { dC: -1.0, tilt: 35 } }; const after = B.rings(bs[0]);
  ok(after[3].C < before[3] - 0.3 && after[3].C >= B.LIMITS.cMin && after[2].C === before[2] && after[4].C === before[4] && Math.abs(Math.acos(after[3].n[1]) * 180 / Math.PI - 35) < 0.5, 'a ring edited on its own: ' + before[3].toFixed(2) + ' → ' + after[3].C.toFixed(2) + ' m round, tipped 35°');
}
// rings drawn in a plan are found
{
  const w = 200, h = 160; const g = new Float32Array(w * h).fill(1); const circ = [[60, 70, 30], [130, 60, 22], [120, 120, 16]];
  for (const [cx, cy, rr] of circ) for (let a = 0; a < 720; a++) { const x = Math.round(cx + rr * Math.cos(a / 720 * 2 * Math.PI)), y = Math.round(cy + rr * Math.sin(a / 720 * 2 * Math.PI)); g[y * w + x] = 0; g[y * w + x + 1] = 0; }
  const f = B.findCircles(g, w, h, { max: 6 }); const hit = circ.filter(([cx, cy, rr]) => f.some((c) => Math.hypot(c.x - cx, c.y - cy) < 3 && Math.abs(c.r - rr) < 4));
  ok(hit.length === 3, 'found ' + hit.length + ' of 3 drawn rings (' + f.length + ' circles in all)');
  const fit = B.fromCircles({}, f.slice(0, 3)); ok(fit.baskets.every((b) => b.C >= B.LIMITS.cMin - 1e-9 && b.C <= 5.0 + 1e-9), 'sketch circles become baskets between the tightest ring and one 5 m pole');
}
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exitCode = fails ? 1 : 0;
