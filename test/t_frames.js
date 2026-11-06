// Growth on every starter frame and every formwork layout: sticks get placed and the result settles.
// Usage: node test/t_frames.js [count=40]
const { load, ALL } = require('./load'); const SF = load(ALL); const PH = SF.Phys, Mo = SF.Model;
const COUNT = +(process.argv[2] || 40); let fails = 0; const ok = (c, m) => { if (!c) { console.log('FAIL ' + m); fails++; } };
function report(label, W, g, t) {
  const r = PH.relax(W.sim, { budgetMs: 15000 }); W.settled = r.settled; W.sync(); const st = PH.stress(W.sim);
  const sticks = Array.from(W.model.rods.values()).filter((q) => q.kind === 'stick'); const util = sticks.map((q) => st.rodMax[W.sim.index.get(q.id).k]).sort((a, b) => a - b);
  const jf = Array.from(st.jointF).sort((a, b) => a - b); const feet = sticks.reduce((s, q) => s + (q.fix || []).length, 0);
  console.log(label.padEnd(14), 'grew', g.placed, 'in', ((Date.now() - t) / 1000).toFixed(1) + 's', 'settle', r.iterations, r.settled ? 'ok' : 'NO', 'nodes', W.sim.N, 'ties', W.sim.jointIds.length, 'sockets', feet,
    '| util p50', (util[util.length >> 1] || 0).toFixed(2), 'max', (util[util.length - 1] || 0).toFixed(2), '| tie p99', (jf[Math.floor(jf.length * 0.99)] || 0).toFixed(0), 'max', (jf[jf.length - 1] || 0).toFixed(0), 'rej', JSON.stringify(g.rej));
  ok(g.placed >= 0.6 * COUNT, label + ': only ' + g.placed + ' of ' + COUNT + ' sticks placed'); ok(r.settled, label + ': did not settle');
}
for (const type of ['cross', 'dome', 'tunnel', 'tripod']) {
  const W = SF.World.create(SF.Defaults.design(), SF.Defaults.params());
  W.edit((m, s) => Mo.frame(m, { type, span: type === 'tunnel' ? 4 : 5, length: 8, profile: 'frame' }, s)); PH.relax(W.sim, { budgetMs: 5000 }); W.sync();
  const t = Date.now(); const g = W.growAll(COUNT, 200); report('frame ' + type, W, g, t);
}
for (const id of SF.Formwork.PRESETS.map((p) => p.id)) {
  const d = SF.Defaults.design(); d.formworkEls = SF.Formwork.preset(id); const W = SF.World.create(d, SF.Defaults.params());
  W.edit((m, s) => Mo.fromFormwork(m, SF.Formwork.build(d.formworkEls), s)); PH.relax(W.sim, { budgetMs: 5000 }); W.sync();
  const t = Date.now(); const g = W.growAll(COUNT, 200); report('formwork ' + id, W, g, t);
}
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exitCode = fails ? 1 : 0;
