// Growth benchmark: grows N sticks on each formwork layout and starter frame and prints time and stress figures.
// Usage: node bench/scenes.js [count=150] [batch=8]
const { load, ALL } = require('../test/load'); const SF = load(ALL); const PH = SF.Phys, Mo = SF.Model;
const N = +(process.argv[2] || 150), batch = +(process.argv[3] || 6);
function report(label, W, g, t) {
  const r = PH.relax(W.sim, { budgetMs: 15000 }); W.settled = r.settled; W.sync(); const S = SF.Checks.summary(W);
  console.log(label.padEnd(16), 'grew', String(g.placed).padStart(3), 'in', ((Date.now() - t) / 1000).toFixed(1) + 's', g.batches, 'batches; settle', r.iterations, r.settled ? 'ok' : 'NO', '| peak', S.peak.toFixed(2), 'tie', S.maxTie.toFixed(0), 'over', S.overTies, '| lying', SF.Checks.lying(W).length, '| rod', S.length.toFixed(0), 'm');
}
for (const id of ['grotto', 'nest', 'twin', 'tunnel']) {
  const P = SF.Defaults.params(); P.grow.batch = batch; const d = SF.Defaults.design(); d.formworkEls = SF.Formwork.preset(id); const W = SF.World.create(d, P);
  W.edit((m, s) => Mo.fromFormwork(m, SF.Formwork.build(d.formworkEls), s)); PH.relax(W.sim, { budgetMs: 5000 }); W.sync();
  const t = Date.now(); const g = W.growAll(N, 250); report('formwork ' + id, W, g, t);
}
for (const type of ['dome', 'tunnel']) {
  const P = SF.Defaults.params(); P.grow.batch = batch; const W = SF.World.create(SF.Defaults.design(), P);
  W.edit((m, s) => Mo.frame(m, { type, span: 5, length: 8, count: type === 'dome' ? 3 : 4, spacing: 2.1 }, s)); PH.relax(W.sim, { budgetMs: 5000 }); W.sync();
  const t = Date.now(); const g = W.growAll(N, 250); report('frame ' + type, W, g, t);
}
