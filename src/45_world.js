/* Weavefield — the live world: the design, its running simulation, edits (each a stage), undo/redo, growth in batches
   with the structure relaxing in between (so every batch grows on the structure as it now stands), and the build order
   replayed with physics: the structure as it stands after any stage, relaxed under its own weight. */
SF.World = (function () {
  'use strict';
  const M = SF.M, Mo = SF.Model, PH = SF.Phys;
  function create(design, P, modelJSON) {
    const W = { design, P, model: Mo.fromJSON(modelJSON, P.material), sim: null, settled: false, fields: SF.Fields.create(), FW: null, fwDirty: true,
      grow: null, uses: new Map(), undo: [], redo: [], lastSlip: [], lastSync: 0, seq: null, slipOn: true };
    W.rebuild = function (cold) { W.sim = PH.build(W.model, cold ? null : PH.warmFrom(W.sim)); W.settled = false; W.sim.t0 = Date.now(); };
    // relax for about ms milliseconds (or until settled); returns true once settled
    W.step = function (ms) {
      if (!W.sim) W.rebuild(); if (W.settled || !W.sim.N) { W.settled = true; return true; }
      const t0 = performance.now(); do { PH.iterate(W.sim, 20); if (PH.settled(W.sim)) { W.settled = true; break; } } while (performance.now() - t0 < ms);
      return W.settled;
    };
    // write the relaxed shape back into the design (and the curvature each rod was placed with, once it first settles)
    W.sync = function () {
      if (!W.sim) return 0; let n = 0; const st = W.settled ? PH.stress(W.sim) : null;
      for (const r of W.model.rods.values()) {
        const e = W.sim.index.get(r.id); if (!e || e.n !== r.pts.length) continue; let mx = 0; const X = W.sim.X;
        for (let i = 0; i < e.n; i++) { const o = 3 * (e.off + i); mx = Math.max(mx, Math.abs(X[o] - r.pts[i][0]), Math.abs(X[o + 1] - r.pts[i][1]), Math.abs(X[o + 2] - r.pts[i][2])); }
        if (mx > 0.0015) { for (let i = 0; i < e.n; i++) { const o = 3 * (e.off + i); r.pts[i] = [Math.round(X[o] * 1000) / 1000, Math.round(X[o + 1] * 1000) / 1000, Math.round(X[o + 2] * 1000) / 1000]; } n++; }
        if (st && !r.k0) r.k0 = Array.from(st.kappa.subarray(e.off, e.off + e.n), (k) => Math.round(k * 1000));
      }
      // lashings tied in this simulation remember their grip once it has settled
      if (W.settled && W.sim.br.length) {
        const sim = W.sim, br = sim.br; const byId = new Map(W.model.joints.map((j) => [j.id, j])); const acc = new Map();
        for (let q = 0, b = 0; q < br.length; q += 4, b++) { const ji = sim.brJ[b]; let a = acc.get(ji); if (!a) acc.set(ji, a = []); a.push(Math.round(br[q + 2] * 1000) / 1000); }
        for (const [ji, arr] of acc) { const j = byId.get(sim.jointIds[ji]); if (j && !j.grip) j.grip = arr; }
      }
      W.lastSync = Date.now(); return n;
    };
    // lashings carrying more than slip_factor x their capacity come undone
    W.overSlip = function () { if (!W.sim) return []; const sf = W.P.material.slip_factor || 3; const out = []; W.sim.jointIds.forEach((id, j) => { if (W.sim.jointF[j] > sf * W.sim.jointCap[j]) out.push(id); }); return out; };
    W.slip = function () {
      const out = new Set(W.overSlip());
      if (out.size) { W.model.joints = W.model.joints.filter((j) => !out.has(j.id)); W.rebuild(); }
      W.lastSlip = Array.from(out); return W.lastSlip;
    };
    W.snapshot = function () { return { model: Mo.toJSON(Mo.clone(W.model)), design: JSON.parse(JSON.stringify(W.design)) }; };
    W.pushUndo = function () { W.sync(); W.undo.push(W.snapshot()); if (W.undo.length > 40) W.undo.shift(); W.redo.length = 0; };
    W.restore = function (snap) { W.model = Mo.fromJSON(JSON.parse(JSON.stringify(snap.model)), W.P.material); if (snap.design) Object.assign(W.design, JSON.parse(JSON.stringify(snap.design))); W.fwDirty = true; W.seq = null; W.rebuild(true); };
    W.undoLast = function () { const s = W.undo.pop(); if (!s) return false; W.grow = null; W.sync(); W.redo.push(W.snapshot()); W.restore(s); return true; };
    W.redoLast = function () { const s = W.redo.pop(); if (!s) return false; W.grow = null; W.sync(); W.undo.push(W.snapshot()); W.restore(s); return true; };
    // an edit: fn(model, stage) adds to the design; members changing re-derive the flows
    W.edit = function (fn, opts) {
      opts = opts || {}; if (!opts.noUndo) W.pushUndo(); else W.sync();
      const stage = Mo.nextStage(W.model); let out;
      try { out = fn(W.model, stage); } catch (e) { W.model.meta.stage -= 1; const s = opts.noUndo ? null : W.undo.pop(); if (s) W.restore(s); throw e; }
      if (opts.members !== false) W.fwDirty = true; W.seq = null; W.rebuild(); return out;
    };
    W.frame = function () {
      if (W.fwDirty || !W.FW) { W.FW = SF.Fields.frameFW(W.design, W.model); W.fields.load(W.design, W.P, W.FW); W.fwDirty = false; }
      return W.FW;
    };
    // ---- growth in batches ----
    W.startGrow = function (count, focus) { W.pushUndo(); W.frame(); W.seq = null; W.grow = { remaining: Math.max(1, count), count: Math.max(1, count), placed: 0, batches: 0, t: 0, tries: 0, rej: {}, done: false, focus: focus || null, startStage: W.model.meta.stage + 1, t0: Date.now() }; };
    W.stopGrow = function () { if (W.grow) W.grow.done = true; };
    // call every frame while growing: places the next batch once the last one has (mostly) settled
    W.growTick = function (force) {
      const g = W.grow; if (!g || g.done) return null;
      const settleMs = W.P.grow.settle == null ? 700 : W.P.grow.settle;
      if (!force && !W.settled && Date.now() - (W.sim ? W.sim.t0 : 0) < settleMs) return null;
      W.sync(); if (W.slipOn) W.slip(); W.frame();
      const st = SF.Grow.setup(W.model, W.fields, W.FW, W.P, { uses: W.uses, salt: g.batches + (g.focus ? 31 : 0), focus: g.focus });
      const stage = Mo.nextStage(W.model); const n = Math.min(W.P.grow.batch || 6, g.remaining);
      const res = SF.Grow.place(st, n, stage);
      g.batches++; g.tries += st.tries; for (const k in st.rej) g.rej[k] = (g.rej[k] || 0) + st.rej[k];
      g.placed += res.added.length; g.remaining -= res.added.length; g.last = res.added;
      if (!res.added.length) W.model.meta.stage -= 1; // nothing grew: no empty stage
      if (g.remaining <= 0 || res.done || !res.added.length) { g.done = true; g.why = g.remaining <= 0 ? 'count' : 'full'; }
      W.rebuild(); return res;
    };
    // run growth headless (tests): batches with a relaxation budget in between
    W.growAll = function (count, relaxMs, focus) {
      W.startGrow(count, focus); const rms = relaxMs == null ? 300 : relaxMs; let guard = 0;
      while (W.grow && !W.grow.done && guard++ < 10000) { W.growTick(true); PH.relax(W.sim, { budgetMs: rms }); W.settled = PH.settled(W.sim); }
      return W.grow;
    };
    // ---- the build order, replayed with physics ----
    // the partial structure after stage k, carrying on from the stage shown before it
    W.seqTo = function (k) {
      if (k == null) { W.seq = null; W._finalUtil = null; return null; }
      if (!W.seq) W._finalUtil = W.finalUtil();
      W.sync(); const m = Mo.stageModel(W.model, k); const prev = W.seq ? W.seq.sim : W.sim;
      const sim = PH.build(m, PH.warmFrom(prev)); sim.t0 = Date.now();
      // what was already standing before this stage, and where: adding the stage moves it by how much?
      const existed = new Set(); for (const r of sim.rods) if (prev.index.has(r.id)) existed.add(r.id);
      W.seq = { k, model: m, sim, settled: !sim.N, X0: Float64Array.from(sim.X), existed }; return W.seq;
    };
    W.seqStep = function (ms) {
      const s = W.seq; if (!s || s.settled) return true; const t0 = performance.now();
      do { PH.iterate(s.sim, 20); if (PH.settled(s.sim)) { s.settled = true; break; } } while (performance.now() - t0 < ms);
      return s.settled;
    };
    // how the partial structure stands. What matters while building: parts hanging lower than they will in the finished
    // structure (drop; springing up because later weight is not on yet is harmless), parts falling, lashings slipping,
    // and rods stressed past their strength only during the build (worse than in the finished design)
    W.finalUtil = function () { const out = new Map(); if (!W.sim) return out; const st = PH.stress(W.sim); W.sim.rods.forEach((r, k) => out.set(r.id, st.rodMax[k])); return out; };
    W.seqStats = function (s, ref) {
      s = s || W.seq; if (!s) return null; const sim = s.sim; const st = PH.stress(sim); let move = 0, drop = 0, dropRod = null, fallen = 0;
      sim.rods.forEach((r) => {
        const e = sim.index.get(r.id); let mx = 0, dn = 0; const was = s.existed && s.existed.has(r.id);
        for (let i = 0; i < e.n; i++) {
          const o = 3 * (e.off + i); const d = Math.hypot(sim.X[o] - r.pts[i][0], sim.X[o + 1] - r.pts[i][1], sim.X[o + 2] - r.pts[i][2]); if (d > mx) mx = d; // from the finished shape
          if (was) { const dy = s.X0[o + 1] - sim.X[o + 1]; if (dy > dn) dn = dy; } // how far it sank when this stage went in
        }
        if (mx > move) move = mx; if (dn > drop) { drop = dn; dropRod = r.id; } if (dn > 0.5) fallen++;
      });
      const fin = ref || W._finalUtil || (W._finalUtil = W.finalUtil());
      let peak = 0, peakRod = null, buildOver = 0, buildRod = null;
      sim.rods.forEach((r, k) => { if (r.kind === 'pole') return; const u = st.rodMax[k]; if (u > peak) { peak = u; peakRod = r.id; } const uf = fin.get(r.id); if (u > 1 && u > (uf == null ? 0 : uf) * 1.2 + 0.05) { buildOver++; if (!buildRod || u > st.rodMax[sim.index.get(buildRod).k]) buildRod = r.id; } });
      let tie = 0, slips = 0; const sf = W.P.material.slip_factor || 3; sim.jointF.forEach((f, j) => { if (f > tie) tie = f; if (f > sf * sim.jointCap[j]) slips++; });
      return { k: s.k, rods: sim.rods.length, move, drop, dropRod, fallen, peak, peakRod, buildOver, buildRod, tie, slips, settled: s.settled, stress: st };
    };
    return W;
  }
  return { create };
})();
