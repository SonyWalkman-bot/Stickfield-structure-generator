// Regenerates test/fixtures/grotto-grown.weavefield.json: the grotto formwork placed as members with 150 sticks grown on it,
// settled, saved in the same format as Files → Design file. The browser tests start from it.
const { load, ALL } = require('./load'); const SF = load(ALL); const PH = SF.Phys, Mo = SF.Model;
const fs = require('fs'); const path = require('path');
const P = SF.Defaults.params(); P.material.ground_mu = 0.5; const d = SF.Defaults.design(); d.name = 'Grotto, grown'; d.formworkEls = SF.Formwork.preset('grotto');
const W = SF.World.create(d, P); W.edit((m, s) => Mo.fromFormwork(m, SF.Formwork.build(d.formworkEls), s)); PH.relax(W.sim, { budgetMs: 5000 }); W.settled = true; W.sync();
const g = W.growAll(150, 250); const r = PH.relax(W.sim, { budgetMs: 15000 }); W.settled = r.settled; W.sync();
const out = { format: 'weavefield-design/1', saved: new Date().toISOString(), name: d.name, design: d, params: P, model: Mo.toJSON(W.model) };
fs.writeFileSync(path.join(__dirname, 'fixtures', 'grotto-grown.weavefield.json'), JSON.stringify(out));
console.log('grew', g.placed, 'sticks; settled', r.settled, '; rods', W.model.rods.size, 'lashings', W.model.joints.length);
