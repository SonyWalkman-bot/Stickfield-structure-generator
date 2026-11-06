const { load, ALL } = require('./load'); const SF = load(ALL); const M = SF.M, PH = SF.Phys, Mo = SF.Model;
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
// 1. pulling a node of a sprung arch: it follows the hand and the hand feels a force; it springs back when let go
{
  const W = SF.World.create(SF.Defaults.design(), SF.Defaults.params());
  W.edit((m, s) => Mo.addArch(m, { a: [-2, 0, 0], b: [2, 0, 0], length: 6, profile: 'stick' }, s)); PH.relax(W.sim, { budgetMs: 4000 }); W.settled = true; W.sync();
  const rod = Array.from(W.model.rods.values())[0]; const e = W.sim.index.get(rod.id); const g = e.off + (e.n >> 1);
  const p0 = [W.sim.X[3 * g], W.sim.X[3 * g + 1], W.sim.X[3 * g + 2]];
  const d = PH.grab(W.sim, g); ok(!!d, 'grabbed the crown');
  d.p = [p0[0], p0[1] - 0.3, p0[2]]; PH.relax(W.sim, { budgetMs: 4000 }); const f = PH.handForce(W.sim);
  ok(Math.abs(W.sim.X[3 * g + 1] - (p0[1] - 0.3)) < 1e-3, 'crown pushed down 0.3 m'); ok(f > 5 && f < 2000, 'hand force ' + f.toFixed(1) + ' N');
  PH.drop(W.sim); const r = PH.relax(W.sim, { budgetMs: 4000 }); ok(Math.abs(W.sim.X[3 * g + 1] - p0[1]) < 5e-3, 'springs back after release (' + (W.sim.X[3 * g + 1] - p0[1]).toFixed(4) + ' m) settled ' + r.settled);
  ok(PH.grab(W.sim, e.off) === null, 'cannot grab a socketed end');
}
// 2. formwork with temporary posts: release records an event; the build order replays the posts and held members
{
  const d = SF.Defaults.design(); d.formworkEls = SF.Formwork.preset('posts'); const W = SF.World.create(d, SF.Defaults.params());
  W.edit((m, s) => Mo.fromFormwork(m, SF.Formwork.build(d.formworkEls), s)); PH.relax(W.sim, { budgetMs: 3000 }); W.sync();
  const posts = Array.from(W.model.rods.values()).filter((r) => r.temp).length; ok(posts > 0, posts + ' temporary posts');
  const g = W.growAll(30, 150); ok(g.placed > 10, 'grew ' + g.placed + ' sticks on the posts');
  const rel = W.edit((m, s) => Mo.release(m, s)); ok(rel.struck.length === posts, 'released ' + rel.struck.length + ' posts');
  ok(!Array.from(W.model.rods.values()).some((r) => r.temp), 'no posts left in the live design');
  const stg = Mo.stages(W.model); ok(stg.length >= 3, 'stages ' + stg.join(','));
  const before = Mo.stageModel(W.model, stg[stg.length - 2]); ok(Array.from(before.rods.values()).filter((r) => r.temp).length === posts, 'posts are back in the stage before release');
  const after = Mo.stageModel(W.model, stg[stg.length - 1]); ok(Array.from(after.rods.values()).filter((r) => r.temp).length === 0, 'and gone at the release stage');
  // replay each stage with physics
  let worst = null;
  for (const k of stg) { const s = W.seqTo(k); PH.relax(s.sim, { budgetMs: 1500 }); s.settled = PH.settled(s.sim); const q = W.seqStats(); if (!worst || q.move > worst.move) worst = q; }
  ok(worst && isFinite(worst.move), 'replayed ' + stg.length + ' stages; most movement ' + worst.move.toFixed(3) + ' m at stage ' + worst.k + ', peak util ' + worst.peak.toFixed(2));
  W.seqTo(null);
  // undo / redo
  const n = W.model.rods.size; W.undoLast(); ok(W.model.rods.size === n + posts, 'undo brings the posts back'); W.redoLast(); ok(W.model.rods.size === n, 'redo takes them out again');
}
// 3. grow near a point only
{
  const W = SF.World.create(SF.Defaults.design(), SF.Defaults.params());
  W.edit((m, s) => Mo.frame(m, { type: 'tunnel', span: 4, length: 7 }, s)); PH.relax(W.sim, { budgetMs: 3000 }); W.sync();
  const focus = { p: [0, 1.5, -1.8], r: 1.4 }; const g = W.growAll(12, 150, focus);
  const sticks = Array.from(W.model.rods.values()).filter((r) => r.kind === 'stick');
  const starts = sticks.map((r) => M.dist(r.pts[0], focus.p)); ok(g.placed > 3, 'focused growth placed ' + g.placed);
  ok(starts.every((d) => d < focus.r + 0.6), 'every stick starts near the focus (max ' + Math.max(...starts).toFixed(2) + ' m)');
}
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exitCode = fails ? 1 : 0;
