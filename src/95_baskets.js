/* Weavefield — baskets in the app: the Basket tool (set out a basket of rings, stack rings on one), the Baskets panel
   (sketch underlay and ring finding, defaults for new baskets, the build, material against stock, tested limits) and
   the basket editor in the selection. */
(function () {
  'use strict';
  const app = window.WF; const { M, V, $, h, fmt } = app; const B = SF.Basket; const TAU = Math.PI * 2; const L = B.LIMITS;
  const UP = [0, 1, 0];
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
  app.placePile = function (quiet) { return app.rebuildBaskets(quiet ? null : 'A pile of seven baskets, built ring by ring', (bs) => { bs.length = 0; bs.push(...B.pile(app.design)); }, quiet ? { toast: false } : {}); };

  // ---------------------------------------------------------------- the Basket tool
  function stackOn(id) {
    const b = list().find((q) => q.id === id); if (!b) return;
    if ((b.rings || 1) >= 9) { app.toast('Nine rings is the most a basket takes here'); return; }
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
    app.rebuildBaskets(null, (bs) => { const nb = B.make({ baskets: bs, basketOpts: app.basketOpts() }, c[0], c[2], C); bs.push(nb); app.toast('Basket ' + nb.id + ' set out: ' + nb.rings + ' rings on a ' + ringLabel(C) + ' base' + (Math.abs(raw - C) > 0.05 ? '. Sized into the 3.7-5.0 m that can be bent' : ''), 4200); return { select: nb.id, rk: 0 }; });
    app.toolPreview();
  };
  function ringLines(b) { return B.rings(b).map((r) => { const pts = []; for (let i = 0; i <= 40; i++) pts.push(B.ringPoint(r, TAU * i / 40)); return pts; }); }
  app.ringPreview = function (pk) {
    const ts = app.ts; const acc = app.colors['accent-fill']; const o = app.basketOpts();
    if (ts.a) {
      const raw = sizeFrom(ts.a.p, pk.p); const C = B.clampC(raw); const b = Object.assign(B.make({ baskets: [], basketOpts: o }, ts.a.p[0], ts.a.p[2], C));
      V.setPreview(ringLines(b), acc); V.setMarks([]); ts.info = ringLabel(C) + (raw < L.cMin - 0.05 ? ' · the smallest ring that bends' : raw > L.cMax + 0.05 ? ' · the biggest a 5 m pole makes' : C > L.cTested ? ' · bigger than tested' : '');
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
    b.append(h('h4', { class: 'sub', text: 'Design from a sketch' }));
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { await addSketch(f); } catch (err) { app.toast(err.message); } } });
    b.append(file);
    if (!app.sketch) {
      b.append(h('div', { class: 'btns' }, btn('Add a sketch…', () => file.click(), 'primary')), hint('A photo or drawing of the plan: it lies under the design so you can trace rings on it with the <b>Basket</b> tool (<kbd>B</kbd>), or let Weavefield find the circles. An elevation stands up behind instead.'));
    } else {
      const s = app.sketch; const upd = () => { showSketch(); app.autosave(); };
      b.append(segRow('Sketch is', [['plan', 'Plan'], ['front', 'Elevation']], () => s.plane, (v) => { s.plane = v; upd(); V.view(v === 'plan' ? 'top' : 'front'); }),
        slider('Width', { min: 1, max: 40, step: 0.1, get: () => s.w, set: (v) => { s.w = v; upd(); }, fmt: (v) => v.toFixed(1) + ' m' }),
        slider('Opacity', { min: 0.1, max: 1, step: 0.05, get: () => s.opacity, set: (v) => { s.opacity = v; upd(); }, fmt: (v) => Math.round(v * 100) + '%' }),
        s.plane === 'plan' ? slider('Turn', { min: -180, max: 180, step: 1, get: () => s.rot || 0, set: (v) => { s.rot = v; upd(); }, fmt: (v) => v + '°' }) : null,
        slider('Across', { min: -15, max: 15, step: 0.05, get: () => s.cx, set: (v) => { s.cx = v; upd(); }, fmt: (v) => v.toFixed(2) + ' m' }),
        slider(s.plane === 'plan' ? 'Back' : 'Depth', { min: -15, max: 15, step: 0.05, get: () => s.cz, set: (v) => { s.cz = v; upd(); }, fmt: (v) => v.toFixed(2) + ' m' }),
        check('Show the sketch', () => s.show !== false, (v) => { s.show = v; upd(); }),
        h('div', { class: 'btns' }, s.plane === 'plan' ? btn('Find rings in the sketch', () => findRings(), 'primary', { disabled: seq || null }) : null, btn('Trace with the Basket tool', () => { app.setTool('ring'); V.view(s.plane === 'plan' ? 'top' : 'front'); }), btn('Replace…', () => file.click()), btn('Remove', () => { app.sketch = null; app.sketchImg = null; showSketch(); app.autosave(); app.renderBasketPanel(); })),
        hint(s.plane === 'plan' ? 'Circles drawn in the plan become baskets. The sketch is scaled so its biggest circle is the biggest ring a 5 m pole makes (1.6 m across); circles smaller than the tightest ring (1.17 m) are made that size. Crop the picture to the plan first, and remove any extra baskets with the Remove tool.' : 'Trace over the elevation with the Basket tool from the front view; use it to judge heights and how many rings to stack.'));
    }
    // defaults for new baskets
    b.append(h('h4', { class: 'sub', text: 'New baskets' }));
    b.append(slider('Rings', { min: 1, max: 7, step: 1, get: () => o.rings, set: (v) => setOpt('rings', v) }),
      slider('Ring spacing', { min: 0.3, max: 1, step: 0.05, get: () => o.gap, set: (v) => setOpt('gap', v), fmt: (v) => v.toFixed(2) + ' m' }),
      segRow('Profile', B.SHAPES, () => o.shape, (v) => setOpt('shape', v)),
      select('Bracing', B.BRACES.map((x) => [x[0], x[1]]), () => o.brace, (v) => { setOpt('brace', v); app.renderBasketPanel(); }),
      hint((B.BRACES.find((x) => x[0] === o.brace) || B.BRACES[0])[2] + '.'),
      slider('Stick spacing', { min: 0.25, max: 0.9, step: 0.05, get: () => o.spacing, set: (v) => setOpt('spacing', v), fmt: (v) => v.toFixed(2) + ' m' }),
      
      slider('Tops', { min: 0, max: 1.5, step: 0.05, get: () => o.tops, set: (v) => setOpt('tops', v), fmt: (v) => (v ? 'up to ' + v.toFixed(2) + ' m' : 'none') }),
      segRow('Base', [['pegged', 'Pegged', 'The base ring sits on the ground, pegged at four points'], ['staked', 'Staked', 'Sticks run into the ground; the base ring is held up on them']], () => o.ground, (v) => setOpt('ground', v)),
      check('Leave a doorway in each', () => o.door, (v) => setOpt('door', v)));
    b.append(h('div', { class: 'btns' }, btn('Apply to every basket', () => { if (!n) { app.toast('No baskets yet: use the Basket tool or a sketch'); return; } app.rebuildBaskets('Every basket rebuilt with these settings', (bs) => { for (const q of bs) Object.assign(q, { rings: o.rings, gap: o.gap, shape: o.shape, brace: o.brace, spacing: o.spacing, tops: o.tops, ground: o.ground, door: o.door }); }); }, '', { disabled: seq || null })));
    // build
    b.append(h('h4', { class: 'sub', text: 'Building it' }));
    b.append(segRow('Formwork out', [['each', 'After each basket', 'Each basket must stand on its own before the next is started'], ['end', 'At the end', 'Rings stay on their formwork until every basket is up and bolted together']], () => o.strike, (v) => { setOpt('strike', v); if (n) app.rebuildBaskets('Rebuilt: formwork out ' + (v === 'end' ? 'at the end' : 'after each basket')); }),
      check('Bolt baskets together where rings meet', () => o.ties !== false, (v) => { setOpt('ties', v); if (n) app.rebuildBaskets(v ? 'Baskets bolted together where they meet' : 'Baskets stand apart'); }));
    b.append(h('div', { class: 'btns' }, btn(n ? 'Replace with the sketch pile' : 'Pile of seven baskets', async () => { if (n && !(await app.confirm({ title: 'Replace the baskets?', text: 'The seven-basket pile replaces the ' + n + ' here; undo brings them back.', ok: 'Replace' }))) return; app.placePile(); app.frameAll(); }, n ? '' : 'primary', { disabled: seq || null }),
      n ? btn('Remove all baskets', () => app.rebuildBaskets('Baskets removed', (bs) => { bs.length = 0; }), 'danger', { disabled: seq || null }) : null));
    b.append(hint('Each ring is one 18-20 mm pole, soaked, bent round its formwork, lapped and bolted. Rings go up one at a time, held on formwork, and the sticks are bolted in; then the formwork comes out. Scrub the build order below to watch each step settle.'));
    // material
    const mat = B.materials(app.W.model, app.design); const st = Object.assign(B.stock(), app.design.stock || {});
    b.append(h('h4', { class: 'sub', text: 'Material against stock' }));
    const tb = h('table', { class: 'cuttable' }); tb.append(h('tr', {}, h('th', { text: 'What' }), h('th', { text: 'Needs' }), h('th', { text: 'In stock' })));
    const keys = ['poles', 'sticks', 'bolts', 'clamps'];
    mat.rows.forEach((r, i) => { const k = keys[i]; const inp = h('input', { type: 'number', min: 0, step: 1, value: st[k], 'aria-label': r.what + ' in stock', style: { width: '64px' }, onchange: () => { app.design.stock = Object.assign({}, st, { [k]: Math.max(0, +inp.value || 0) }); app.autosave(); app.renderBasketPanel(); } });
      const u = r.have ? r.need / r.have : 9; tb.append(h('tr', { class: r.need > r.have ? 'over' : '', title: r.note }, h('td', { class: 't', text: r.what }), h('td', {}, app.ui.statusEl(u, String(r.need))), h('td', {}, inp))); });
    b.append(tb, hint(mat.rings + ' rings, ' + fmt.n(mat.stickLen, 0) + ' m of sticks in ' + mat.sticks + ' pieces packed into 5 m lengths, ' + mat.bolts + ' bolts. Also in the yard: ' + st.uncut + ' uncut poles, ' + st.thin + ' thin 10 × 20 mm sticks and the offcuts.' + (mat.splices ? ' ' + mat.splices + ' rings over 4.75 m need a splice piece to lap.' : '')));
    // limits
    const iss = B.issues(app.W.model);
    if (iss.length) { const crit = iss.filter((x) => x.level === 'crit').length; b.append(note('<b>' + (crit ? crit + ' beyond what the material does' : iss.length + ' to test first') + '.</b> ' + app.esc(iss[0].text) + (iss.length > 1 ? ' (and ' + (iss.length - 1) + ' more)' : ''), crit ? 'crit' : 'warn'), h('div', { class: 'btns' }, btn('Select them', () => app.setSel(iss.map((x) => x.id), [])))); }
    else if (n) b.append(note('Every ring is 3.7-4.5 m round and no stick bends tighter than a soaked one can.', 'ok'));
  };

  // ---------------------------------------------------------------- the basket editor (selection)
  app.basketSel = function (b, rod) {
    const { slider, segRow, select, check, btn } = app.ui; const bk = list().find((q) => q.id === rod.bk); if (!bk) return; const seq = app.inSeq();
    const change = (k, label) => (v) => app.rebuildBaskets(null, (bs) => { const q = bs.find((x) => x.id === bk.id); q[k] = v; return { select: bk.id, rk: rod.rk || 0 }; }, { toast: false });
    const box = h('div', { class: 'basket-ed' });
    box.append(h('div', { class: 'row two' }, h('span', { class: 'lab', html: '<b style="color:var(--ink)">Basket ' + bk.id + '</b>' }), h('span', { class: 'hint', text: bk.rings + ' rings · ' + (rod.kind === 'ring' ? 'ring ' + ((rod.rk || 0) + 1) + ' of ' + bk.rings + ', ' + ringLabel(rod.L) : rod.kind) })));
    if (!seq) {
      box.append(slider('Base ring', { min: L.cMin, max: L.cMax, step: 0.05, change: true, get: () => bk.C, set: change('C'), fmt: (v) => v.toFixed(2) + ' m round' + (v > L.cTested ? ' · untested' : '') }),
        slider('Rings', { min: 1, max: 9, step: 1, change: true, get: () => bk.rings, set: change('rings') }),
        slider('Ring spacing', { min: 0.3, max: 1, step: 0.05, change: true, get: () => bk.gap, set: change('gap'), fmt: (v) => v.toFixed(2) + ' m' }),
        segRow('Profile', B.SHAPES, () => bk.shape, change('shape')),
        slider('Lean', { min: 0, max: 25, step: 1, change: true, get: () => bk.lean || 0, set: change('lean'), fmt: (v) => v + '°' }),
        slider('Leaning to', { min: 0, max: 359, step: 1, change: true, get: () => bk.az || 0, set: change('az'), fmt: (v) => v + '°' }),
        select('Bracing', B.BRACES.map((x) => [x[0], x[1]]), () => bk.brace, change('brace')),
        slider('Stick spacing', { min: 0.25, max: 0.9, step: 0.05, change: true, get: () => bk.spacing, set: change('spacing'), fmt: (v) => v.toFixed(2) + ' m' }),
        slider('Tops', { min: 0, max: 1.5, step: 0.05, change: true, get: () => bk.tops || 0, set: change('tops'), fmt: (v) => (v ? v.toFixed(2) + ' m' : 'none') }),
        segRow('Base', [['pegged', 'Pegged'], ['staked', 'Staked']], () => bk.ground || 'pegged', change('ground')),
        check('Doorway', () => bk.door, change('door')),
        bk.door ? slider('Doorway faces', { min: 0, max: 359, step: 1, change: true, get: () => bk.doorAz || 0, set: change('doorAz'), fmt: (v) => v + '°' }) : null,
        slider('Move across', { min: -12, max: 12, step: 0.05, change: true, get: () => bk.x, set: change('x'), fmt: (v) => v.toFixed(2) + ' m' }),
        slider('Move back', { min: -12, max: 12, step: 0.05, change: true, get: () => bk.z, set: change('z'), fmt: (v) => v.toFixed(2) + ' m' }),
        h('div', { class: 'btns' }, btn('Stack a ring', () => stackOn(bk.id)), btn('Copy beside', () => app.rebuildBaskets(null, (bs) => { const nb = Object.assign(B.make({ baskets: bs, basketOpts: app.basketOpts() }, 0, 0, bk.C), JSON.parse(JSON.stringify(bk))); const id = 'B' + (Math.max(...bs.map((x) => parseInt(x.id.slice(1), 10) || 0)) + 1); Object.assign(nb, { id, x: bk.x + bk.C / Math.PI * 0.9, seed: (bk.seed || 3) + 11 }); bs.push(nb); app.toast('Basket ' + id + ' copied beside ' + bk.id); return { select: id, rk: 0 }; }, { toast: false })),
          btn('Remove basket', () => { app.rebuildBaskets('Basket ' + bk.id + ' removed', (bs) => { const i = bs.findIndex((x) => x.id === bk.id); if (i >= 0) bs.splice(i, 1); }); app.clearSel(); }, 'danger')));
    }
    b.append(box);
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
