/* Weavefield — free rings in the app: the Free ring tool (one ring any way up), the Ring sweep tool (a run of rings
   arching, coiling and twisting between two places), the Free rings panel (layouts, whole-set moves, flow cladding,
   what a small crew can build) and the free-ring editor in the selection. */
(function () {
  'use strict';
  const app = window.WF; const { M, Mo, V, h, fmt } = app; const B = SF.Basket; const TAU = Math.PI * 2; const L = B.LIMITS; const UP = [0, 1, 0];
  const add = (el, ...xs) => el.append(...xs.filter((x) => x != null && x !== false));
  const free = () => app.W.model.meta.free || [];
  const net = () => Object.assign(B.netOpts(), app.W.model.meta.net || {});
  const r3 = (v) => Math.round(v * 1000) / 1000;
  // the next free-ring id
  const nextId = (list) => { let k = Math.max(0, ...list.map((f) => parseInt(String(f.id).slice(1), 10) || 0)); return () => 'F' + (++k); };

  // rebuild baskets and free rings together (free ring definitions and the cladding settings live in the model)
  app.rebuildFree = function (label, mutate, opts, netPatch) {
    let keep = null;
    const out = app.edit(label, (m, s) => {
      const fr = JSON.parse(JSON.stringify(m.meta.free || [])); if (mutate) keep = mutate(fr, nextId(fr));
      const o = Object.assign({}, app.basketOpts(), { net: Object.assign(B.netOpts(), m.meta.net || {}, netPatch || {}) });
      return B.buildAll(m, m.meta.baskets || [], o, s, fr);
    }, Object.assign({}, opts || {}));
    if (keep && keep.select) { const r = Array.from(app.W.model.rods.values()).find((q) => q.fr === keep.select); if (r) app.setSel([r.id], []); }
    if (app.renderFreePanel) app.renderFreePanel(); if (app.renderBasketPanel) app.renderBasketPanel(); return out;
  };
  app.placeFreeLayout = function (id, quiet) { const L0 = B.FREE_LAYOUTS.find((x) => x[0] === id) || B.FREE_LAYOUTS[0]; return app.rebuildFree(quiet ? null : L0[1] + ': built ring by ring', (fr) => { fr.length = 0; fr.push(...L0[2]()); }, quiet ? { toast: false } : {}); };

  // ---------------------------------------------------------------- the two tools
  function horizView() { const d = V.viewDir(); const v = [d[0], 0, d[2]]; return M.len(v) > 1e-3 ? M.norm(v) : [0, 0, -1]; }
  // a free ring from the tool options, standing at a ground point or hung through a point on a rod
  function ringAt(pk, id) {
    const o = app.opt.free; const C = B.clampC(o.C); const R = C / TAU;
    const azDeg = o.facing === 'me' ? Math.atan2(horizView()[2], horizView()[0]) * 180 / Math.PI : o.az; const f = { id, C, tilt: o.tip, az: Math.round(azDeg * 10) / 10 };
    const g = B.freeRing(Object.assign({}, f, { c: [0, 5, 0] })); const n = g.n;
    if (pk.kind === 'ground') { f.c = [pk.p[0], R + 0.02, pk.p[2]].map(r3); return f; }
    // through the clicked point: the ring rises from it, in its own plane
    let u = M.sub(UP, M.mul(n, M.dot(UP, n))); if (M.len(u) < 0.2) u = M.sub(horizView(), M.mul(n, M.dot(horizView(), n))); u = M.norm(u);
    f.c = M.add(pk.p, M.mul(u, R * 0.92)).map(r3); return f;
  }
  function sweepEnd(pk) { const p = pk.p.slice(); if (pk.kind === 'ground') p[1] = Math.max(p[1], B.clampC(app.opt.sweep.C) / TAU * 0.9); return p; }
  function lines(defs) { return defs.map((f) => { const g = B.freeRing(f); const pts = []; for (let i = 0; i <= 40; i++) pts.push(B.ringPoint(g, TAU * i / 40)); return pts; }); }
  app.freeClick = function (T, pk) {
    if (!pk || pk.kind === 'joint') return; const ts = app.ts;
    if (T === 'free') { app.rebuildFree(null, (fr, nid) => { const f = ringAt(pk, nid()); fr.push(f); const g = B.freeRing(f); app.toast('Ring ' + f.id + ' placed: ' + g.C.toFixed(2) + ' m round, tipped ' + f.tilt + '°' + (g.grounded ? ', standing on the ground' : pk.kind === 'rod' ? ', bolted where it crosses' : ''), 3800); return { select: f.id }; }, { toast: false }); app.toolPreview(); return; }
    if (!ts.a) { ts.a = pk; app.renderHint(); app.toolPreview(); return; }
    if (M.dist(ts.a.p, pk.p) < 0.6) { app.toast('Pick an end further away'); return; }
    const a = sweepEnd(ts.a), b = sweepEnd(pk); app.ts = {};
    app.rebuildFree(null, (fr, nid) => { const s = B.sweep(a, b, app.opt.sweep, nid); fr.push(...s); app.toast(s.length + ' rings swept over ' + fmt.m(M.dist(a, b), 1) + ', each bolted where it crosses or blocked where it passes close', 4200); }, { toast: false });
    app.toolPreview();
  };
  app.freePreview = function (T, pk) {
    const acc = app.colors['accent-fill']; const ts = app.ts; if (!pk || pk.kind === 'joint') { V.setPreview([]); return; }
    if (T === 'free') { const f = ringAt(pk, 'F?'); V.setPreview(lines([f]), acc); ts.info = B.freeRing(f).C.toFixed(2) + ' m round · tipped ' + f.tilt + '°'; }
    else if (ts.a) { const s = B.sweep(sweepEnd(ts.a), sweepEnd(pk), app.opt.sweep); V.setPreview(lines(s), acc); ts.info = s.length + ' rings over ' + fmt.m(M.dist(ts.a.p, pk.p), 1); }
    else { V.setPreview([]); ts.info = 'start of the sweep'; }
    V.setMarks([]); app.dirty = true;
  };

  // ---------------------------------------------------------------- the panel
  app.renderFree = function (b, badge) {
    const { slider, segRow, select, check, btn, hint, note } = app.ui; const fr = free(); const n = fr.length; const seq = app.inSeq(); const o = app.opt.free, sw = app.opt.sweep; const nt = net();
    badge.hidden = !n; badge.textContent = String(n); const save = () => app.saveUI();
    add(b, hint('Rings placed one by one, any way up, not stacked in baskets: stand them on the ground, hang them through other rings, or sweep runs of them that arch, coil and twist. Each is bolted wherever it crosses a ring, and joined by a short block wherever it passes within 35 cm. Then grow cladding over them.'));
    add(b, h('h4', { class: 'sub', text: 'A ring (Free ring tool, N)' }),
      slider('Size', { min: L.cMin, max: L.cMax, step: 0.05, get: () => o.C, set: (v) => { o.C = v; save(); }, fmt: (v) => v.toFixed(2) + ' m round' }),
      slider('Tip', { min: 0, max: 180, step: 5, get: () => o.tip, set: (v) => { o.tip = v; save(); }, fmt: (v) => (v === 0 ? 'lying flat' : v === 90 ? 'standing' : v + '°') }),
      segRow('Facing', [['me', 'Towards me'], ['angle', 'Angle']], () => o.facing, (v) => { o.facing = v; save(); app.renderFreePanel(); }),
      o.facing === 'angle' ? slider('Facing angle', { min: 0, max: 359, step: 5, get: () => o.az, set: (v) => { o.az = v; save(); }, fmt: (v) => v + '°' }) : null,
      h('div', { class: 'btns' }, btn('Free ring tool', () => app.setTool('free'), app.tool === 'free' ? 'primary' : '')));
    add(b, h('h4', { class: 'sub', text: 'A sweep (Ring sweep tool, S)' }),
      slider('Rings', { min: 2, max: 20, step: 1, get: () => sw.count, set: (v) => { sw.count = v; save(); } }),
      slider('Arch', { min: 0, max: 3, step: 0.1, get: () => sw.lift, set: (v) => { sw.lift = v; save(); }, fmt: (v) => (v ? v.toFixed(1) + ' m' : 'flat') }),
      slider('Coil', { min: 0, max: 1.5, step: 0.05, get: () => sw.coil, set: (v) => { sw.coil = v; save(); }, fmt: (v) => (v ? v.toFixed(2) + ' m' : 'none') }),
      sw.coil ? slider('Coil turns', { min: 0.5, max: 4, step: 0.5, get: () => sw.turns, set: (v) => { sw.turns = v; save(); } }) : null,
      slider('Ring tip', { min: 0, max: 90, step: 5, get: () => sw.tip, set: (v) => { sw.tip = v; save(); }, fmt: (v) => (v === 0 ? 'across the path' : v === 90 ? 'along the path' : v + '°') }),
      slider('Twist', { min: -720, max: 720, step: 15, get: () => sw.twist, set: (v) => { sw.twist = v; save(); }, fmt: (v) => v + '° end to end' }),
      slider('Size', { min: L.cMin, max: L.cMax, step: 0.05, get: () => sw.C, set: (v) => { sw.C = v; save(); }, fmt: (v) => v.toFixed(2) + ' m round' }),
      segRow('Sizes', [['same', 'Same'], ['swell', 'Swell'], ['taper', 'Taper'], ['pulse', 'Pulse']], () => sw.size, (v) => { sw.size = v; save(); }),
      h('div', { class: 'btns' }, btn('Ring sweep tool', () => app.setTool('sweep'), app.tool === 'sweep' ? 'primary' : '')),
      hint('Rings lying along the path link like a chain and cross each other, so they bolt together; rings across the path make a tube that needs something else to hold it.'));
    // layouts and whole-set moves
    add(b, h('h4', { class: 'sub', text: 'Start from' }), select('Layout', B.FREE_LAYOUTS.map((x) => [x[0], x[1]]), () => app.freeLayout || B.FREE_LAYOUTS[0][0], (v) => { app.freeLayout = v; }),
      h('div', { class: 'btns' }, btn(n ? 'Replace the free rings' : 'Build this layout', async () => { if (n && !(await app.confirm({ title: 'Replace the free rings?', text: 'The layout replaces the ' + n + ' free rings here; undo brings them back.', ok: 'Replace' }))) return; app.placeFreeLayout(app.freeLayout || B.FREE_LAYOUTS[0][0]); app.frameAll(); }, n ? '' : 'primary', { disabled: seq || null }),
        n ? btn('Remove free rings', () => app.rebuildFree('Free rings removed', (f) => { f.length = 0; }), 'danger', { disabled: seq || null }) : null));
    if (n) {
      app.freeOp = app.freeOp || { count: 3, deg: 40, shake: 12 }; const fo = app.freeOp; const op = (label, name, extra) => app.rebuildFree(label, (f, nid) => { const next = B.ringOps(f, name, Object.assign({}, fo, extra), nid); f.length = 0; f.push(...next); });
      add(b, h('h4', { class: 'sub', text: 'Move all ' + n + ' free rings' }),
        slider('Copies round', { min: 2, max: 8, step: 1, get: () => fo.count, set: (v) => { fo.count = v; } }),
        slider('Twist up', { min: -180, max: 180, step: 5, get: () => fo.deg, set: (v) => { fo.deg = v; }, fmt: (v) => v + '° bottom to top' }),
        slider('Shake', { min: 2, max: 45, step: 1, get: () => fo.shake, set: (v) => { fo.shake = v; }, fmt: (v) => 'up to ' + v + '°' }),
        h('div', { class: 'btns' }, btn('Copy round', () => op('Copied round ' + fo.count + ' times', 'array'), '', { disabled: seq || null }), btn('Mirror', () => op('Mirrored', 'mirror'), '', { disabled: seq || null }),
          btn('Twist up', () => op('Twisted ' + fo.deg + '° from bottom to top', 'twist'), '', { disabled: seq || null }), btn('Shake', () => op('Shaken: every ring tipped and moved a little', 'shake', { deg: fo.shake, seed: Math.floor(Math.random() * 9999) }), '', { disabled: seq || null }),
          btn('Bigger', () => op('Every free ring 0.2 m bigger round', 'size', { dC: 0.2 }), '', { disabled: seq || null }), btn('Smaller', () => op('Every free ring 0.2 m smaller round', 'size', { dC: -0.2 }), '', { disabled: seq || null })),
        hint('Copies go round the middle of the free rings; twist turns each ring round that middle more the higher it is.'));
    }
    // cladding grown over the free rings
    const regrow = (patch, label) => app.rebuildFree(label || null, null, { toast: !!label }, patch);
    add(b, h('h4', { class: 'sub', text: 'Grow cladding on them' }),
      check('Grow cladding over the free rings', () => nt.clad, (v) => regrow({ clad: v }, v ? 'Cladding grown over the free rings' : 'Cladding taken off the free rings')),
      slider('Density', { min: 1, max: 20, step: 0.5, change: true, get: () => nt.density, set: (v) => regrow({ density: v }), fmt: (v) => v + ' tries per m of ring' }),
      slider('Stick length', { min: 0.8, max: 4, step: 0.1, change: true, get: () => nt.len, set: (v) => regrow({ len: v }), fmt: (v) => 'about ' + v.toFixed(1) + ' m' }),
      slider('Spin', { min: 0, max: 2, step: 0.05, change: true, get: () => nt.spin, set: (v) => regrow({ spin: v }), fmt: (v) => (v ? v.toFixed(2) : 'runs along') }),
      slider('Hug', { min: 0.1, max: 1.5, step: 0.05, change: true, get: () => nt.hug, set: (v) => regrow({ hug: v }), fmt: (v) => (v < 0.4 ? 'loose ' : v > 1 ? 'tight ' : '') + v.toFixed(2) }),
      slider('Runs past', { min: 0, max: 1.5, step: 0.05, change: true, get: () => nt.reach, set: (v) => regrow({ reach: v }), fmt: (v) => (v ? 'up to ' + v.toFixed(2) + ' m' : 'none') }),
      h('div', { class: 'btns' }, btn('Grow again differently', () => regrow({ seed: (nt.seed || 5) + 1 }, 'Cladding grown again'), '', { disabled: seq || !n || null })),
      hint('Each thin stick starts beside a ring and follows the flow of the rings near it: along them, spinning round them, and crossing from ring to ring where they meet. It is laid onto what it is lashed to, kept only with three lashings (four if pre-bent), and left off if it would have to bend tighter than a soaked stick.'));
    // what a small crew can build
    if (n) {
      const ch = B.freeChecks(app.W.model); const crit = ch.filter((x) => x.level === 'crit'), warn = ch.filter((x) => x.level === 'warn'), info = ch.filter((x) => x.level === 'info');
      const blocks = Array.from(app.W.model.rods.values()).filter((r) => r.part === 'block').length; const bolts = app.W.model.joints.filter((j) => j.type === 'bolt' && (app.W.model.rods.get(j.a).bk === 'net' || app.W.model.rods.get(j.b).bk === 'net')).length;
      add(b, h('h4', { class: 'sub', text: 'Can a small crew build it?' }), app.ui.kv([['Free rings', String(n)], ['Bolts', String(bolts)], ['Blocks between rings', String(blocks)], ['Work from a ladder', info.length ? info.length + ' rings' : 'none'], ['Needs a scaffold tower', ch.filter((x) => /scaffold/.test(x.text)).length + ' rings']]));
      if (crit.length) add(b, note('<b>' + crit.length + ' cannot stand once the formwork is out.</b> ' + app.esc(crit[0].text), 'crit'));
      if (warn.length) add(b, note('<b>' + warn.length + ' to look at.</b> ' + app.esc(warn[0].text), 'warn'));
      if (!crit.length && !warn.length) add(b, note('Every free ring is held at three places or more, and none needs more than a ladder.', 'ok'));
      if (crit.length + warn.length) add(b, h('div', { class: 'btns' }, btn('Select them', () => app.setSel(Array.from(new Set(crit.concat(warn).map((x) => x.id))), []))));
    }
  };

  // ---------------------------------------------------------------- the editor for one free ring
  app.freeSel = function (b, rod) {
    const { slider, btn } = app.ui; const seq = app.inSeq(); const f = free().find((q) => q.id === rod.fr);
    if (!f) { add(b, app.ui.hint(rod.part === 'block' ? 'A block between two free rings that pass close: bolted to each.' : rod.kind === 'clad' ? 'A cladding stick grown over the free rings. It is grown again whenever the rings change.' : '')); return; }
    const g = B.freeRing(f); const set = (k, idx) => (v) => app.rebuildFree(null, (fr) => { const q = fr.find((x) => x.id === f.id); if (idx != null) { q.c = q.c.slice(); q.c[idx] = r3(v); } else q[k] = v; return { select: f.id }; }, { toast: false });
    add(b, h('div', { class: 'row two' }, h('span', { class: 'lab', html: '<b style="color:var(--ink)">Free ring ' + f.id + '</b>' }), h('span', { class: 'hint', text: g.C.toFixed(2) + ' m round · ' + (g.grounded ? 'on the ground' : 'held by bolts') })));
    if (seq) return;
    add(b, slider('Size', { min: L.cMin, max: L.cMax, step: 0.05, change: true, get: () => f.C, set: set('C'), fmt: (v) => v.toFixed(2) + ' m round' + (v > L.cTested ? ' · untested' : '') }),
      slider('Tip', { min: 0, max: 180, step: 1, change: true, get: () => f.tilt, set: set('tilt'), fmt: (v) => v + '°' }),
      slider('Facing', { min: -180, max: 180, step: 1, change: true, get: () => ((f.az + 540) % 360) - 180, set: set('az'), fmt: (v) => v + '°' }),
      slider('Across', { min: -10, max: 10, step: 0.05, change: true, get: () => f.c[0], set: set(null, 0), fmt: (v) => v.toFixed(2) + ' m' }),
      slider('Height', { min: 0, max: 5, step: 0.05, change: true, get: () => f.c[1], set: set(null, 1), fmt: (v) => v.toFixed(2) + ' m' }),
      slider('Back', { min: -10, max: 10, step: 0.05, change: true, get: () => f.c[2], set: set(null, 2), fmt: (v) => v.toFixed(2) + ' m' }),
      h('div', { class: 'btns' },
        btn('Copy through it', () => app.rebuildFree(null, (fr, nid) => { const q = JSON.parse(JSON.stringify(f)); q.id = nid(); q.az = (q.az || 0) + 60; q.tilt = Math.min(180, (q.tilt || 0) + 20); q.c = [f.c[0] + 0.45, f.c[1] + 0.25, f.c[2]].map(r3); fr.push(q); app.toast('Ring ' + q.id + ' copied, turned through ' + f.id); return { select: q.id }; }, { toast: false })),
        btn('Remove ring', () => { app.rebuildFree('Ring ' + f.id + ' removed', (fr) => { const i = fr.findIndex((x) => x.id === f.id); if (i >= 0) fr.splice(i, 1); }); app.clearSel(); }, 'danger')),
      app.ui.hint('Bolts and blocks to other rings, and the cladding over them, are worked out again after every change.'));
  };
  void UP;
})();
