/* Weavefield — tools: the rail, the hint bar, picking, previews of what a click will add, and each tool's clicks:
   spring an arch, stand a loop, place a hoop, lay a rod, weave between rods, lash two rods, grow sticks near a point,
   push and pull the live structure by hand, remove. */
(function () {
  'use strict';
  const app = window.WF; const { M, PH, Mo, V, $, h, fmt } = app;
  const UP = [0, 1, 0];
  const ICON = {
    select: '<path d="m5 3 14 8-6 2-2 6Z"/>',
    arch: '<path d="M3.5 20C3.5 8.5 20.5 8.5 20.5 20"/><path d="M1.5 20h4M18.5 20h4"/>',
    loop: '<path d="M9.5 20C5 14 5.5 5 12 4.5S19 14 14.5 20"/><path d="M6.5 20h11"/>',
    hoop: '<ellipse cx="12" cy="11" rx="8" ry="4.2"/><path d="M4 11v2.5c0 2.3 3.6 4.2 8 4.2s8-1.9 8-4.2V11" opacity=".5"/>',
    rod: '<path d="M3 18c4-1 6-9 10-9s5 5 8 4"/><circle cx="3" cy="18" r="1.5"/><circle cx="13" cy="9" r="1.5"/><circle cx="21" cy="13" r="1.5"/>',
    weave: '<path d="M3 20C3 11 10 6 10 4M21 20c0-9-7-14-7-16"/><path d="M4.5 14.5c3 2 12 2 15 0M6.5 10c3 1.6 8 1.6 11 0"/>',
    lash: '<path d="M4 19 20 5M4 5l16 14"/><path d="M9.5 9.8c1.4 1.6 3.6 1.6 5 0M9.5 14.2c1.4-1.6 3.6-1.6 5 0"/>',
    grow: '<path d="M12 21v-8"/><path d="M12 13C12 8 8.5 5.5 4 5.5c0 4.2 3.2 7.5 8 7.5Z"/><path d="M12 15c0-4 3-6.5 7.5-6.5 0 3.5-3 6.5-7.5 6.5Z"/>',
    pull: '<path d="M3 18c5-2 7-8 9-8s4 6 9 8"/><path d="M12 10V3M9 5.5 12 3l3 2.5"/>',
    remove: '<path d="M4.5 7h15M10 7V4.8h4V7M6.8 7l1 13h8.4l1-13"/><path d="M10.2 11v5.5M13.8 11v5.5"/>'
  };
  app.ICON = ICON;
  const svgI = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
  app.svgI = svgI;
  const TOOLS = app.TOOLS = {
    select: { label: 'Select', key: 'V', icon: 'select', tip: 'Inspect rods and lashings', steps: ['Click a rod or a lashing to inspect it. Shift-click adds to the selection; Delete removes it.'] },
    arch: { label: 'Arch', key: 'A', icon: 'arch', tip: 'Spring a rod into an arch between two places', steps: ['Click where the arch starts: a point on a rod, or the ground', 'Click where it ends: the rod springs into an arch between them'] },
    loop: { label: 'Loop', key: 'L', icon: 'loop', tip: 'Stand a loop on a rod or the ground', steps: ['Click a rod or the ground to stand a loop there'] },
    hoop: { label: 'Hoop', key: 'O', icon: 'hoop', tip: 'Place a hoop: a ring round a point, or standing on the ground', steps: ['Click a rod to ring it with a hoop, or the ground to stand one there. It is lashed wherever it meets rods'] },
    rod: { label: 'Lay a rod', key: 'R', icon: 'rod', tip: 'Lay a rod along a path; it is lashed where it passes over rods', steps: ['Click where the rod starts', 'Click points along its path; double-click or press Enter to finish'] },
    weave: { label: 'Weave', key: 'W', icon: 'weave', tip: 'Weave a run of rods between two rods', steps: ['Click the first rod', 'Click a second rod: weavers spring across between them'] },
    lash: { label: 'Lash', key: 'J', icon: 'lash', tip: 'Lash two rods together where you click', steps: ['Click a point on a rod', 'Click a point on another rod to lash them together'] },
    grow: { label: 'Grow here', key: 'G', icon: 'grow', tip: 'Grow sticks on the structure near a point', steps: ['Click the structure to grow sticks around that point (the families and settings in Grow apply)'] },
    pull: { label: 'Push & pull', key: 'P', icon: 'pull', tip: 'Drag any free point: the structure follows and you feel the force', steps: ['Drag any free point of a rod. Let go and it springs back; lashings over their slip load come undone'] },
    remove: { label: 'Remove', key: 'X', icon: 'remove', tip: 'Remove a rod or a lashing', steps: ['Click a rod or a lashing to remove it'] }
  };
  app.TOOL_KEYS = {}; for (const id in TOOLS) app.TOOL_KEYS[TOOLS[id].key.toLowerCase()] = id;
  const RAIL = ['select', '|', 'arch', 'loop', 'hoop', 'rod', 'weave', 'lash', '|', 'grow', 'pull', '|', 'remove'];
  const EDITS = new Set(['arch', 'loop', 'hoop', 'rod', 'weave', 'lash', 'grow', 'pull', 'remove']);

  // ---------------------------------------------------------------- rail and hint bar
  app.buildRail = function () {
    const rail = $('#rail'); rail.innerHTML = ''; const tip = $('#tip');
    for (const id of RAIL) {
      if (id === '|') { rail.append(h('div', { class: 'sep' })); continue; }
      const T = TOOLS[id];
      const b = h('button', { class: 'tool', 'data-tool': id, 'aria-label': T.label + ' (' + T.key + ')', 'aria-pressed': app.tool === id ? 'true' : 'false', html: svgI(T.icon) + `<span class="k">${T.key}</span>`, onclick: () => app.setTool(id) });
      b.addEventListener('pointerenter', () => { const r = b.getBoundingClientRect(); tip.innerHTML = `<b>${T.label}</b><span class="tk">${T.key}</span><br>${T.tip}`; tip.hidden = false; const tr = tip.getBoundingClientRect();
        let x = r.right + 8, y = r.top + r.height / 2 - tr.height / 2; if (x + tr.width > innerWidth - 8) { x = Math.max(8, r.left); y = r.bottom + 8; } tip.style.left = x + 'px'; tip.style.top = Math.max(8, y) + 'px'; });
      b.addEventListener('pointerleave', () => { tip.hidden = true; }); b.addEventListener('click', () => { tip.hidden = true; });
      rail.append(b);
    }
    app.updateRail();
  };
  app.updateRail = function () { const seq = app.inSeq(); for (const b of document.querySelectorAll('#rail .tool')) { b.setAttribute('aria-pressed', b.dataset.tool === app.tool ? 'true' : 'false'); b.disabled = seq && EDITS.has(b.dataset.tool); } };
  app.setTool = function (id, quiet) {
    if (!TOOLS[id]) id = 'select'; if (app.inSeq() && EDITS.has(id)) { app.toast('Showing the build order: go back to the live design to edit (Esc)'); return; }
    if (app.ts.drag) pullEnd(); app.tool = id; app.ts = {}; clearPreview(); app.updateRail(); renderHint();
    if (app.renderToolPanel) app.renderToolPanel(); if (!quiet) app.saveUI(); app.dirty = true;
  };
  function renderHint() {
    const el = $('#toolhint'); el.innerHTML = '';
    el.hidden = app.inSeq(); if (app.inSeq()) return; // the build-order banner says what is shown
    const T = TOOLS[app.tool]; const step = app.ts.a || (app.ts.pts && app.ts.pts.length) ? 1 : 0; const txt = T.steps[Math.min(step, T.steps.length - 1)];
    el.append(h('span', { class: 'tn', text: T.label }), h('span', { text: txt }));
    if (app.ts.info && app.hoverPick) el.append(h('span', { class: 'step', text: app.ts.info }));
    else if (T.steps.length > 1) el.append(h('span', { class: 'step', text: (step + 1) + '/' + T.steps.length }));
    if (app.tool === 'rod' && app.ts.pts && app.ts.pts.length >= 2) el.append(h('button', { class: 'ib', onclick: () => finishRod() }, 'Finish'));
    if (step) el.append(h('button', { class: 'ib', onclick: () => app.cancelTool() }, 'Cancel'));
  }
  app.renderHint = renderHint;
  app.cancelTool = function () { if (app.ts.a || (app.ts.pts && app.ts.pts.length)) { app.ts = {}; clearPreview(); renderHint(); app.toolPreview(); return true; } return false; };
  app.finishTool = function () { if (app.tool === 'rod' && app.ts.pts && app.ts.pts.length >= 2) { finishRod(); return true; } return false; };
  function clearPreview() { V.setPreview([]); V.setMarks([]); V.anchor(null); V.hover(null); V.brush(null); }

  // ---------------------------------------------------------------- picking
  function keepFn() {
    const s = app.view.section; if (!s) return null; const pos = app.view.secPos, flip = app.view.secFlip;
    return (x, y, z) => { const v = s === 'x' ? x : s === 'y' ? y : z; return flip ? v >= pos : v <= pos; };
  }
  function pickFor(tool, e) {
    const sim = app.activeSim(); const pk = V.pick(e, sim, { joints: tool === 'select' || tool === 'remove', keep: keepFn() });
    if (!pk) return null;
    if ((tool === 'lash' || tool === 'weave' || tool === 'pull' || tool === 'remove') && pk.kind === 'ground') return null;
    if (pk.kind === 'rod' && sim) { const k = sim.index.get(pk.rod); if (k && sim.rods[k.k].kind === 'pole' && (tool === 'weave' || tool === 'pull')) return null; }
    return pk;
  }
  const spec = (pk) => (pk.kind === 'rod' ? { rod: pk.rod, i: pk.i } : pk.p.slice());
  const same = (a, b) => a && b && a.kind === b.kind && (a.kind === 'rod' ? a.rod === b.rod && Math.abs(a.i - b.i) <= 1 : M.dist(a.p, b.p) < 0.3);
  function horizView() { const d = V.viewDir(); const v = [d[0], 0, d[2]]; return M.len(v) > 1e-3 ? M.norm(v) : [0, 0, -1]; }
  function camRight() { return M.norm(M.cross(horizView(), UP)); }

  // ---------------------------------------------------------------- what each tool would add
  function archLen(a, b) { const o = app.opt.arch; const c = M.dist(a, b); return o.lenMode === 'slack' ? Math.max(0.6, c * o.slack) : Math.max(o.length, c * 1.02); }
  function loopOpts(pk) {
    const o = app.opt.loop; let side = camRight();
    if (pk.kind === 'rod') { const r = app.W.model.rods.get(pk.rod); if (r) { const t = Mo.tangentAt(r, Math.min(pk.i, r.pts.length - 1)); if (Math.hypot(t[0], t[2]) > 0.25) side = M.norm([t[0], 0, t[2]]); } }
    return { at: spec(pk), length: o.length, feet: o.feet, tilt: o.tilt, side, profile: o.profile, bundle: o.bundle };
  }
  // the axis of the members (their centre in plan): a ring round the structure is centred on it
  function memberAxis() { let x = 0, z = 0, n = 0; for (const r of app.W.model.rods.values()) { if (r.kind === 'stick' || r.kind === 'pole') continue; for (const p of r.pts) { x += p[0]; z += p[2]; n++; } } if (!n) for (const r of app.W.model.rods.values()) for (const p of r.pts) { x += p[0]; z += p[2]; n++; } return n ? [x / n, z / n] : [0, 0]; }
  function hoopOpts(pk) {
    const o = app.opt.hoop; const R = o.length / (2 * Math.PI); const base = { profile: o.profile, bundle: o.bundle, attach: o.attach };
    if (pk.kind === 'ground') return Object.assign(base, { centre: [pk.p[0], R + 0.02, pk.p[2]], length: o.length, normal: horizView() });
    if (o.plane === 'ring') { const ax = memberAxis(); const r = Math.hypot(pk.p[0] - ax[0], pk.p[2] - ax[1]); if (r > 0.3) return Object.assign(base, { centre: [ax[0], pk.p[1], ax[1]], length: 2 * Math.PI * r, normal: UP.slice(), ring: true }); }
    return Object.assign(base, { centre: pk.p.slice(), length: o.length, normal: o.plane === 'upright' ? horizView() : UP.slice() });
  }
  // run an operation on a copy of the design (for previews: exactly what a click would add, lashings included)
  function dryRun(fn) {
    const m = Mo.clone(app.W.model); const had = new Set(m.rods.keys()); const j0 = m.joints.length;
    try { fn(m, m.meta.stage + 1); } catch (e) { return null; }
    const rods = Array.from(m.rods.values()).filter((r) => !had.has(r.id)); const joints = m.joints.slice(j0);
    const at = (j) => { const r = m.rods.get(j.a); if (!r) return null; const n = r.pts.length; const i2 = r.closed ? (j.ia + 1) % n : Math.min(n - 1, j.ia + 1); return M.lerp3(r.pts[j.ia], r.pts[i2], j.ta || 0); };
    return { rods, joints, marks: joints.map(at).filter(Boolean) };
  }
  let dryT = 0, dryKey = '';
  function previewDry(key, fn) {
    const now = performance.now(); if (key === dryKey && now - dryT < 400) return; if (now - dryT < 60) { clearTimeout(previewDry.t); previewDry.t = setTimeout(() => app.toolPreview(), 70); return; }
    dryT = now; dryKey = key; const r = dryRun(fn); if (!r) { V.setPreview([]); V.setMarks([]); return; }
    V.setPreview(r.rods.map((q) => (q.closed ? q.pts.concat([q.pts[0]]) : q.pts)), app.colors['accent-fill']); V.setMarks(r.marks, 0.07);
    app.ts.dry = r;
  }
  app.toolPreview = function () {
    const T = app.tool, pk = app.hoverPick, ts = app.ts; const acc = app.colors['accent-fill'];
    V.brush(null); ts.info = null;
    if (app.inSeq() || T === 'select' || T === 'remove') { V.setPreview([]); V.setMarks([]); V.hover(null); V.anchor(null); renderHint(); return; }
    V.anchor(ts.a ? ts.a.p : null);
    if (!pk) { V.hover(null); if (T !== 'rod') { V.setPreview([]); V.setMarks([]); } else drawRodPreview(null); renderHint(); return; }
    V.hover(pk.p, acc, pk.kind === 'ground' ? 0.8 : 1);
    if (T === 'arch') {
      if (!ts.a) { V.setPreview([]); V.setMarks([]); }
      else if (!same(ts.a, pk)) { const L = archLen(ts.a.p, pk.p); const n = Mo.segCount(L, app.W.model.material) + 1; V.setPreview([Mo.arcBetween(ts.a.p, pk.p, L, UP, n).pts], acc); V.setMarks([]); app.ts.info = 'span ' + fmt.m(M.dist(ts.a.p, pk.p), 1) + ' · rod ' + fmt.m(L, 1); }
    } else if (T === 'loop') {
      const o = loopOpts(pk); const s = M.norm([o.side[0], 0, o.side[2]]); const c = M.norm(M.cross(s, UP)); const tl = o.tilt * Math.PI / 180;
      const up = M.norm(M.add(M.mul(UP, Math.cos(tl)), M.mul(c, Math.sin(tl)))); V.setPreview([Mo.loopCurve(pk.p, o.length, s, up, o.feet, 40).pts], acc); V.setMarks([]);
    } else if (T === 'hoop') {
      const o = hoopOpts(pk); previewDry('hoop' + o.centre.map((v) => v.toFixed(2)).join(',') + o.length.toFixed(2), (m, s) => Mo.addHoop(m, o, s));
      const nj = ts.dry ? ts.dry.joints.length : 0; ts.info = (o.ring ? 'ring ⌀ ' + fmt.m(o.length / Math.PI, 1) : '⌀ ' + fmt.m(o.length / Math.PI, 1)) + ' · ' + (nj ? nj + ' lashing' + (nj === 1 ? '' : 's') : 'touches nothing');
    } else if (T === 'rod') drawRodPreview(pk);
    else if (T === 'lash') {
      if (ts.a && pk.kind === 'rod') { V.setPreview([[ts.a.p, pk.p]], app.colors.twine); const d = M.dist(ts.a.p, pk.p); ts.info = d < 0.03 ? 'touching' : fmt.cm(d) + ' apart' + (d > 0.3 ? ': it will have to pull them together' : ''); }
      else V.setPreview([]); V.setMarks(ts.a ? [ts.a.p] : []);
    }
    else if (T === 'weave') {
      if (ts.a && pk.kind === 'rod' && pk.rod !== ts.a.rod) { const o = app.opt.weave; previewDry('weave' + ts.a.rod + pk.rod + o.count + o.slack + o.pattern, (m, s) => Mo.weave(m, { a: ts.a.rod, b: pk.rod, count: o.count, slack: o.slack, pattern: o.pattern, profile: o.profile, bundle: o.bundle }, s)); }
      else { V.setPreview([]); V.setMarks([]); }
    } else if (T === 'grow') { V.hover(null); V.brush(pk.p, app.opt.grow.r); V.setPreview([]); V.setMarks([]); }
    else if (T === 'pull') { V.setPreview([]); V.setMarks([]); const sim = app.W.sim; if (pk.kind === 'rod' && sim.fixed[sim.index.get(pk.rod).off + pk.i]) V.hover(pk.p, app.colors.crit); }
    renderHint();
  };
  function drawRodPreview(pk) {
    const pts = (app.ts.pts || []).map((q) => q.p); if (pk) pts.push(pk.p);
    V.setPreview(pts.length >= 2 ? [Mo.smoothThrough(pts)] : [], app.colors['accent-fill']);
    if (pts.length >= 2) { let L = 0; const sm = Mo.smoothThrough(pts); for (let i = 1; i < sm.length; i++) L += M.dist(sm[i], sm[i - 1]); app.ts.info = 'rod ' + fmt.m(L, 1); } V.setMarks((app.ts.pts || []).filter((q) => q.kind === 'rod').map((q) => q.p));
  }

  // ---------------------------------------------------------------- clicks
  function onHover(e) {
    app.lastPointer = e; const pk = pickFor(app.tool, e); app.hoverPick = pk;
    const hv = pk && (pk.kind === 'rod' || pk.kind === 'joint') && (app.tool === 'select' || app.tool === 'remove' || app.tool === 'weave' || app.tool === 'pull') ? pk : null;
    if ((hv && (!app.hover || hv.kind !== app.hover.kind || hv.rod !== app.hover.rod || hv.id !== app.hover.id)) || (!hv && app.hover)) { app.hover = hv; app.dirty = true; }
    $('#gl').style.cursor = app.tool === 'pull' ? (pk && pk.kind === 'rod' ? 'grab' : 'default') : (app.tool === 'select' || app.tool === 'remove') ? (hv ? 'pointer' : 'default') : 'crosshair';
    app.toolPreview();
  }
  function onClick(e) {
    const T = app.tool; const pk = pickFor(T, e); const ts = app.ts; const o = app.opt[T] || {};
    if (app.inSeq() && T !== 'select') return;
    if (T === 'select') {
      if (!pk || pk.kind === 'ground') { if (!e.shiftKey) app.clearSel(); return; }
      const rods = new Set(e.shiftKey ? app.sel.rods : []), joints = new Set(e.shiftKey ? app.sel.joints : []);
      const set = pk.kind === 'rod' ? rods : joints, id = pk.kind === 'rod' ? pk.rod : pk.id; if (set.has(id) && e.shiftKey) set.delete(id); else set.add(id);
      app.setSel(Array.from(rods), Array.from(joints)); return;
    }
    if (T === 'remove') {
      if (!pk) return; if (pk.kind === 'rod') app.edit('Rod ' + pk.rod + ' removed', (m) => Mo.remove(m, [pk.rod], []));
      else if (pk.kind === 'joint') app.edit('Lashing removed', (m) => Mo.remove(m, [], [pk.id]));
      app.hover = null; return;
    }
    if (!pk) return;
    if (T === 'arch') {
      if (!ts.a) { ts.a = pk; app.toolPreview(); return; }
      if (same(ts.a, pk)) return; const a = ts.a; const L = archLen(a.p, pk.p);
      app.edit('Arch sprung: ' + fmt.m(L, 1) + ' over ' + fmt.m(M.dist(a.p, pk.p), 1), (m, s) => Mo.addArch(m, { a: spec(a), b: spec(pk), length: L, profile: o.profile, bundle: o.bundle, socket: o.socket }, s));
      app.ts = {}; app.toolPreview(); return;
    }
    if (T === 'loop') { const lo = loopOpts(pk); app.edit('Loop stood', (m, s) => Mo.addLoop(m, lo, s)); return; }
    if (T === 'hoop') {
      const ho = hoopOpts(pk); let nj = 0; app.edit(null, (m, s) => { const j0 = m.joints.length; const r = Mo.addHoop(m, ho, s); nj = m.joints.length - j0; return r; });
      app.toast(nj >= 2 ? 'Hoop placed, lashed at ' + nj + ' places' : nj === 1 ? 'Hoop placed but lashed at only one place: it will swing on it' : 'Hoop placed, but it touches nothing to lash to: it will fall', 4200); return;
    }
    if (T === 'rod') {
      ts.pts = ts.pts || []; const last = ts.pts[ts.pts.length - 1];
      if (last && same(last, pk)) { if (ts.pts.length >= 2) finishRod(); return; }
      ts.pts.push(pk); app.toolPreview(); return;
    }
    if (T === 'lash') {
      if (pk.kind !== 'rod') return; if (!ts.a) { ts.a = pk; app.toolPreview(); return; }
      if (ts.a.rod === pk.rod && Math.abs(ts.a.i - pk.i) < 2) return; const a = ts.a;
      app.edit('Lashed ' + a.rod + ' to ' + pk.rod + (M.dist(a.p, pk.p) > 0.05 ? ': the lashing pulls them ' + fmt.cm(M.dist(a.p, pk.p)) + ' together' : ''), (m, s) => Mo.addLash(m, { a: { rod: a.rod, i: a.i }, b: { rod: pk.rod, i: pk.i } }, s), { members: false });
      app.ts = {}; app.toolPreview(); return;
    }
    if (T === 'weave') {
      if (pk.kind !== 'rod') return; if (!ts.a) { ts.a = pk; app.toolPreview(); return; }
      if (pk.rod === ts.a.rod) return; const a = ts.a;
      const out = app.edit(null, (m, s) => Mo.weave(m, { a: a.rod, b: pk.rod, count: o.count, slack: o.slack, pattern: o.pattern, profile: o.profile, bundle: o.bundle }, s));
      if (out) app.toast((out.length || 0) + ' weavers sprung between ' + a.rod + ' and ' + pk.rod);
      app.ts = {}; app.toolPreview(); return;
    }
    if (T === 'grow') { if (app.W.grow && !app.W.grow.done) { app.toast('Already growing'); return; } app.startGrowth(app.opt.grow.count, { p: pk.p.slice(), r: app.opt.grow.r }); return; }
    if (T === 'pull') app.toast('Drag a point to push or pull it');
  }
  function finishRod() {
    const ts = app.ts; const pts = ts.pts || []; if (pts.length < 2) return; const o = app.opt.rod;
    let L = 0; for (let i = 1; i < pts.length; i++) L += M.dist(pts[i].p, pts[i - 1].p);
    if (L < 0.4) { app.toast('Too short for a rod'); return; }
    app.edit('Rod laid: ' + fmt.m(L, 1), (m, s) => Mo.addRod(m, { points: pts.map((q) => q.p.slice()), profile: o.profile, bundle: o.bundle, socket: o.socket, lashVia: true, smooth: true }, s));
    app.ts = {}; app.toolPreview();
  }

  // ---------------------------------------------------------------- push and pull
  function canGrab(e) {
    if (app.inSeq()) return false; if (app.W.grow && !app.W.grow.done) { app.toast('Wait for the growth to finish (or stop it) before pulling'); return false; }
    const pk = pickFor('pull', e); if (!pk || pk.kind !== 'rod') return false; const sim = app.W.sim; const e0 = sim.index.get(pk.rod); if (!e0) return false; const g = e0.off + pk.i;
    if (sim.fixed[g]) { app.toast('That point is held fast: a ground socket, a staked pole or a member on scaffolding'); return false; }
    app.ts.g = g; app.ts.gp = pk; return true;
  }
  function pullStart() {
    const sim = app.W.sim; const d = PH.grab(sim, app.ts.g); if (!d) return; app.ts.drag = d; app.ts.plane = { p: d.start.slice(), n: M.mul(V.viewDir(), -1) };
    app.W.settled = false; $('#gl').style.cursor = 'grabbing';
  }
  function pullMove(e) { const d = app.ts.drag; if (!d) return; const p = V.rayPlane(e.clientX, e.clientY, app.ts.plane.p, app.ts.plane.n); if (!p) return; p[1] = Math.max(p[1], 0.01); if (M.dist(p, d.start) > 4) return; d.p = p; app.W.settled = false; }
  function pullEnd() {
    const d = app.ts.drag; if (!d) return; const sim = app.W.sim; const peak = d.peak; const moved = M.dist(d.start, [sim.X[3 * d.g], sim.X[3 * d.g + 1], sim.X[3 * d.g + 2]]);
    const over = app.W.slipOn ? app.W.overSlip() : []; PH.drop(sim); app.ts.drag = null; app.W.settled = false; $('#gl').style.cursor = 'grab';
    if (over.length) {
      app.W.pushUndo(); const gone = new Set(over); app.W.model.joints = app.W.model.joints.filter((j) => !gone.has(j.id)); app.rebuild(); app.updUndo(); app.autosave();
      app.toast('You pushed ' + fmt.N(peak) + ' and ' + over.length + (over.length === 1 ? ' lashing slipped' : ' lashings slipped') + ' (over ' + app.W.P.material.slip_factor + '× capacity). Undo puts ' + (over.length === 1 ? 'it' : 'them') + ' back.', 5500);
    } else app.toast('Moved ' + fmt.cm(moved) + ' with ' + fmt.N(peak) + ' (about ' + fmt.kg(peak) + ' of push). It springs back.', 4000);
    app.dirty = true;
  }
  app.onDragFrame = function () { PH.handForce(app.W.sim); };

  // ---------------------------------------------------------------- labels in the view
  app.updateLabels = function () {
    const box = $('#labels'); const d = app.W.sim && app.W.sim.drag; let lab = box.firstChild;
    if (!d) { if (lab) box.innerHTML = ''; return; }
    if (!lab) { lab = h('div', { class: 'label3d' }); box.append(lab); }
    const sim = app.W.sim; const o = 3 * d.g; const p = V.project([sim.X[o], sim.X[o + 1], sim.X[o + 2]]); const f = PH.handForce(sim);
    const over = app.W.overSlip().length; lab.className = 'label3d' + (over ? ' crit' : ''); lab.textContent = fmt.N(f) + ' · ' + fmt.kg(f) + (over ? ' · ' + over + ' slipping' : '');
    lab.style.left = p[0] + 'px'; lab.style.top = p[1] + 'px';
  };

  // ---------------------------------------------------------------- growth (the Grow panel and the grow tool)
  app.startGrowth = function (count, focus) {
    const w = app.W; if (w.grow && !w.grow.done) return; if (app.inSeq()) app.exitSeq();
    if (!w.model.rods.size) { app.toast('Place a frame or formwork first: sticks grow on members'); return; }
    if (!app.design.families.some((f) => f.enabled && f.share > 0)) { app.toast('Turn on at least one family in Grow'); return; }
    w.startGrow(count, focus); app.updUndo(); app.renderGrowBar(); if (app.renderGrowPanel) app.renderGrowPanel();
  };
  app.stopGrowth = function () { if (app.W.grow && !app.W.grow.done) { app.W.stopGrow(); app.onGrowDone(true); } };
  app.renderGrowBar = function () {
    const g = app.W.grow; const el = $('#growbar'); if (!g || g.done) { el.hidden = true; return; }
    el.hidden = false; el.innerHTML = '';
    el.append(h('span', { html: `Growing <b class="mono">${g.placed}</b> of ${g.count}${g.focus ? ' near the point' : ''}` }), h('span', { class: 'bar' }, h('i', { style: { width: (100 * g.placed / g.count).toFixed(0) + '%' } })),
      h('button', { class: 'ib sm', onclick: () => app.stopGrowth() }, 'Stop'));
  };
  app.onGrowBatch = function () { app.invalidate(); app.renderGrowBar(); if (app.renderGrowPanel) app.renderGrowPanel(); };
  app.onGrowDone = function (stopped) {
    const g = app.W.grow; $('#growbar').hidden = true; if (!g || g.noted) return; g.noted = true;
    const s = ((Date.now() - g.t0) / 1000).toFixed(1);
    app.toast(g.placed ? `Grew ${g.placed} stick${g.placed === 1 ? '' : 's'} in ${g.batches} batch${g.batches === 1 ? '' : 'es'} (${s} s)` + (stopped ? ', stopped' : g.why === 'full' && g.placed < g.count ? '. No more places fit the rules: widen the reach or lengths, or add members' : '') : 'Nothing could grow here: no stick met the rules. Try a larger radius, longer sticks or more reach.', 5200);
    app.autosave(); app.renderTimeline && app.renderTimeline(); app.refreshPanels && app.refreshPanels(); app.renderGrowPanel && app.renderGrowPanel();
  };

  // ---------------------------------------------------------------- view callbacks
  app.viewCallbacks = () => ({
    onFrame: () => app.onFrame(),
    onHover, onClick,
    onLeave: () => { app.hoverPick = null; if (app.hover) { app.hover = null; app.dirty = true; } if (app.tool !== 'rod') { V.setPreview([]); V.setMarks([]); } V.hover(null); V.brush(null); },
    onDouble: () => { if (app.tool === 'rod') finishRod(); },
    wantsDrag: (e) => app.tool === 'pull' && canGrab(e),
    wantsShift: () => app.tool === 'select',
    onBrushStart: pullStart, onBrushMove: pullMove, onBrushEnd: pullEnd,
    onCamera: () => { if (app.ts.drag) return; if (app.W.sim && app.W.sim.drag) return; }
  });
})();
