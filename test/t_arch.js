// Stress of a single sprung arch: a steam-bent member sits in its sockets in the shape it was bent to (almost no stress),
// and a stick bent cold into the same arch carries the bending stress E·c/R that the circle needs.
const { load, ALL } = require('./load'); const SF = load(ALL); const PH = SF.Phys, Mo = SF.Model;
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) fails++; };
const chord = 4.3, L = 6.2;
function arch(profile, gravity) {
  const P = SF.Defaults.params(); P.material.gravity = gravity; const W = SF.World.create(SF.Defaults.design(), P);
  W.edit((m, s) => Mo.addArch(m, { a: [-chord / 2, 0, 0], b: [chord / 2, 0, 0], length: L, profile }, s));
  const r = PH.relax(W.sim, { budgetMs: 6000 }); W.settled = r.settled; W.sync(); const st = PH.stress(W.sim);
  return { r, util: st.rodMax[0], form: st.rodForm[0], total: st.rodStress[0], sp: W.sim.rodP[0] };
}
// the radius of the circular arc of length L over the chord: sin(d)/d = chord/L, R = L/(2d)
let lo = 1e-6, hi = Math.PI; for (let i = 0; i < 80; i++) { const d = (lo + hi) / 2; if (Math.sin(d) / d > chord / L) lo = d; else hi = d; } const R = L / (2 * lo);
const f0 = arch('frame', 0), f1 = arch('frame', 1), s1 = arch('stick', 1);
ok(f0.r.settled && f1.r.settled && s1.r.settled, 'all three settle');
ok(f0.util < 0.1, 'steam-bent arch, no weight: ' + (f0.util * 100).toFixed(1) + '% of strength (it sits in its own shape)');
ok(f1.util < 0.15, 'steam-bent arch, own weight: ' + (f1.util * 100).toFixed(1) + '% of strength');
const expect = s1.sp.E * s1.sp.c / R / 1e6;
ok(Math.abs(s1.form / expect - 1) < 0.15, 'stick bent cold: ' + s1.form.toFixed(1) + ' MPa bending into place, circle needs E·c/R = ' + expect.toFixed(1) + ' MPa (R ' + R.toFixed(2) + ' m)');
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exitCode = fails ? 1 : 0;
