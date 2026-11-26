/* Weavefield — baskets in the app: the Basket tool (set out a basket of rings, stack rings on one), the Baskets panel
   (sketch underlay and ring finding, defaults for new baskets, the build, material against stock, tested limits) and
   the basket editor in the selection. */
(function () {
  'use strict';
  const app = window.WF; const { M, Mo, V, $, h, fmt } = app; const B = SF.Basket; const TAU = Math.PI * 2; const L = B.LIMITS;
  const UP = [0, 1, 0];
  // append what is there (conditional rows come through as null)
  const add = (el, ...xs) => el.append(...xs.filter((x) => x != null && x !== false));
  const list = () => app.W.model.meta.baskets || [];
  app.basketOpts = () => Object.assign(B.opts(), app.design.basketOpts || {});
  const setOpt = (k, v) => { app.design.basketOpts = Object.assign(app.basketOpts(), { [k]: v }); app.autosave(); };
  const ringLabel = (C) => C.toFixed(2) + ' m round (⌀ ' + (C / Math.PI).toFixed(2) + ' m)';

  // rebuild every basket from its definition (kept in the model, so undo brings definitions back too)
  app.rebuildBaskets = function (label, mutate, opts) {
    let keep = null;
    const out = app.edit(label, (m, s) => { const bs = JSON.parse(JSON.stringify(m.meta.baskets || [])); if (mutate) keep = mutate(bs); return B.buildAll(m, bs, app.basketOpts(), s); }, Object.assign({}, opts || {}));
    // keep a basket selected through the rebuild: the same ring of it
    if (keep && keep.select) { const r = Array.from(app.W.model.rods.values()).filter((q) => q.bk === keep.select && q.kind === 'ring').sort((a, b) => Math.abs((a.rk || 0) - (keep.rk || 0)) - Math.abs((b.rk || 0) - (keep.rk || 0)))[0]; if (r) app.setSel([r.id], []); }
    if (app.renderBasketPanel) app.renderBasketPanel(); return out;
  };
  // the pile is set by replacing the list in place
  app.basketLayout = 'pair';
  app.placeBasketLayout = function (id, quiet) { const L0 = B.LAYOUTS.find((x) => x[0] === id) || B.LAYOUTS[0]; return app.rebuildBaskets(quiet ? null : L0[1] + ': built ring by ring', (bs) => { bs.length = 0; bs.push(...L0[2](app.design)); }, quiet ? { toast: false } : {}); };
  // remove every rod, lashing and basket (undo brings them back)
  app.removeAll = async function () {
    if (!app.W.model.rods.size) { app.toast('There is nothing to remove'); return; }
    if (!(await app.confirm({ title: 'Remove everything?', text: 'Every basket, rod and lashing goes. Undo brings it all back.', ok: 'Remove all', danger: true }))) return;
    if (app.W.grow && app.stopGrowth) app.stopGrowth(); app.clearSel();
    app.edit('Everything removed', (m) => { Mo.remove(m, Array.from(m.rods.keys()), []); m.meta.events = []; m.meta.baskets = []; m.meta.free = []; app.design.formworkEls = []; }); app.updateEmpty();
  };
  app.placePile = function (quiet) { return app.rebuildBaskets(quiet ? null : 'A pile of seven baskets, built ring by ring', (bs) => { bs.length = 0; bs.push(...B.pile(app.design)); }, quiet ? { toast: false } : {}); };

  const TOPS = [['open', 'Open', 'The rings end at the top ring'], ['point', 'Pointed', 'The bracing carries on past the top ring and is bound together at a point']];
  // the skin's settings as they stand, and a rebuild with some of them changed
  const skinNow = () => Object.assign(B.skinOpts(), app.W.model.meta.skin || { on: (list()).some((q) => q.clad) });
  function setSkin(patch, label) {
    app.edit(label, (m, s) => { m.meta.skin = Object.assign(skinNow(), patch); return B.buildAll(m, JSON.parse(JSON.stringify(m.meta.baskets || [])), app.basketOpts(), s); });
    app.renderBasketPanel();
  }
  app.setSkin = setSkin;
  // add a ring above ring k of a basket (+1), or take ring k out (-1); one-ring edits move with their rings
  function shiftRings(id, k, d) {
    app.rebuildBaskets(d > 0 ? 'Ring added to ' + id : 'Ring taken out of ' + id, (bs) => {
      const q = bs.find((x) => x.id === id); if (!q) return; if (d > 0 && q.rings >= L.maxRings) { app.toast(L.maxRings + ' rings is the most a basket takes here'); return; }
      const e0 = q.ringEdits || {}; const e1 = {}; for (const key of Object.keys(e0)) { const i = +key; if (d < 0 && i === k) continue; e1[d > 0 ? (i > k ? i + 1 : i) : (i > k ? i - 1 : i)] = e0[key]; }
      q.ringEdits = e1; q.rings = Math.max(1, q.rings + d); return { select: id, rk: d > 0 ? k + 1 : Math.max(0, k - 1) };
    });
  }
  // ---------------------------------------------------------------- the Basket tool
  function stackOn(id) {
    const b = list().find((q) => q.id === id); if (!b) return;
    if ((b.rings || 1) >= L.maxRings) { app.toast(L.maxRings + ' rings is the most a basket takes here'); return; }
    app.rebuildBaskets('Ring stacked on ' + id + ': ' + ((b.rings || 1) + 1) + ' rings', (bs) => { const q = bs.find((x) => x.id === id); q.rings = (q.rings || 1) + 1; return { select: id, rk: q.rings - 1 }; });
  }
  function basketAt(p) { for (const b of list()) { const R = b.C / TAU; if (Math.hypot(p[0] - b.x, p[2] - b.z) < R * 0.9) return b; } return null; }
  function sizeFrom(c, p) { const r = Math.hypot(p[0] - c[0], p[2] - c[2]); return r < 0.25 ? app.opt.ring.C : TAU * r; }
  app.ringClick = function (pk) {
    const ts = app.ts; if (!pk) return;
    if (!ts.a) {
      const rod = pk.kind === 'rod' ? app.W.model.rods.get(pk.rod) : null;
      if (rod && rod.bk) { stackOn(rod.bk); return; }
      if (pk.kind !== 'ground') { app.toast('Click the ground to set out a basket, or a basket to stack a ring on it'); return; }
      const on = basketAt(pk.p); if (on) { stackOn(on.id); return; }
      ts.a = pk; app.renderHint(); app.toolPreview(); return;
    }
    const raw = sizeFrom(ts.a.p, pk.p); const C = B.clampC(raw); const c = ts.a.p; app.ts = {}; app.opt.ring.C = C; app.saveUI();
    app.rebuildBaskets(null, (bs) => { const nb = B.make({ baskets: bs, basketOpts: app.basketOpts() }, c[0], c[2], C); bs.push(nb); app.toast('Basket ' + nb.id + ' set out: ' + nb.rings + ' rings on a ' + ringLabel(C) + ' base' + (raw < L.cMin - 0.05 ? '. Made 1.2 m across, the tightest a soaked pole bends' : C > L.pole - L.minLap ? '. It takes ' + B.ringPoles(C) + ' poles spliced together' : ''), 4200); return { select: nb.id, rk: 0 }; });
    app.toolPreview();
  };
  function ringLines(b) { return B.rings(b).map((r) => { const pts = []; for (let i = 0; i <= 40; i++) pts.push(B.ringPoint(r, TAU * i / 40)); return pts; }); }
  app.ringPreview = function (pk) {
    const ts = app.ts; const acc = app.colors['accent-fill']; const o = app.basketOpts();
    if (ts.a) {
      const raw = sizeFrom(ts.a.p, pk.p); const C = B.clampC(raw); const b = Object.assign(B.make({ baskets: [], basketOpts: o }, ts.a.p[0], ts.a.p[2], C));
      V.setPreview(ringLines(b), acc); V.setMarks([]); ts.info = ringLabel(C) + (raw < L.cMin - 0.05 ? ' · the smallest ring that bends' : C > L.cTested ? ' · ' + B.ringPoles(C) + ' pole' + (B.ringPoles(C) > 1 ? 's spliced' : '') + ', bigger than tested' : '');
      app.dirty = true; return;
    }
    const rod = pk.kind === 'rod' ? app.W.model.rods.get(pk.rod) : null; const on = rod && rod.bk ? list().find((q) => q.id === rod.bk) : pk.kind === 'ground' ? basketAt(pk.p) : null;
    if (on) { const nb = Object.assign({}, on, { rings: (on.rings || 1) + 1 }); const rs = ringLines(nb); V.setPreview(rs.slice(-1), acc); ts.info = 'stack ring ' + nb.rings + ' on ' + on.id; app.dirty = true; return; }
    if (pk.kind === 'ground') { const b = B.make({ baskets: [], basketOpts: o }, pk.p[0], pk.p[2], app.opt.ring.C); V.setPreview(ringLines(b).slice(0, 1), acc); ts.info = 'centre of a new basket'; }
    else V.setPreview([]);
    V.setMarks([]); app.dirty = true;
  };

  // ---------------------------------------------------------------- sketch underlay
  app.sketch = null; app.sketchImg = null;
  function showSketch() { if (!V.ready) return; const s = app.sketch; V.setUnderlay(s && app.sketchImg ? Object.assign({}, s, { img: app.sketchImg }) : null); app.dirty = true; }
  app.showSketch = showSketch;
  function loadImage(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('That image could not be read')); im.src = src; }); }
  // shrink a picture to at most 1400 px across so it keeps in the design file
  async function addSketch(file) {
    const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error('That file could not be read')); fr.readAsDataURL(file); });
    let im = await loadImage(url); const k = Math.min(1, 1400 / Math.max(im.width, im.height)); let src = url;
    if (k < 1 || url.length > 900000) { const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.drawImage(im, 0, 0, c.width, c.height); src = c.toDataURL('image/jpeg', 0.82); im = await loadImage(src); }
    app.sketchImg = im; const bb = app.W.model.rods.size ? app.bounds() : null;
    app.sketch = { src, w: 10, cx: bb ? (bb.min[0] + bb.max[0]) / 2 : 0, cz: bb ? (bb.min[2] + bb.max[2]) / 2 : 0, rot: 0, opacity: 0.6, plane: 'plan', show: true, name: file.name };
    showSketch(); app.autosave(); app.renderBasketPanel(); V.view('top'); app.frameAll();
    app.toast('Sketch laid under the design. Set its width, then trace rings on it with the Basket tool, or let Weavefield find them', 5200);
  }
  // pixel (x, y) of the sketch to a point on the ground, as the underlay lies
  function sketchToWorld(px, py, cw, ch) {
    const s = app.sketch; const asp = ch / cw; const lx = (px / cw - 0.5) * s.w, ly = -(py / ch - 0.5) * s.w * asp; const a = (s.rot || 0) * Math.PI / 180;
    const x = lx * Math.cos(a) - ly * Math.sin(a), y = lx * Math.sin(a) + ly * Math.cos(a); return [s.cx + x, 0, s.cz - y];
  }
  async function findRings() {
    if (!app.sketchImg) return; const im = app.sketchImg; const cw = Math.min(260, im.width); const ch = Math.round(im.height * cw / im.width);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d'); g.drawImage(im, 0, 0, cw, ch); const d = g.getImageData(0, 0, cw, ch).data;
    const gray = new Float32Array(cw * ch); for (let i = 0; i < cw * ch; i++) gray[i] = (0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2]) / 255;
    const circ = B.findCircles(gray, cw, ch, { max: 16, rMin: Math.min(cw, ch) * 0.035, rMax: Math.min(cw, ch) * 0.3 });
    if (!circ.length) { app.toast('No rings found in this sketch. Trace them with the Basket tool instead', 5000); return; }
    if (list().length && !(await app.confirm({ title: 'Replace the baskets?', text: circ.length + ' rings found in the sketch. They replace the ' + list().length + ' baskets here now; undo brings them back.', ok: 'Replace' }))) return;
    // sizes go onto the rings that can be bent; the sketch is scaled so the circles sit on its drawing
    const fit = B.fromCircles(app.design, circ); app.sketch.w = Math.round(fit.mpp * cw * 100) / 100; showSketch();
    app.rebuildBaskets(circ.length + ' rings found in the sketch: each is a basket now', (bs) => { bs.length = 0; fit.baskets.forEach((b, i) => { const p = sketchToWorld(circ[i].x, circ[i].y, cw, ch); b.x = Math.round(p[0] * 1000) / 1000; b.z = Math.round(p[2] * 1000) / 1000; bs.push(b); }); });
    app.frameAll();
  }

  // ---------------------------------------------------------------- the Baskets panel
  app.renderBaskets = function (b, badge) {
    const { slider, seg, segRow, select, check, btn, hint, note } = app.ui; const o = app.basketOpts(); const n = list().length; const seq = app.inSeq();
    badge.hidden = !n; badge.textContent = String(n);
    // sketch
    add(b, h('h4', { class: 'sub', text: 'Design from a sketch' }));
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { await addSketch(f); } catch (err) { app.toast(err.message); } } });
    add(b, file);
    if (!app.sketch) {
      add(b, h('div', { class: 'btns' }, btn('Add a sketch…', () => file.click(), 'primary')), hint('A photo or drawing of the plan: it lies under the design so you can trace rings on it with the <b>Basket</b> tool (<kbd>B</kbd>), or let Weavefield find the circles. An elevation stands up behind instead.'));
    } else {
      const s = app.sketch; const upd = () => { showSketch(); app.autosave(); };
      add(b, segRow('Sketch is', [['plan', 'Plan'], ['front', 'Elevation']], () => s.plane, (v) => { s.plane = v; upd(); V.view(v === 'plan' ? 'top' : 'front'); }),
        slider('Width', { min: 1, max: 40, step: 0.1, get: () => s.w, set: (v) => { s.w = v; upd(); }, fmt: (v) => v.toFixed(1) + ' m' }),
        slider('Opacity', { min: 0.1, max: 1, step: 0.05, get: () => s.opacity, set: (v) => { s.opacity = v; upd(); }, fmt: (v) => Math.round(v * 100) + '%' }),
        s.plane === 'plan' ? slider('Turn', { min: -180, max: 180, step: 1, get: () => s.rot || 0, set: (v) => { s.rot = v; upd(); }, fmt: (v) => v + '°' }) : null,
        slider('Across', { min: -15, max: 15, step: 0.05, get: () => s.cx, set: (v) => { s.cx = v; upd(); }, fmt: (v) => v.toFixed(2) + ' m' }),
        slider(s.plane === 'plan' ? 'Back' : 'Depth', { min: -15, max: 15, step: 0.05, get: () => s.cz, set: (v) => { s.cz = v; upd(); }, fmt: (v) => v.toFixed(2) + ' m' }),
        check('Show the sketch', () => s.show !== false, (v) => { s.show = v; upd(); }),
        h('div', { class: 'btns' }, s.plane === 'plan' ? btn('Find rings in the sketch', () => findRings(), 'primary', { disabled: seq || null }) : null, btn('Trace with the Basket tool', () => { app.setTool('ring'); V.view(s.plane === 'plan' ? 'top' : 'front'); }), btn('Replace…', () => file.click()), btn('Remove', () => { app.sketch = null; app.sketchImg = null; showSketch(); app.autosave(); app.renderBasketPanel(); })),
        hint(s.plane === 'plan' ? 'Circles drawn in the plan become baskets. The sketch is scaled so its biggest circle is the biggest ring one 5 m pole makes (1.6 m across); set <b>Width</b> to the real size if it is bigger. Circles smaller than the tightest ring (1.2 m across) are made that size. Crop the picture to the plan first, and remove any extra baskets with the Remove tool.' : 'Trace over the elevation with the Basket tool from the front view; use it to judge heights and how many rings to stack.'));
    }
    // defaults for new baskets
    add(b, h('h4', { class: 'sub', text: 'New baskets' }));
    add(b, slider('Rings', { min: 1, max: L.maxRings, step: 1, get: () => o.rings, set: (v) => setOpt('rings', v) }),
      slider('Ring spacing', { min: 0.3, max: 1, step: 0.05, get: () => o.gap, set: (v) => setOpt('gap', v), fmt: (v) => v.toFixed(2) + ' m' }),
      segRow('Profile', B.SHAPES, () => o.shape, (v) => setOpt('shape', v)),
      select('Bracing', B.BRACES.map((x) => [x[0], x[1]]), () => o.brace, (v) => { setOpt('brace', v); app.renderBasketPanel(); }),
      hint((B.BRACES.find((x) => x[0] === o.brace) || B.BRACES[0])[2] + '.'),
      slider('Stick spacing', { min: 0.25, max: 0.9, step: 0.05, get: () => o.spacing, set: (v) => setOpt('spacing', v), fmt: (v) => v.toFixed(2) + ' m' }),
      
      segRow('Top', TOPS, () => o.top || 'open', (v) => { setOpt('top', v); app.renderBasketPanel(); }),
      o.top === 'point' ? hint('The bracing runs on past the top ring and the sticks are bound together at a point above it.') : slider('Tops', { min: 0, max: 1.5, step: 0.05, get: () => o.tops, set: (v) => setOpt('tops', v), fmt: (v) => (v ? 'up to ' + v.toFixed(2) + ' m' : 'none') }),
      segRow('Base', [['pegged', 'Pegged', 'The base ring sits on the ground, pegged at four points'], ['staked', 'Staked', 'Sticks run into the ground; the base ring is held up on them']], () => o.ground, (v) => setOpt('ground', v)),
      check('Leave a doorway in each', () => o.door, (v) => setOpt('door', v)),
      h('h4', { class: 'sub', text: 'Twist and overlap' }),
      slider('Twist', { min: -60, max: 60, step: 1, get: () => o.twist, set: (v) => setOpt('twist', v), fmt: (v) => v + '° a ring' }),
      slider('Ring tip', { min: 0, max: 40, step: 1, get: () => o.tilt, set: (v) => setOpt('tilt', v), fmt: (v) => (v ? v + '°' : 'level') }),
      segRow('Tipping', B.TILTS, () => o.tiltMode, (v) => setOpt('tiltMode', v)),
      slider('Drift', { min: 0, max: 1, step: 0.05, get: () => o.drift, set: (v) => setOpt('drift', v), fmt: (v) => (v ? v.toFixed(2) + ' m' : 'none') }),
      hint('Each ring above the base tips by <b>Ring tip</b> towards a direction that turns by <b>Twist</b> at every ring, and the centres drift round a widening spiral. Tipped rings cut through each other: they are bolted wherever they cross, as each one goes up.'));
    add(b, h('div', { class: 'btns' }, btn('Apply to every basket', () => { if (!n) { app.toast('No baskets yet: use the Basket tool or a sketch'); return; } app.rebuildBaskets('Every basket rebuilt with these settings', (bs) => { for (const q of bs) Object.assign(q, { rings: o.rings, gap: o.gap, shape: o.shape, brace: o.brace, spacing: o.spacing, tops: o.tops, top: o.top || 'open', ground: o.ground, door: o.door, twist: o.twist, tilt: o.tilt, drift: o.drift, tiltMode: o.tiltMode }); delete q.ringEdits; }); }, '', { disabled: seq || null })));
    // build
    add(b, h('h4', { class: 'sub', text: 'Building it' }));
    add(b, segRow('Formwork out', [['each', 'After each basket', 'Each basket must stand on its own before the next is started'], ['end', 'At the end', 'Rings stay on their formwork until every basket is up and bolted together']], () => o.strike, (v) => { setOpt('strike', v); if (n) app.rebuildBaskets('Rebuilt: formwork out ' + (v === 'end' ? 'at the end' : 'after each basket')); }),
      check('Bolt baskets together where rings meet', () => o.ties !== false, (v) => { setOpt('ties', v); if (n) app.rebuildBaskets(v ? 'Baskets bolted together where they meet' : 'Baskets stand apart'); }));
    add(b, app.ui.select('Layout', B.LAYOUTS.map((x) => [x[0], x[1]]), () => app.basketLayout, (v) => { app.basketLayout = v; }));
    add(b, h('div', { class: 'btns' }, btn(n ? 'Replace with this layout' : 'Build this layout', async () => { if (n && !(await app.confirm({ title: 'Replace the baskets?', text: 'The layout replaces the ' + n + ' baskets here; undo brings them back.', ok: 'Replace' }))) return; app.placeBasketLayout(app.basketLayout); app.frameAll(); }, n ? '' : 'primary', { disabled: seq || null }),
      btn('Remove all', () => app.removeAll(), 'danger', { disabled: seq || !app.W.model.rods.size || null })));
    // the skin: one layer of cladding over the whole structure
    const sk = skinNow(); const re = (patch, label) => setSkin(patch, label);
    add(b, h('h4', { class: 'sub', text: 'Cladding over the whole structure' }));
    add(b, h('div', { class: 'btns' }, btn(sk.on ? 'Take the cladding off' : 'Clad the whole structure', () => { if (!n) { app.toast('No baskets to clad yet'); return; } re({ on: !sk.on }, sk.on ? 'Cladding taken off' : 'Cladding laid over the whole structure: thin sticks running on from basket to basket, lashed where they cross'); }, sk.on ? '' : 'primary', { disabled: seq || !n || null })),
      select('Direction', B.CLAD_DIRS.map((x) => [x[0], x[1]]), () => sk.dir, (v) => re({ dir: v }, 'Cladding runs ' + (B.CLAD_DIRS.find((x) => x[0] === v) || [0, v])[1].toLowerCase())),
      hint((B.CLAD_DIRS.find((x) => x[0] === sk.dir) || B.CLAD_DIRS[3])[2] + '. One field runs over every basket, so the sticks carry on across where baskets meet.'),
      slider('Density', { min: 2, max: 30, step: 1, change: true, get: () => sk.density, set: (v) => re({ density: v }, 'Cladding rebuilt: ' + v + ' tries per m²'), fmt: (v) => v + ' per m²' }),
      slider('Angle', { min: 5, max: 85, step: 1, change: true, get: () => sk.angle, set: (v) => re({ angle: v }, 'Cladding rebuilt'), fmt: (v) => 'up to ' + v + '°' }),
      slider('Stick length', { min: 1, max: 5, step: 0.1, change: true, get: () => sk.len, set: (v) => re({ len: v }, 'Cladding rebuilt'), fmt: (v) => 'about ' + v.toFixed(1) + ' m' }),
      slider('Where baskets meet', { min: 0.05, max: 0.6, step: 0.05, change: true, get: () => sk.blend, set: (v) => re({ blend: v }, 'Cladding rebuilt'), fmt: (v) => 'rounded over ' + v.toFixed(2) + ' m' }),
      slider('Runs past', { min: 0, max: 1.5, step: 0.05, change: true, get: () => sk.reach, set: (v) => re({ reach: v }, 'Cladding rebuilt'), fmt: (v) => (v ? 'up to ' + v.toFixed(2) + ' m' : 'none') }),
      h('div', { class: 'btns' }, btn('Another pattern', () => re({ seed: 1 + Math.floor(Math.random() * 9999) }, 'Cladding laid in a new pattern'), '', { disabled: seq || !sk.on || null })),
      hint('Thin 10 × 20 mm sticks laid over the outside of the whole structure as one skin: where baskets meet it runs across the join instead of into the space between them. Each stick is lashed where it crosses a ring or stick (three lashings, four if it has to be soaked); sticks that would crack, bend tighter than a soaked stick goes, or overload the baskets are left off. It goes on last, once the baskets stand.'));
    add(b, hint('Each ring is one 18-20 mm pole, soaked, bent round its formwork, lapped and bolted. Rings go up one at a time, held on formwork, and the sticks are bolted in; then the formwork comes out. Scrub the build order below to watch each step settle.'));
    // material
    const mat = B.materials(app.W.model, app.design); const st = Object.assign(B.stock(), app.design.stock || {});
    add(b, h('h4', { class: 'sub', text: 'Material against stock' }));
    const tb = h('table', { class: 'cuttable' }); tb.append(h('tr', {}, h('th', { text: 'What' }), h('th', { text: 'Needs' }), h('th', { text: 'In stock' })));
    const keys = ['poles', 'sticks', 'thin', 'bolts', 'clamps'];
    mat.rows.forEach((r, i) => { const k = keys[i]; const inp = h('input', { type: 'number', min: 0, step: 1, value: st[k], 'aria-label': r.what + ' in stock', style: { width: '64px' }, onchange: () => { app.design.stock = Object.assign({}, st, { [k]: Math.max(0, +inp.value || 0) }); app.autosave(); app.renderBasketPanel(); } });
      const u = r.have ? r.need / r.have : 9; tb.append(h('tr', { class: r.need > r.have ? 'over' : '', title: r.note }, h('td', { class: 't', text: r.what }), h('td', {}, app.ui.statusEl(u, String(r.need))), h('td', {}, inp))); });
    add(b, tb, hint(mat.rings + ' rings, ' + fmt.n(mat.stickLen, 0) + ' m of sticks in ' + mat.sticks + ' pieces packed into 5 m lengths, ' + mat.bolts + ' bolts. Also in the yard: ' + st.uncut + ' uncut poles and the offcuts.' + (mat.splices ? ' Rings over 4.75 m round are spliced from several poles: ' + mat.splices + ' poles in spliced rings.' : '')));
    // limits
    const iss = B.issues(app.W.model);
    if (iss.length) { const crit = iss.filter((x) => x.level === 'crit').length; add(b, note('<b>' + (crit ? crit + ' beyond what the material does' : iss.length + ' to test first') + '.</b> ' + app.esc(iss[0].text) + (iss.length > 1 ? ' (and ' + (iss.length - 1) + ' more)' : ''), crit ? 'crit' : 'warn'), h('div', { class: 'btns' }, btn('Select them', () => app.setSel(iss.map((x) => x.id), [])))); }
    else if (n) add(b, note('Every ring is at least 1.2 m across and inside what has been bent, and no stick bends tighter than a soaked one can.', 'ok'));
  };

  // ---------------------------------------------------------------- the basket editor (selection)
  app.basketSel = function (b, rod) {
    const { slider, segRow, select, check, btn } = app.ui; const bk = list().find((q) => q.id === rod.bk); if (!bk) return; const seq = app.inSeq();
    const change = (k, label) => (v) => app.rebuildBaskets(null, (bs) => { const q = bs.find((x) => x.id === bk.id); q[k] = v; return { select: bk.id, rk: rod.rk || 0 }; }, { toast: false });
    const box = h('div', { class: 'basket-ed' });
    // one ring on its own: resize, tip, turn and shift it (kept as an edit on top of the basket's rule)
    const k = rod.rk || 0; const ed = (bk.ringEdits || {})[k] || {};
    const editRing = (key) => (v) => app.rebuildBaskets(null, (bs) => { const q = bs.find((x) => x.id === bk.id); q.ringEdits = q.ringEdits || {}; const e = q.ringEdits[k] = Object.assign({}, q.ringEdits[k], { [key]: v }); if (!v && key !== 'tilt') delete e[key]; return { select: bk.id, rk: k }; }, { toast: false });
    if (rod.kind === 'ring' && !seq) {
      const cur = (B.rings(bk)[k] || { C: rod.L });
      add(box, h('h4', { class: 'sub', text: 'This ring (' + (k + 1) + ' of ' + bk.rings + ')' }),
        slider('Size', { min: -1.3, max: 1.3, step: 0.05, change: true, get: () => ed.dC || 0, set: editRing('dC'), fmt: (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + ' m · ' + cur.C.toFixed(2) + ' m round' }),
        slider('Tip', { min: 0, max: 50, step: 1, change: true, get: () => (ed.tilt != null ? ed.tilt : (bk.tilt || 0)), set: editRing('tilt'), fmt: (v) => v + '°' }),
        slider('Tip turned', { min: -180, max: 180, step: 5, change: true, get: () => ed.az || 0, set: editRing('az'), fmt: (v) => v + '°' }),
        slider('Shift across', { min: -1, max: 1, step: 0.05, change: true, get: () => ed.dx || 0, set: editRing('dx'), fmt: (v) => v.toFixed(2) + ' m' }),
        slider('Shift back', { min: -1, max: 1, step: 0.05, change: true, get: () => ed.dz || 0, set: editRing('dz'), fmt: (v) => v.toFixed(2) + ' m' }),
        slider('Raise', { min: -0.4, max: 0.8, step: 0.05, change: true, get: () => ed.dy || 0, set: editRing('dy'), fmt: (v) => v.toFixed(2) + ' m' }),
        h('div', { class: 'btns' }, btn('Add a ring above', () => shiftRings(bk.id, k, +1)), bk.rings > 1 ? btn('Take this ring out', () => shiftRings(bk.id, k, -1)) : null),
        (bk.ringEdits && bk.ringEdits[k]) ? h('div', { class: 'btns' }, btn('Put this ring back', () => app.rebuildBaskets(null, (bs) => { const q = bs.find((x) => x.id === bk.id); if (q.ringEdits) delete q.ringEdits[k]; return { select: bk.id, rk: k }; }, { toast: false }))) : null,
        app.ui.hint('Changes here move only this ring; the sticks through it and the bolts where it crosses other rings are worked out again.'),
        h('h4', { class: 'sub', text: 'The whole basket' }));
    }
    add(box, h('div', { class: 'row two' }, h('span', { class: 'lab', html: '<b style="color:var(--ink)">Basket ' + bk.id + '</b>' }), h('span', { class: 'hint', text: bk.rings + ' rings · ' + (rod.kind === 'ring' ? 'ring ' + ((rod.rk || 0) + 1) + ' of ' + bk.rings + ', ' + ringLabel(rod.L) : rod.kind) })));
    if (!seq) {
      add(box, slider('Base ring', { min: L.cMin, max: L.cMax, step: 0.05, change: true, get: () => bk.C, set: change('C'), fmt: (v) => v.toFixed(2) + ' m round' + (B.ringPoles(v) > 1 ? ' · ' + B.ringPoles(v) + ' poles' : '') + (v > L.cTested ? ' · untested' : '') }),
        slider('Rings', { min: 1, max: L.maxRings, step: 1, change: true, get: () => bk.rings, set: change('rings') }),
        slider('Ring spacing', { min: 0.3, max: 1, step: 0.05, change: true, get: () => bk.gap, set: change('gap'), fmt: (v) => v.toFixed(2) + ' m' }),
        segRow('Profile', B.SHAPES, () => bk.shape, change('shape')),
        slider('Lean', { min: 0, max: 25, step: 1, change: true, get: () => bk.lean || 0, set: change('lean'), fmt: (v) => v + '°' }),
        slider('Leaning to', { min: 0, max: 359, step: 1, change: true, get: () => bk.az || 0, set: change('az'), fmt: (v) => v + '°' }),
        select('Bracing', B.BRACES.map((x) => [x[0], x[1]]), () => bk.brace, change('brace')),
        slider('Stick spacing', { min: 0.25, max: 0.9, step: 0.05, change: true, get: () => bk.spacing, set: change('spacing'), fmt: (v) => v.toFixed(2) + ' m' }),
        segRow('Top', TOPS, () => bk.top || 'open', change('top')),
        bk.top === 'point' ? slider('Point', { min: 0.4, max: 3, step: 0.05, change: true, get: () => (bk.apex != null ? bk.apex : 0.6 + 0.9 * (B.rings(bk).slice(-1)[0] || { C: bk.C }).C / TAU), set: change('apex'), fmt: (v) => v.toFixed(2) + ' m above the top ring' })
          : slider('Tops', { min: 0, max: 1.5, step: 0.05, change: true, get: () => bk.tops || 0, set: change('tops'), fmt: (v) => (v ? v.toFixed(2) + ' m' : 'none') }),
        segRow('Base', [['pegged', 'Pegged'], ['staked', 'Staked']], () => bk.ground || 'pegged', change('ground')),
        slider('Twist', { min: -60, max: 60, step: 1, change: true, get: () => bk.twist || 0, set: change('twist'), fmt: (v) => v + '° a ring' }),
        slider('Ring tip', { min: 0, max: 40, step: 1, change: true, get: () => bk.tilt || 0, set: change('tilt'), fmt: (v) => (v ? v + '°' : 'level') }),
        segRow('Tipping', B.TILTS, () => bk.tiltMode || 'same', change('tiltMode')),
        slider('Drift', { min: 0, max: 1, step: 0.05, change: true, get: () => bk.drift || 0, set: change('drift'), fmt: (v) => (v ? v.toFixed(2) + ' m' : 'none') }),
        check('Doorway', () => bk.door, change('door')),
        bk.door ? slider('Doorway faces', { min: 0, max: 359, step: 1, change: true, get: () => bk.doorAz || 0, set: change('doorAz'), fmt: (v) => v + '°' }) : null,
        slider('Move across', { min: -12, max: 12, step: 0.05, change: true, get: () => bk.x, set: change('x'), fmt: (v) => v.toFixed(2) + ' m' }),
        slider('Move back', { min: -12, max: 12, step: 0.05, change: true, get: () => bk.z, set: change('z'), fmt: (v) => v.toFixed(2) + ' m' }),
        h('div', { class: 'btns' }, btn('Stack a ring', () => stackOn(bk.id)), btn('Copy beside', () => app.rebuildBaskets(null, (bs) => { const nb = Object.assign(B.make({ baskets: bs, basketOpts: app.basketOpts() }, 0, 0, bk.C), JSON.parse(JSON.stringify(bk))); const id = 'B' + (Math.max(...bs.map((x) => parseInt(x.id.slice(1), 10) || 0)) + 1); Object.assign(nb, { id, x: bk.x + bk.C / Math.PI * 0.9, seed: (bk.seed || 3) + 11 }); bs.push(nb); app.toast('Basket ' + id + ' copied beside ' + bk.id); return { select: id, rk: 0 }; }, { toast: false })),
          btn('Remove basket', () => { app.rebuildBaskets('Basket ' + bk.id + ' removed', (bs) => { const i = bs.findIndex((x) => x.id === bk.id); if (i >= 0) bs.splice(i, 1); }); app.clearSel(); }, 'danger')));
    }
    add(b, box);
  };

  // ---------------------------------------------------------------- saving the sketch with the design
  const ser = app.serialise; app.serialise = function () { const o = ser(); if (app.sketch) o.design = Object.assign({}, o.design, { sketch: app.sketch }); return o; };
  const load = app.loadDesign; app.loadDesign = function (obj, opts) {
    const r = load(obj, opts); const s = obj && obj.design && obj.design.sketch;
    if (s && typeof s.src === 'string' && /^data:image\//.test(s.src)) { app.sketch = Object.assign({ w: 10, cx: 0, cz: 0, rot: 0, opacity: 0.6, plane: 'plan', show: true }, s); loadImage(s.src).then((im) => { app.sketchImg = im; showSketch(); if (app.renderBasketPanel) app.renderBasketPanel(); }).catch(() => { app.sketch = null; }); }
    else { app.sketch = null; app.sketchImg = null; showSketch(); }
    const d = obj && obj.design; if (d) { if (d.basketOpts && typeof d.basketOpts === 'object') app.design.basketOpts = Object.assign(B.opts(), d.basketOpts); if (d.stock && typeof d.stock === 'object') app.design.stock = Object.assign(B.stock(), d.stock); }
    return r;
  };
  void UP; void M;
})();
