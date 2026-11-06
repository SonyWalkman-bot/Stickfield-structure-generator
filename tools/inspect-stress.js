// Where is a design stressed? Settles a saved design and lists the most stressed rods, then details one rod.
// Usage: node tools/inspect-stress.js <design.weavefield.json> [rodId]
const { load, ALL } = require('../test/load'); const SF = load(ALL); const PH = SF.Phys, Mo = SF.Model, M = SF.M;
const o = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
const P = SF.Defaults.params(); Object.assign(P.material, o.params.material);
const W = SF.World.create(o.design, P, o.model); W.rebuild(true); const r = PH.relax(W.sim, { budgetMs: 8000 }); W.settled = r.settled; W.sync();
const st = PH.stress(W.sim); const sim = W.sim;
const rows = sim.rods.map((rod, k) => ({ id: rod.id, kind: rod.kind, prof: rod.profile || 'stick', u: st.rodMax[k], form: st.rodForm[k], load: st.rodLoad[k], k0: !!rod.k0, lash: W.model.joints.filter((j) => j.a === rod.id || j.b === rod.id).length, fix: (rod.fix || []).length, minY: Math.min(...rod.pts.map((p) => p[1])) })).filter((q) => q.kind !== 'pole').sort((a, b) => b.u - a.u).slice(0, 8);
for (const q of rows) console.log(q.id.padEnd(5), q.kind.padEnd(6), q.prof.padEnd(6), 'util', q.u.toFixed(2), 'form', q.form.toFixed(1), 'load', q.load.toFixed(1), 'lashings', q.lash, 'sockets', q.fix, 'minY', q.minY.toFixed(2));
// where along the worst rod is the peak, and what is near it
const w = rows[0]; const k = sim.index.get(w.id).k; const e = sim.index.get(w.id); let s0 = 0; for (let i = 0; i < k; i++) s0 += sim.rods[i].closed ? sim.rods[i].pts.length : sim.rods[i].pts.length - 1;
const ns = sim.rods[k].closed ? e.n : e.n - 1; const seg = Array.from({ length: ns }, (_, i) => st.segUtil[s0 + i].toFixed(2)); console.log('segments of', w.id, seg.join(' '));
const kap = Array.from({ length: e.n }, (_, i) => st.kappa[e.off + i].toFixed(2)); console.log('curvature', kap.join(' '));
const js = W.model.joints.filter((j) => j.a === w.id || j.b === w.id).map((j) => (j.a === w.id ? 'node ' + j.ia + (j.ta ? '+' + j.ta : '') : 'node ' + j.ib + (j.tb ? '+' + j.tb : '')) + ' to ' + (j.a === w.id ? j.b : j.a)); console.log('lashings at', js.join(', '));
{
  const id = process.argv[3] || 'r5'; const e = sim.index.get(id); const rod = sim.rods[e.k];
  const st2 = PH.stress(sim);
  console.log(id, 'k0', rod.k0 ? rod.k0.join(' ') : 'none');
  console.log('kap ', Array.from({ length: e.n }, (_, i) => (st2.kappa[e.off + i] * 1000).toFixed(0)).join(' '));
  console.log('kap0', Array.from({ length: e.n }, (_, i) => (st2.kappa0[e.off + i] * 1000).toFixed(0)).join(' '));
  console.log('rest len', rod.rest ? rod.rest.length : 'none', 'pts', rod.pts.length, 'steam', sim.rodP[e.k].steam, 'pre entry', sim.pre.some((p) => p.k === e.k));
}
