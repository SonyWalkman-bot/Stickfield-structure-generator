// Replays a saved design stage by stage with physics and prints how each stage stands (what sinks, what is overstressed only while building).
// Usage: node tools/replay-stages.js <design.weavefield.json> [strike]   (strike: take the formwork out first)
const { load, ALL } = require('../test/load'); const SF = load(ALL); const PH = SF.Phys, Mo = SF.Model, M = SF.M;
const o = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
const P = SF.Defaults.params(); for (const g of ['material', 'grow', 'ground']) Object.assign(P[g], o.params[g]);
const W = SF.World.create(o.design, P, o.model); W.rebuild(true); let r = PH.relax(W.sim, { budgetMs: 8000 }); W.settled = r.settled; W.sync();
if (process.argv[3] === 'strike') { W.edit((m, s) => Mo.release(m, s)); r = PH.relax(W.sim, { budgetMs: 10000 }); W.settled = r.settled; W.sync(); console.log('struck; settled', r.settled, r.iterations); }
const stages = Mo.stages(W.model); console.log('stages', stages.join(','));
const fin = W.finalUtil();
for (const k of stages.slice(0, -1)) {
  const s = W.seqTo(k); const rr = PH.relax(s.sim, { budgetMs: 3000 }); s.settled = PH.settled(s.sim); const q = W.seqStats(s, fin); q.off = q.move;
  const dr = q.dropRod && (W.model.rods.get(q.dropRod)); const br = q.buildRod && W.model.rods.get(q.buildRod);
  console.log('stage', String(k).padStart(2), 'rods', String(q.rods).padStart(3), 'sink', q.drop.toFixed(3), 'off', q.move.toFixed(2), q.dropRod, dr && dr.kind, dr && 'stage ' + dr.stage, dr && 'lashings ' + W.model.joints.filter((j) => j.a === dr.id || j.b === dr.id).length + ' (now ' + s.model.joints.filter((j) => j.a === dr.id || j.b === dr.id).length + ')', '| over', q.buildOver, q.buildRod, br && br.kind, '| settled', s.settled, rr.iterations);
}
