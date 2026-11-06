/* Weavefield — the application core: state, theme and colours, the live loop (relax, grow, replay), drawing, edits,
   autosave and keyboard. Tools live in 91_tools.js, panels in 92_panels.js, the build order in 93_timeline.js and files
   in 94_files.js; they share the app object. */
(function () {
  'use strict';
  const M = SF.M, PH = SF.Phys, Mo = SF.Model, V = SF.View;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = {
    m: (v, d = 2) => (v == null || !isFinite(v) ? '—' : v.toFixed(d) + ' m'),
    cm: (v) => (v == null || !isFinite(v) ? '—' : v < 0.1 ? (v * 100).toFixed(1) + ' cm' : v < 1 ? (v * 100).toFixed(0) + ' cm' : v.toFixed(2) + ' m'),
    pct: (v, d = 0) => (v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d) + '%'),
    n: (v, d = 0) => (v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d })),
    N: (v) => (v == null || !isFinite(v) ? '—' : v >= 1000 ? (v / 1000).toFixed(2) + ' kN' : Math.round(v) + ' N'),
    kg: (v) => (v == null || !isFinite(v) ? '—' : Math.round(v / 9.81) + ' kg'),
    MPa: (v) => (v == null || !isFinite(v) ? '—' : v.toFixed(1) + ' MPa')
  };
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }

  // ---------------------------------------------------------------- state
  const app = window.WF = {
    W: null, P: null, design: null, tool: 'select', ts: {}, sel: { rods: new Set(), joints: new Set() }, hover: null,
    view: { color: 'stress', thickness: 1.5, ties: true, flow: false, flowFam: 'all', section: null, secPos: 0, secFlip: false, ortho: false, budget: 9 },
    opt: {
      arch: { profile: 'frame', bundle: 1, lenMode: 'slack', slack: 1.45, length: 8, socket: 'tangent' },
      loop: { profile: 'weave', bundle: 1, length: 5, feet: 0.4, tilt: 0 },
      hoop: { profile: 'weave', bundle: 1, length: 6, plane: 'ring', attach: 0.25 },
      rod: { profile: 'stick', bundle: 1, socket: 'pin' },
      weave: { profile: 'weave', bundle: 1, count: 6, slack: 1.25, pattern: 'parallel' },
      grow: { count: 12, r: 1.6 },
      frame: { type: 'dome', span: 5, length: 8, profile: 'frame', bundle: 1, count: 3 },
      layout: 'grotto', scatter: { count: 8, length: 6 }, join: { radius: 0.3 }
    },
    paused: false, colors: {}, lin: {}, caps: {}, seqIdx: null, play: false, sweep: null, st: null, stAt: 0, dirty: true,
    M, PH, Mo, V, $, h, esc, fmt, panelsOpen: null
  };
  const W = () => app.W;
  app.activeSim = () => (app.W.seq ? app.W.seq.sim : app.W.sim);
  app.inSeq = () => !!app.W.seq;

  // ---------------------------------------------------------------- theme and colours
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function hexRGB(hx) { hx = (hx || '#888888').replace('#', ''); if (hx.length === 3) hx = hx.split('').map((c) => c + c).join(''); const n = parseInt(hx, 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  const toLin = (c) => c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const toHex = (c) => '#' + c.map((v) => Math.round(M.clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
  const NAMES = ['paper', 'panel', 'panel-2', 'ink', 'ink-2', 'ink-3', 'rule', 'accent', 'accent-fill', 'view', 'grid', 'grid-major', 'field', 'twine', 'frame', 'stick', 'rattan', 'pole', 'pad',
    'seq0', 'seq1', 'seq2', 'seq3', 'seq4', 'seq5', 'seq6', 'c1', 'c2', 'c3', 'c4', 'ok', 'warn', 'crit', 'over'];
  function readTheme() {
    const c = {}; for (const n of NAMES) c[n] = cssVar('--' + n) || '#888888';
    const p = hexRGB(c.paper); c.dark = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2] < 0.4;
    app.colors = c; app.srgb = {}; app.lin = {}; for (const n of NAMES) { app.srgb[n] = hexRGB(c[n]); app.lin[n] = toLin(app.srgb[n]); }
    app.rampLin = Array.from({ length: 65 }, (_, i) => toLin(rampS(i / 64)));
    if (V.ready) V.setTheme({ view: c.view, grid: c.grid, gridMajor: c['grid-major'], accent: c['accent-fill'], ink: c.ink, field: c.field, twine: c.twine, pad: c.pad, dark: c.dark });
    app.dirty = true; if (app.renderLegend) app.renderLegend();
  }
  app.readTheme = readTheme; app.hexRGB = hexRGB; app.toHex = toHex; app.mix = mix;
  // sequential ramp (one hue, light to dark; flipped for dark mode by the tokens)
  const SEQ = ['seq0', 'seq1', 'seq2', 'seq3', 'seq4', 'seq5', 'seq6'];
  function rampS(t) { const s = SEQ.slice(1).map((n) => app.srgb[n]); t = M.clamp(t, 0, 1) * 5; const i = Math.min(4, Math.floor(t)); return mix(s[i], s[i + 1], t - i); }
  app.rampS = rampS;
  app.rampCSS = () => 'linear-gradient(90deg,' + SEQ.slice(1).map((n, i) => app.colors[n] + ' ' + (i / 5 * 100).toFixed(0) + '%').join(',') + ')';
  // colour modes
  const CLASSES = [['cold', 'Bent cold', 'c1'], ['soak', 'Soaked and pre-bent', 'c2'], ['straight', 'Straight offcut', 'c3'], ['steam', 'Steam-bent member', 'frame']];
  const PROFILE_COL = { frame: 'frame', stick: 'stick', weave: 'rattan', pole: 'pole' };
  app.MODES = [['stress', 'Stress'], ['load', 'From loads'], ['order', 'Build order'], ['bending', 'Bending'], ['family', 'Family'], ['timber', 'Timber']];
  app.CLASSES = CLASSES;
  const famIdx = (id) => Math.max(0, app.design.families.findIndex((f) => f.id === id));
  app.famColorName = (id) => ['c1', 'c2', 'c3', 'c4'][famIdx(id) % 4];
  // how a rod got its shape: staked pole, steam-bent member, soaked and pre-bent stick, straight offcut, or bent cold
  function rodClass(r, sp) { if (r.kind === 'pole') return 'pole'; if (r.cls) return r.cls; if (sp && sp.steam) return r.kind === 'stick' ? 'soak' : 'steam'; return 'cold'; }
  app.rodClass = rodClass;
  // per-rod base colour (linear RGB) for the categorical modes, recomputed when the simulation is rebuilt
  function rodBase(sim) {
    const out = new Array(sim.rods.length); const mode = app.view.color; let s0 = Infinity, s1 = -Infinity;
    for (const r of sim.rods) { s0 = Math.min(s0, r.stage); s1 = Math.max(s1, r.stage); }
    sim.rods.forEach((r, k) => {
      const sp = sim.rodP[k]; let c;
      if (r.kind === 'pole') c = app.srgb.pole;
      else if (mode === 'order') c = rampS(s1 > s0 ? (r.stage - s0) / (s1 - s0) : 1);
      else if (mode === 'bending') { const cl = rodClass(r, sp); c = app.srgb[(CLASSES.find((q) => q[0] === cl) || CLASSES[3])[2]]; }
      else if (mode === 'family') c = r.kind === 'stick' && r.fam ? app.srgb[app.famColorName(r.fam)] : app.srgb.frame;
      else { c = app.srgb[PROFILE_COL[sp.profile] || 'stick']; if (r.kind === 'stick') { const j = ((parseInt(r.id.slice(1), 10) * 2654435761) >>> 0) / 4294967296; c = mix(c, app.colors.dark ? [0, 0, 0] : [1, 1, 1], (j - 0.5) * 0.18 + 0.04); } }
      out[k] = toLin(c);
    });
    return out;
  }

  // ---------------------------------------------------------------- drawing
  let maps = null; // per-simulation lookups
  function mapsFor(sim) {
    if (maps && maps.sim === sim && maps.mode === app.view.color && maps.th === app.view.thickness && maps.theme === app.colors) return maps;
    const segStart = new Int32Array(sim.rods.length); let s = 0; sim.rods.forEach((r, k) => { segStart[k] = s; s += r.closed ? r.pts.length : r.pts.length - 1; });
    const radius = new Float32Array(sim.rods.length); sim.rods.forEach((r, k) => { radius[k] = Math.max(0.006, sim.rodP[k].width / 2) * app.view.thickness; });
    const jr = new Float32Array(sim.jointIds.length); for (let j = 0; j < jr.length; j++) { const a = sim.nodeRod[sim.jt[7 * j]], b = sim.nodeRod[sim.jt[7 * j + 3]]; jr[j] = Math.max(radius[a], radius[b]) * 1.3 + 0.003; }
    const kIdx = new Map(); sim.rods.forEach((r, k) => kIdx.set(r.id, k));
    const nodeSeg = new Int32Array(sim.N); sim.rods.forEach((r, k) => { const e = sim.index.get(r.id); const ns = r.closed ? e.n : e.n - 1; for (let i = 0; i < e.n; i++) nodeSeg[e.off + i] = segStart[k] + Math.min(i, ns - 1); });
    const jIdx = new Map(); sim.jointIds.forEach((id, j) => jIdx.set(id, j));
    const pole = sim.rods.map((r) => r.kind === 'pole');
    maps = { sim, mode: app.view.color, th: app.view.thickness, theme: app.colors, segStart, radius, jr, kIdx, jIdx, nodeSeg, pole, base: rodBase(sim) };
    return maps;
  }
  app.mapsFor = mapsFor;
  app.stressOf = function (sim, force) {
    if (!sim) return null; const now = performance.now();
    if (!force && app.st && app.st.sim === sim && (app.st.settledAt === sim.iterations || now - app.stAt < 140)) return app.st.v;
    const v = PH.stress(sim); app.st = { sim, v, settledAt: sim.iterations }; app.stAt = now; return v;
  };
  function draw() {
    const sim = app.activeSim(); if (!sim || !sim.N) { V.clearStructure(); return; }
    const mp = mapsFor(sim); const mode = app.view.color; const st = mode === 'stress' || mode === 'load' ? app.stressOf(sim) : null;
    const L = app.lin; const sel = app.sel; const hov = app.hover; const hovK = hov && hov.kind === 'rod' ? mp.kIdx.get(hov.rod) : -1;
    const hovJ = hov && hov.kind === 'joint' ? mp.jIdx.get(hov.id) : -1; const removing = app.tool === 'remove';
    const selK = new Set(); for (const id of sel.rods) { const k = mp.kIdx.get(id); if (k != null) selK.add(k); }
    const fbLoad = PH.profiles(sim.mat).stick.strength_mpa;
    const segCol = (s, k) => {
      if (selK.has(k)) return L.ink;
      let c;
      if (st && !mp.pole[k]) { const u = mode === 'stress' ? st.segUtil[s] : st.segLoad[s] / fbLoad; c = u > 1 ? L.over : app.rampLin[Math.round(M.clamp(u, 0, 1) * 64)]; }
      else c = mp.base[k];
      if (k === hovK) { const t = removing ? L.crit : L.ink; return mix(c, t, removing ? 0.75 : 0.35); }
      return c;
    };
    const jc = sim.jointCap; const selJ = new Set(); for (const id of sel.joints) { const j = mp.jIdx.get(id); if (j != null) selJ.add(j); }
    V.draw({
      sim, showTies: app.view.ties,
      rodRadius: (k) => mp.radius[k],
      segColor: (s, out) => { const c = segCol(s, sim.segRod[s]); out.setRGB(c[0], c[1], c[2]); },
      nodeColor: (g, out) => { const c = segCol(mp.nodeSeg[g], sim.nodeRod[g]); out.setRGB(c[0], c[1], c[2]); },
      tieVisible: (j) => selJ.has(j) || j === hovJ || sim.jointF[j] > jc[j],
      tieRadius: (j) => mp.jr[j] * (selJ.has(j) || j === hovJ ? 1.6 : 1),
      tieColor: (j, out) => { let c = sim.jointF[j] > jc[j] ? L.crit : sim.jointF[j] > 0.8 * jc[j] ? L.warn : L.twine; if (selJ.has(j)) c = L.ink; else if (j === hovJ) c = mix(c, removing ? L.crit : L.ink, 0.5); out.setRGB(c[0], c[1], c[2]); }
    });
  }
  app.draw = draw;
  app.redraw = () => { app.dirty = true; };

  // ---------------------------------------------------------------- the live loop
  let lastUI = 0, lastSettleNote = 0, lastFrame = 0, frameDt = 16;
  function onFrame() {
    const w = app.W; if (!w) return; let moved = false;
    // on a slow screen (frames far apart) the physics gets a larger share of each frame, so it keeps up
    const now0 = performance.now(); if (lastFrame) frameDt = frameDt * 0.8 + Math.min(250, now0 - lastFrame) * 0.2; lastFrame = now0;
    const budget = M.clamp(Math.max(app.view.budget, frameDt * 0.4), app.view.budget, 40);
    if (w.seq) {
      if (app.sweepTick && app.sweep && app.sweep.running) { app.sweepTick(budget); moved = true; }
      else if (!w.seq.settled && !app.paused) { w.seqStep(budget); moved = true; if (w.seq.settled) app.onSeqSettled(); }
      if (app.play && app.playTick) app.playTick();
    } else {
      if (app.sweep && app.sweep.waiting && w.settled && app.beginSweep) app.beginSweep();
      if (w.grow && !w.grow.done) { const res = w.growTick(false); if (res) { moved = true; app.onGrowBatch(res); } if (w.grow.done) app.onGrowDone(); }
      if (!app.paused && !w.settled) { w.step(w.grow && !w.grow.done ? budget + 2 : budget); moved = true; if (w.settled) onSettled(); }
      if (w.sim && w.sim.drag) { moved = true; if (app.onDragFrame) app.onDragFrame(); }
    }
    if (moved || app.dirty) { draw(); app.dirty = false; if (app.updateLabels) app.updateLabels(); }
    const now = performance.now(); if (now - lastUI > 220) { lastUI = now; updateLive(); if (moved && app.refreshLive) app.refreshLive(); }
  }
  function onSettled() {
    const w = app.W; w.sync();
    if (w.slipOn && !(w.sim && w.sim.drag) && !(w.grow && !w.grow.done)) {
      const out = w.slip(); if (out.length) { app.toast(out.length + (out.length === 1 ? ' lashing slipped: it carried' : ' lashings slipped: they carried') + ' more than ' + w.P.material.slip_factor + '× its capacity. The structure settles again without ' + (out.length === 1 ? 'it' : 'them') + '.', 5200); maps = null; return; }
    }
    const st = app.stressOf(w.sim, true); app.autosave(); if (app.refreshPanels) app.refreshPanels(); if (app.renderTimeline) app.renderTimeline();
    // the rods an edit just added: say so if they are past their strength, and why
    if (app.watchNew && !(w.grow && !w.grow.done)) {
      let worst = null; for (const id of app.watchNew.ids) { const e = w.sim.index.get(id); if (!e) continue; const u = st.rodMax[e.k]; if (!worst || u > worst.u) worst = { id, u, k: e.k }; }
      app.watchNew = null;
      if (worst && worst.u > 1) {
        const r = w.model.rods.get(worst.id); const sp = PH.sectionOf(w.model.material, r); const bent = st.rodForm[worst.k] > st.rodLoad[worst.k];
        app.toast(`${worst.id} is stressed to ${fmt.pct(worst.u)} of its strength: ` + (bent ? (sp.steam ? 'it is carrying too much load where it bends. Bundle it or add support.' : `bent too tightly for a ${sp.section_mm} mm ${sp.profile}. A thinner weaver, or a steam-bent frame member, would take the curve.`) : 'it carries too much. Bundle it, or lash it to more of the structure.'), 6500);
        app.setSel([worst.id], []);
      }
    }
    const now = Date.now(); if (now - lastSettleNote > 1000) lastSettleNote = now;
  }
  app.onSettled = onSettled;
  function updateLive() {
    const w = app.W; const el = $('#live'); if (!el || !w.sim) return; let state, text, it = '';
    if (w.seq) { state = 'sequence'; text = 'Build order'; it = 'stage ' + w.seq.k + ' · ' + (w.seq.settled ? 'settled' : 'relaxing'); }
    else if (w.grow && !w.grow.done) { state = 'growing'; text = 'Growing ' + w.grow.placed + ' / ' + w.grow.count; it = fmt.n(w.sim.iterations) + ' it'; }
    else if (app.paused && !w.settled) { state = 'paused'; text = 'Paused'; it = 'residual ' + w.sim.residual.toExponential(1); }
    else if (!w.settled) { state = 'relaxing'; text = 'Relaxing'; it = fmt.n(w.sim.iterations) + ' it'; }
    else { state = 'settled'; text = 'Settled'; it = fmt.n(w.sim.iterations) + ' it'; }
    if (el.dataset.state !== state) el.dataset.state = state; const t = $('#liveText'); if (t.textContent !== text) t.textContent = text; const i = $('#liveIt'); if (i.textContent !== it) i.textContent = it;
    const sim = app.activeSim(); const hud = $('#hud'); if (hud && sim) hud.textContent = fmt.n(sim.N) + ' nodes · ' + fmt.n(sim.seg.length / 4) + ' segments · ' + fmt.n(sim.jointIds.length) + ' lashings\n';
    if (hud && sim) hud.append(h('div', { text: 'residual ' + (isFinite(sim.residual) ? sim.residual.toExponential(1) : '—') + ' m · ' + fmt.n(sim.iterations) + ' iterations' }));
  }
  app.updateLive = updateLive;

  // ---------------------------------------------------------------- edits
  // every change to the design goes through here: the world records undo, makes a stage and rebuilds the simulation
  app.edit = function (label, fn, opts) {
    opts = opts || {}; if (app.W.seq) app.exitSeq();
    let out;
    try { out = app.W.edit(fn, opts); } catch (e) { app.toast(e.message || String(e)); return null; }
    maps = null; app.sweep = null; app.dirty = true; app.updUndo(); app.autosave();
    { const stg = app.W.model.meta.stage; const ids = Array.from(app.W.model.rods.values()).filter((r) => r.stage === stg && r.kind !== 'pole').map((r) => r.id); app.watchNew = ids.length ? { ids, label } : null; }
    if (opts.select !== false && out) { const ids = (Array.isArray(out) ? out : [out]).filter((r) => r && r.id && app.W.model.rods.has(r.id)).map((r) => r.id); if (ids.length && opts.select) setSel(ids, []); }
    if (app.refreshPanels) app.refreshPanels(); if (app.renderTimeline) app.renderTimeline(); app.updateEmpty();
    if (app.view.flow && opts.members !== false && app.updateFlow) setTimeout(app.updateFlow, 0);
    if (label && opts.toast !== false) app.toast(label);
    return out;
  };
  app.rebuild = function () { app.W.rebuild(); maps = null; app.dirty = true; };
  app.invalidate = () => { maps = null; app.dirty = true; };
  function setSel(rods, joints) { app.sel.rods = new Set(rods || []); app.sel.joints = new Set(joints || []); app.dirty = true; if (app.renderSelection) app.renderSelection(); }
  app.setSel = setSel;
  app.clearSel = () => setSel([], []);
  app.removeSelected = function () {
    const r = Array.from(app.sel.rods), j = Array.from(app.sel.joints); if (!r.length && !j.length) return;
    app.edit((r.length ? r.length + (r.length === 1 ? ' rod' : ' rods') : '') + (r.length && j.length ? ' and ' : '') + (j.length ? j.length + (j.length === 1 ? ' lashing' : ' lashings') : '') + ' removed', (m) => Mo.remove(m, r, j));
    setSel([], []);
  };
  app.undo = function () { if (app.W.seq) app.exitSeq(); $('#growbar').hidden = true; if (app.W.undoLast()) { maps = null; app.sweep = null; app.dirty = true; app.pruneSel(); app.updUndo(); app.autosave(); app.refreshAll(); app.toast('Undone'); } };
  app.redo = function () { if (app.W.seq) app.exitSeq(); $('#growbar').hidden = true; if (app.W.redoLast()) { maps = null; app.sweep = null; app.dirty = true; app.pruneSel(); app.updUndo(); app.autosave(); app.refreshAll(); app.toast('Redone'); } };
  app.pruneSel = function () { const m = app.W.model; const js = new Set(m.joints.map((j) => j.id)); setSel(Array.from(app.sel.rods).filter((id) => m.rods.has(id)), Array.from(app.sel.joints).filter((id) => js.has(id))); };
  app.updUndo = function () { $('#undoBtn').disabled = !app.W.undo.length; $('#redoBtn').disabled = !app.W.redo.length; };
  app.refreshAll = function () { if (app.buildInspector) app.buildInspector(); if (app.renderTimeline) app.renderTimeline(); if (app.renderLegend) app.renderLegend(); app.updateEmpty(); app.updUndo(); };
  app.setPaused = function (p) {
    app.paused = !!p; const b = $('#pauseBtn'); b.setAttribute('aria-pressed', app.paused ? 'true' : 'false');
    b.innerHTML = app.paused ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7Z"/></svg><span class="wide">Run</span>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6v12M15 6v12"/></svg><span class="wide">Pause</span>';
    updateLive();
  };
  // a physics setting changed: rebuild the simulation, carrying on from where everything is
  app.physChanged = function () { app.W.model.material = app.W.P.material; app.W.rebuild(); if (app.W.seq) app.W.seqTo(app.W.seq.k); maps = null; app.sweep = null; app.dirty = true; app.autosave(); };

  // ---------------------------------------------------------------- toast, frame, empty state
  let toastT = 0;
  app.toast = function (msg, ms) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms || 2800); };
  app.bounds = function () { const sim = app.activeSim(); if (sim && sim.N) { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let g = 0; g < sim.N; g++) for (let c = 0; c < 3; c++) { const v = sim.X[3 * g + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; } lo[1] = Math.min(lo[1], 0); return { min: lo, max: hi }; } return { min: [-3, 0, -3], max: [3, 2.5, 3] }; };
  app.frameAll = () => V.frame(app.bounds());
  app.updateEmpty = function () {
    const e = $('#empty3d'); const empty = !app.W.model.rods.size && !app.W.seq; e.hidden = !empty; $('#legend').hidden = empty; if (!empty) return; if (e.dataset.built) return; e.dataset.built = '1';
    e.innerHTML = ''; e.append(h('div', { class: 'card' },
      h('h2', { text: 'Start with something to weave on' }),
      h('p', { text: 'Spring a starter frame, place a formwork layout as physical members, or pick the Arch tool and click two places on the ground.' }),
      h('div', { class: 'btns' },
        h('button', { class: 'ib primary', onclick: () => app.placeFrame && app.placeFrame({ type: 'dome' }) }, 'Dome frame'),
        h('button', { class: 'ib', onclick: () => app.placeLayout && app.placeLayout('grotto') }, 'Grotto formwork'),
        h('button', { class: 'ib', onclick: () => app.setTool && app.setTool('arch') }, 'Arch tool'))));
  };

  // ---------------------------------------------------------------- persistence
  const LS_KEY = 'weavefield.autosave.v1', LS_UI = 'weavefield.ui.v1';
  app.LS_VERS = 'weavefield.versions.v1';
  app.serialise = function () {
    const w = app.W; w.sync();
    return { format: 'weavefield-design/1', saved: new Date().toISOString(), name: app.design.name, design: app.design, params: w.P, model: Mo.toJSON(w.model) };
  };
  let saveT = 0;
  app.autosave = function () { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(app.serialise())); } catch (e) { /* storage unavailable or full */ } }, 1200); };
  app.saveUI = function () { try { localStorage.setItem(LS_UI, JSON.stringify({ view: app.view, opt: app.opt, tool: app.tool, open: app.panelsOpen })); } catch (e) { /* ignore */ } };
  function readJSON(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  // merge saved parameters over the defaults, keeping only known keys of the right type
  function mergeParams(src) {
    const P = SF.Defaults.params(); if (!src || typeof src !== 'object') return P;
    for (const g of Object.keys(P)) { const s = src[g]; if (!s || typeof s !== 'object') continue; for (const k of Object.keys(P[g])) if (s[k] != null && typeof s[k] === typeof P[g][k]) P[g][k] = s[k]; }
    if (src.material && src.material.profiles && typeof src.material.profiles === 'object') P.material.profiles = src.material.profiles;
    return P;
  }
  app.mergeParams = mergeParams;
  function mergeDesign(src) {
    const d = SF.Defaults.design(); if (!src || typeof src !== 'object') return d;
    if (typeof src.name === 'string') d.name = src.name.slice(0, 80);
    if (Array.isArray(src.families) && src.families.length) d.families = src.families.filter((f) => f && typeof f.id === 'string').slice(0, 4).map((f, i) => Object.assign({}, SF.Defaults.families()[i] || SF.Defaults.families()[0], f));
    if (Array.isArray(src.formworkEls)) d.formworkEls = SF.Formwork.sanitise ? SF.Formwork.sanitise(src.formworkEls) : src.formworkEls;
    if (Array.isArray(src.strokes)) d.strokes = src.strokes; if (Array.isArray(src.scalarStrokes)) d.scalarStrokes = src.scalarStrokes;
    return d;
  }
  // load a saved design (autosave, version or file); returns true when it held a structure
  app.loadDesign = function (obj, opts) {
    opts = opts || {}; if (!obj || obj.format !== 'weavefield-design/1') throw new Error('not a Weavefield design');
    const design = mergeDesign(Object.assign({}, obj.design, obj.name ? { name: obj.name } : {})); const P = mergeParams(obj.params);
    startWorld(design, P, obj.model); return app.W.model.rods.size > 0;
  };
  function startWorld(design, P, modelJSON) {
    if (app.W && app.W.grow) app.W.grow.done = true;
    app.design = design; app.P = P; P.material.ground_mu = (SF.Defaults.SOILS.find((q) => q.id === P.ground.soil) || SF.Defaults.SOILS[1]).mu;
    app.W = SF.World.create(design, P, modelJSON); app.W.rebuild(true);
    app.W.slipOn = app.view.slip !== false; app.sel = { rods: new Set(), joints: new Set() }; app.hover = null; app.sweep = null; app.seqIdx = null; app.play = false;
    maps = null; app.st = null; app.dirty = true; $('#designName').value = design.name;
    if (app.ts) app.ts = {}; if (V.ready) { app.frameAll(); V.setPreview([]); V.anchor(null); V.hover(null); }
    if (app.refreshAll) app.refreshAll();
  }
  app.startWorld = startWorld;
  app.newDesign = function (keepName) { startWorld(Object.assign(SF.Defaults.design(), keepName ? { name: app.design.name } : {}), app.W ? app.W.P : SF.Defaults.params(), null); app.autosave(); };

  // ---------------------------------------------------------------- capabilities
  async function initCaps() {
    const c = window.claude; if (!c || typeof c.use !== 'function') return;
    try { app.caps.downloads = await c.use('downloads'); } catch (e) { app.caps.downloads = null; }
    if (app.refreshFiles) app.refreshFiles();
  }

  // ---------------------------------------------------------------- keyboard
  function onKey(e) {
    const t = e.target; if (t && ((t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (!$('#dialog').hidden) { if (e.key === 'Escape') app.closeDialog && app.closeDialog(false); return; }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) app.redo(); else app.undo(); return; }
    if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); app.redo(); return; }
    if (mod) return;
    if (e.key === 'Escape') { if (!$('#drawer').hidden || !$('#helpModal').hidden) { app.closeDrawer && app.closeDrawer(); app.closeHelp && app.closeHelp(); return; } if (app.cancelTool && app.cancelTool()) return; if (app.W.seq) { app.exitSeq(); return; } app.clearSel(); return; }
    if (!$('#drawer').hidden || !$('#helpModal').hidden) return;
    if ((e.key === ' ' || e.key === 'Enter') && t && (t.tagName === 'BUTTON' || t.tagName === 'A' || (t.getAttribute && t.getAttribute('role') === 'button'))) return; // the focused control takes it
    if (e.key === ' ') { e.preventDefault(); app.setPaused(!app.paused); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (app.tool === 'rod' && app.ts.pts && app.ts.pts.length) { app.ts.pts.pop(); app.toolPreview && app.toolPreview(); e.preventDefault(); return; } if (app.sel.rods.size || app.sel.joints.size) { e.preventDefault(); app.removeSelected(); } return; }
    if (e.key === 'Enter') { if (app.finishTool && app.finishTool()) e.preventDefault(); return; }
    if (e.key === 'f' || e.key === 'F') { app.frameAll(); return; }
    if (e.key === 'h' || e.key === 'H' || e.key === '?') { app.openHelp && app.openHelp(); return; }
    if ('1234'.includes(e.key) && e.key.length === 1) { V.view(['persp', 'top', 'front', 'side'][+e.key - 1]); return; }
    if (e.key === '[' || e.key === ']') { app.seqStepBy && app.seqStepBy(e.key === ']' ? 1 : -1); return; }
    const tool = app.TOOL_KEYS && app.TOOL_KEYS[e.key.toLowerCase()]; if (tool) { app.setTool(tool); return; }
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    readTheme();
    const ui = readJSON(LS_UI); if (ui) { if (ui.view) Object.assign(app.view, ui.view, { section: null }); if (ui.opt) for (const k in app.opt) if (ui.opt[k] && typeof ui.opt[k] === typeof app.opt[k]) app.opt[k] = typeof app.opt[k] === 'object' ? Object.assign(app.opt[k], ui.opt[k]) : ui.opt[k]; if (ui.open) app.panelsOpen = ui.open; if (ui.tool) app.tool = ui.tool; }
    app.view.budget = M.clamp(+app.view.budget || 9, 3, 16); app.view.thickness = M.clamp(+app.view.thickness || 1.5, 1, 3);
    let loaded = false; const saved = readJSON(LS_KEY);
    if (saved) { try { app.loadDesign(saved); loaded = true; } catch (e) { loaded = false; } }
    if (!app.W) startWorld(SF.Defaults.design(), SF.Defaults.params(), null);
    try { V.init($('#viewport'), $('#gl'), app.viewCallbacks()); }
    catch (err) { // no 3D here: say why instead of failing silently
      const e = $('#empty3d'); e.hidden = false; e.dataset.built = '1'; e.innerHTML = '';
      e.append(h('div', { class: 'card' }, h('h2', { text: window.THREE ? 'This browser can’t show 3D' : 'The 3D library didn’t load' }),
        h('p', { text: window.THREE ? 'Weavefield needs WebGL. Turn on hardware acceleration in the browser’s settings, or try Chrome, Edge, Firefox or Safari.' : 'Weavefield loads three.js from the internet. Check the connection and reload, or use the offline copy (Files → Weavefield for any computer).' })));
      return;
    }
    readTheme(); app.frameAll();
    if (app.buildRail) app.buildRail(); app.refreshAll(); app.setTool(app.TOOLS[app.tool] ? app.tool : 'select', true);
    V.setOrtho(app.view.ortho); document.querySelector('[data-view="ortho"]').setAttribute('aria-pressed', app.view.ortho ? 'true' : 'false');
    if (app.view.flow && app.updateFlow) app.updateFlow();
    if (!loaded) { // first visit: the grotto formwork as members, then grow on it live
      app.placeLayout('grotto', true);
      setTimeout(() => { if (!app.W.grow) { app.startGrowth(150); app.toast('Growing 150 sticks on the grotto frame. Each batch settles under its own weight before the next grows on it. Stop it any time.', 6500); } }, 900);
    }
    // wiring
    document.addEventListener('keydown', onKey);
    $('#undoBtn').addEventListener('click', app.undo); $('#redoBtn').addEventListener('click', app.redo);
    $('#pauseBtn').addEventListener('click', () => app.setPaused(!app.paused));
    $('#designName').addEventListener('change', (e) => { app.design.name = e.target.value.trim().slice(0, 80) || 'Untitled'; e.target.value = app.design.name; app.autosave(); });
    for (const b of document.querySelectorAll('#viewbtns [data-view]')) b.addEventListener('click', () => {
      const v = b.dataset.view; if (v === 'fit') app.frameAll(); else if (v === 'ortho') { app.view.ortho = !app.view.ortho; V.setOrtho(app.view.ortho); b.setAttribute('aria-pressed', app.view.ortho ? 'true' : 'false'); app.saveUI(); } else V.view(v);
    });
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null; if (mq && mq.addEventListener) mq.addEventListener('change', readTheme);
    new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    window.addEventListener('pagehide', () => { try { localStorage.setItem(LS_KEY, JSON.stringify(app.serialise())); } catch (e) { /* ignore */ } });
    initCaps();
  }
  app.onFrame = onFrame;
  app.boot = boot;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0)); else setTimeout(boot, 0);
})();
