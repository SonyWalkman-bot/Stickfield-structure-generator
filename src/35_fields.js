/* Weavefield — the stick families' vector fields (from Stickfield). Each family follows a flow derived from the frame
   members (bridge between them, wrap round them, run along them, rise, swirl, reach out); painted strokes bend it.
   The grid is only baked when something is painted; growth reads the exact flow plus any painted change. */
SF.Fields = (function () {
  'use strict';
  const Fd = SF.Field, FWm = SF.Formwork, M = SF.M;
  function gridForFW(FW, reach) {
    const h0 = 0.4, m = Math.max(1.6, reach + 1.2);
    const snap = (v, dn) => (dn ? Math.floor(v / h0) : Math.ceil(v / h0)) * h0;
    const min = [snap(FW.lo[0] - m, true), 0, snap(FW.lo[2] - m, true)], max = [snap(FW.hi[0] + m), snap(Math.max(3.2, FW.top + reach + 0.8)), snap(FW.hi[2] + m)];
    let h = h0; const n = (hh) => ((max[0] - min[0]) / hh + 1) * ((max[1] - min[1]) / hh + 1) * ((max[2] - min[2]) / hh + 1);
    while (n(h) > 90000) h += 0.1;
    return Fd.makeGrid(min, max, h);
  }
  function create() {
    const E = { design: null, P: null, FW: null, grid: null, fields: {}, base: {}, channels: {}, baked: false, key: '' };
    const fams = () => (E.design ? E.design.families : []);
    E.load = function (design, P, FW) {
      E.design = design; E.P = P; E.FW = FW; E.grid = gridForFW(FW, P.grow.reach); E.baked = false; E.fields = {}; E.base = {}; E.deltas = {};
      E.channels = {}; for (const ch of Fd.CHANNELS) E.channels[ch.id] = null; // constant until painted
      if (design.strokes.length || design.scalarStrokes.length) E.bake();
    };
    // bake every family's flow on the grid and replay painted strokes (only needed once something is painted)
    E.bake = function () {
      const cache = new Map();
      for (const f of fams()) { let B = cache.get(f.preset); if (!B) { B = Fd.bakeFn(E.grid, (x, y, z, o) => FWm.flow(E.FW, f.preset, x, y, z, o)); cache.set(f.preset, B); } E.base[f.id] = B; E.fields[f.id] = B.slice(); }
      for (const ch of Fd.CHANNELS) E.channels[ch.id] = new Float32Array(E.grid.N).fill(ch.def);
      E.baked = true; for (const st of E.design.strokes) E.applyStroke(st); for (const st of E.design.scalarStrokes) E.applyScalarStroke(st); E.deltas = {};
    };
    E.targets = function (target) { const all = fams().map((f) => f.id); if (!target || target === 'all' || target === 'arches') return all; return all.includes(target) ? [target] : []; };
    E.dab = (a, st) => ({ p: [a[0], a[1], a[2]], d: [a[3], a[4], a[5]], a: [a[6], a[7], a[8]], inv: !!a[9], r: st.r, s: st.s });
    E.applyStroke = function (st, from) {
      if (!E.baked) E.bake(); const ids = E.targets(st.target); const Fs = ids.map((id) => E.fields[id]), Bs = ids.map((id) => E.base[id]);
      for (let i = from || 0; i < st.dabs.length; i++) for (const dd of Fd.expandSymmetry(E.dab(st.dabs[i], st), st.sym, E.FW.pseudoTri)) Fd.applyDabMulti(E.grid, Fs, Bs, dd, st.tool);
      E.deltas = {};
    };
    E.applyScalarStroke = function (st, from) {
      if (!E.baked) E.bake(); const S = E.channels[st.channel]; if (!S) return;
      for (let i = from || 0; i < st.dabs.length; i++) {
        const a = st.dabs[i]; const base = { p: [a[0], a[1], a[2]], d: [1, 0, 0], a: [0, 0, 1], r: st.r, s: st.s };
        for (const dd of Fd.expandSymmetry(base, st.sym, E.FW.pseudoTri)) Fd.applyScalarDab(E.grid, S, dd, a[3] ? (st.mode === 'add' ? 'sub' : st.mode === 'sub' ? 'add' : st.mode) : st.mode, st.value);
      }
    };
    function deltaFor(id) {
      if (!E.baked) return null; if (E.deltas[id] !== undefined) return E.deltas[id];
      const G = E.fields[id], B = E.base[id]; let D = null;
      if (G && B) for (let i = 0; i < G.length; i++) { const v = G[i] - B[i]; if (v > 1e-5 || v < -1e-5) { if (!D) D = new Float32Array(G.length); D[i] = v; } }
      E.deltas[id] = D; return D;
    }
    // flow direction for a family at a point (exact base flow + painted change)
    E.sampler = function (id) {
      const f = fams().find((q) => q.id === id); if (!f) return null; const FW = E.FW, grid = E.grid; const tmp = [0, 0, 0];
      if (f.preset === 'none') return E.baked ? (x, y, z, out) => Fd.sampleVec(grid, E.fields[id], x, y, z, out) : null;
      const D = deltaFor(id);
      if (!D) return (x, y, z, out) => { FWm.flow(FW, f.preset, x, y, z, out); return out; };
      return (x, y, z, out) => { FWm.flow(FW, f.preset, x, y, z, out); Fd.sampleVec(grid, D, x, y, z, tmp); out[0] += tmp[0]; out[1] += tmp[1]; out[2] += tmp[2]; return out; };
    };
    E.scalar = function (ch, x, y, z) { const S = E.channels[ch]; if (!S) { const c = Fd.CHANNELS.find((q) => q.id === ch); return c ? c.def : 0; } return Fd.sampleScalar(E.grid, S, x, y, z); };
    return E;
  }
  // the frame that drives the flows: Stickfield formwork elements plus every member placed by hand (as drawn curves)
  function frameFW(design, model) {
    // formwork elements count while their members stand (a deleted hoop no longer shapes the flow or keeps an opening)
    const live = new Set(); let untracked = false;
    for (const r of model.rods.values()) { if (r.fw == null) continue; if (r.fwId) live.add(r.fwId); else untracked = true; }
    const els = (design.formworkEls || []).filter((el) => untracked || live.has(el.id));
    for (const r of model.rods.values()) {
      if (r.kind === 'stick' || r.fw != null) continue;
      const pts = r.closed ? r.pts.concat([r.pts[0]]) : r.pts; els.push({ id: 'm' + r.id, type: 'curve', pts: pts.map((p) => p.slice()) });
    }
    return FWm.build(els);
  }
  return { create, frameFW, gridForFW };
})();
