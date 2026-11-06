/* Weavefield — the inspector: tool options, the selection, starting frames and formwork, growth, feasibility checks,
   physics and materials, and the view; plus the colour legend in the 3D view. */
(function () {
  'use strict';
  const app = window.WF; const { M, PH, Mo, V, $, h, fmt } = app;
  const D = SF.Defaults;

  // ---------------------------------------------------------------- controls
  function slider(label, o) {
    const v = h('span', { class: 'v' }); const inp = h('input', { type: 'range', min: o.min, max: o.max, step: o.step || 'any', 'aria-label': label });
    inp.value = o.get(); const show = () => { v.textContent = o.fmt ? o.fmt(+inp.value) : inp.value; };
    inp.addEventListener('input', () => { show(); if (!o.change) o.set(+inp.value); });
    inp.addEventListener('change', () => { if (o.change) o.set(+inp.value); if (o.after) o.after(+inp.value); });
    show(); return h('div', { class: 'row' }, h('label', { text: label }), inp, v);
  }
  function seg(opts, get, set, label) {
    const box = h('div', { class: 'seg', role: 'group', 'aria-label': label || '' });
    const upd = () => { for (const b of box.children) b.setAttribute('aria-pressed', b.dataset.v === String(get()) ? 'true' : 'false'); };
    for (const [val, lab, title] of opts) box.append(h('button', { 'data-v': String(val), title: title || null, onclick: () => { set(val); upd(); } }, lab));
    upd(); return box;
  }
  const segRow = (label, opts, get, set) => h('div', { class: 'row two' }, h('span', { class: 'lab', text: label }), seg(opts, get, set, label));
  function select(label, opts, get, set) {
    const s = h('select', { 'aria-label': label, onchange: () => set(s.value) }); for (const [val, lab] of opts) s.append(h('option', { value: val, text: lab })); s.value = get();
    return h('div', { class: 'row two' }, h('label', { text: label }), s);
  }
  function check(label, get, set) { const id = 'c' + Math.random().toString(36).slice(2, 8); const c = h('input', { type: 'checkbox', id, onchange: () => set(c.checked) }); c.checked = !!get(); return h('div', { class: 'row chk' }, c, h('label', { for: id, text: label })); }
  const btn = (label, fn, cls, attrs) => h('button', Object.assign({ class: 'ib ' + (cls || ''), onclick: fn }, attrs || {}), label);
  const hint = (t) => h('p', { class: 'hint', html: t });
  const note = (t, cls) => h('p', { class: 'note ' + (cls || ''), html: t });
  const kv = (pairs) => { const dl = h('dl', { class: 'kv' }); for (const [k, v] of pairs) { if (v == null) continue; dl.append(h('dt', { text: k }), h('dd', typeof v === 'string' ? { text: v } : {}, typeof v === 'string' ? null : v)); } return dl; };
  const status = (u) => (u > 1 ? 'crit' : u > 0.8 ? 'warn' : 'ok');
  const statusEl = (u, txt) => h('span', { class: 'status ' + status(u), text: txt });
  Object.assign(app, { ui: { slider, seg, segRow, select, check, btn, hint, note, kv, status, statusEl } });
  const PROFILE_OPTS = [['frame', 'Frame', 'Steam-bent timber member: keeps the shape it is placed in'], ['stick', 'Stick', 'Timber stick bent cold: springs back'], ['weave', 'Weave', 'Rattan weaver: thin and flexible']];
  const SOCKET_OPTS = [['tangent', 'Clamped', 'Set in the ground along the rod: resists turning'], ['vertical', 'Upright', 'Set in the ground standing up'], ['pin', 'Pinned', 'Pegged at a point: free to turn']];
  const profileRow = (o) => segRow('Profile', PROFILE_OPTS, () => o.profile, (v) => { o.profile = v; app.saveUI(); app.toolPreview(); });
  const bundleRow = (o) => slider('Bundle', { min: 1, max: 6, step: 1, get: () => o.bundle, set: (v) => { o.bundle = v; app.saveUI(); }, fmt: (v) => (v === 1 ? 'single' : '× ' + v) });

  // ---------------------------------------------------------------- panel scaffolding
  const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>';
  const DEFAULT_OPEN = { tool: true, sel: true, start: true, grow: true, checks: true, physics: false, view: false };
  const panels = {};
  function panel(id, title, render, cls) {
    const open = app.panelsOpen && app.panelsOpen[id] != null ? app.panelsOpen[id] : DEFAULT_OPEN[id];
    const sec = h('section', { class: 'panel ' + (cls || '') + (open ? '' : ' closed'), 'data-panel': id });
    const badge = h('span', { class: 'badge', hidden: true }); const hdr = h('header', { role: 'button', tabindex: '0', 'aria-expanded': open ? 'true' : 'false' }, h('h3', { text: title }), badge); hdr.insertAdjacentHTML('beforeend', CHEV);
    const body = h('div', { class: 'body' }); sec.append(hdr, body);
    const toggle = () => { sec.classList.toggle('closed'); const o = !sec.classList.contains('closed'); hdr.setAttribute('aria-expanded', o ? 'true' : 'false'); app.panelsOpen = Object.assign({}, app.panelsOpen || {}, { [id]: o }); app.saveUI(); if (o) panels[id].render(); };
    hdr.addEventListener('click', toggle); hdr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    panels[id] = { sec, body, badge, hdr, render: () => { if (sec.classList.contains('closed') && id !== 'sel') return; body.innerHTML = ''; render(body, badge); } };
    return sec;
  }
  app.buildInspector = function () {
    const ins = $('#inspector'); const top = ins.scrollTop; ins.innerHTML = '';
    ins.append(panel('tool', 'Tool', renderTool, 'toolpanel'), panel('sel', 'Selection', renderSel), panel('start', 'Start', renderStart), panel('grow', 'Grow', renderGrow),
      panel('checks', 'Checks', renderChecks), panel('physics', 'Physics & materials', renderPhysics), panel('view', 'View', renderView));
    for (const k in panels) panels[k].render(); ins.scrollTop = top; app.renderSelection(); app.renderLegend();
  };
  // panels are not rebuilt under a pressed pointer or while someone types in them (a click would be lost); they catch up after
  function busy() { if (app.uiBusy) return true; const a = document.activeElement; return !!(a && $('#inspector').contains(a) && ((a.tagName === 'INPUT' && a.type !== 'range' && a.type !== 'checkbox') || a.tagName === 'TEXTAREA')); }
  function later() { if (!app.pendingRefresh) return; app.pendingRefresh = false; setTimeout(() => app.refreshPanels(), 0); }
  if (!app.busyWired) {
    app.busyWired = true;
    $('#inspector').addEventListener('pointerdown', () => { app.uiBusy = true; }, true);
    const up = () => { if (!app.uiBusy) return; app.uiBusy = false; setTimeout(later, 0); };
    window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
    $('#inspector').addEventListener('focusout', () => setTimeout(later, 0));
  }
  app.renderToolPanel = () => panels.tool && panels.tool.render();
  app.renderGrowPanel = () => { if (busy()) { app.pendingRefresh = true; return; } if (panels.grow) panels.grow.render(); };
  app.refreshPanels = function () { if (busy()) { app.pendingRefresh = true; return; } for (const k of ['checks', 'start']) if (panels[k]) panels[k].render(); app.renderSelection(); if (panels.grow) panels.grow.render(); app.updateStats(); };
  app.updateStats = function () { const w = app.W; if (!w || !w.sim || !w.model.rods.size) { renderStats(null); return; } const S = SF.Checks.summary(w); renderStats(S); };
  // cheap refresh while the structure moves: only the numbers in the selection change, the panel is not rebuilt
  const selKey = () => Array.from(app.sel.rods).sort().join(',') + '|' + Array.from(app.sel.joints).sort().join(',');
  let lastLive = 0; app.refreshLive = function () { const now = performance.now(); if (now - lastLive < 500) return; lastLive = now; const p = panels.sel; if (!p || !(app.sel.rods.size + app.sel.joints.size)) return; if (p.live && p.key === selKey()) p.live(); else app.renderSelection(); };
  app.renderSelection = function () { const p = panels.sel; if (!p) return; const n = app.sel.rods.size + app.sel.joints.size; p.sec.hidden = !n; if (!n) return; if (busy()) { app.pendingRefresh = true; return; } p.live = null; p.key = selKey(); p.render(); };

  // ---------------------------------------------------------------- tool
  function renderTool(b) {
    const T = app.TOOLS[app.tool]; const o = app.opt[app.tool];
    b.append(h('div', { class: 'row two' }, h('span', { class: 'lab', html: `<b style="color:var(--ink)">${T.label}</b>` }), h('span', { class: 'hint', text: T.tip })));
    if (app.tool === 'select') b.append(hint('Click a rod or a lashing. Shift-click adds to the selection, <kbd>Delete</kbd> removes it. Drag to orbit, right-drag to pan, scroll to zoom.'));
    if (app.tool === 'arch') {
      b.append(profileRow(o), bundleRow(o), segRow('Length', [['slack', '× span'], ['fixed', 'Metres']], () => o.lenMode, (v) => { o.lenMode = v; app.saveUI(); app.renderToolPanel(); }));
      b.append(o.lenMode === 'slack' ? slider('Rod / span', { min: 1.05, max: 2.2, step: 0.05, get: () => o.slack, set: (v) => { o.slack = v; app.saveUI(); }, fmt: (v) => '× ' + v.toFixed(2) }) : slider('Rod length', { min: 1, max: 14, step: 0.1, get: () => o.length, set: (v) => { o.length = v; app.saveUI(); }, fmt: (v) => v.toFixed(1) + ' m' }));
      b.append(segRow('In the ground', SOCKET_OPTS, () => o.socket, (v) => { o.socket = v; app.saveUI(); }), hint('The rod is longer than the gap, so it buckles into an arch, exactly as a bent stick would. Ends on a rod are lashed; ends on the ground are set in sockets.'));
    }
    if (app.tool === 'loop') b.append(profileRow(o), bundleRow(o), slider('Rod length', { min: 1.5, max: 10, step: 0.1, get: () => o.length, set: (v) => { o.length = v; app.saveUI(); }, fmt: (v) => v.toFixed(1) + ' m' }),
      slider('Feet apart', { min: 0, max: 1.5, step: 0.05, get: () => o.feet, set: (v) => { o.feet = v; app.saveUI(); }, fmt: (v) => v.toFixed(2) + ' m' }), slider('Lean', { min: -60, max: 60, step: 1, get: () => o.tilt, set: (v) => { o.tilt = v; app.saveUI(); }, fmt: (v) => v + '°' }),
      hint('A rod bent round into a teardrop with both feet at the point you click: lashed to the rod there, or set in the ground.'));
    if (app.tool === 'hoop') b.append(profileRow(o), bundleRow(o), o.plane === 'ring' ? hint('<b>Ring round</b> sizes the hoop to the structure at the height you click; on the ground, or with Flat and Upright, it uses this circumference:') : null, slider('Circumference', { min: 2, max: 14, step: 0.1, get: () => o.length, set: (v) => { o.length = v; app.saveUI(); }, fmt: (v) => v.toFixed(1) + ' m (⌀ ' + (v / Math.PI).toFixed(1) + ')' }),
      segRow('On a rod', [['ring', 'Ring round', 'A flat ring round the whole structure at the height you click, sized to pass through that point'], ['flat', 'Flat'], ['upright', 'Upright']], () => o.plane, (v) => { o.plane = v; app.saveUI(); app.renderToolPanel(); }), slider('Lash within', { min: 0.1, max: 1.5, step: 0.05, get: () => o.attach, set: (v) => { o.attach = v; app.saveUI(); }, fmt: (v) => v.toFixed(2) + ' m' }),
      hint('The preview marks where it will be lashed. A hoop needs two lashings or more to hang still; on open ground it stands upright and falls unless something holds it.'));
    if (app.tool === 'rod') b.append(profileRow(o), bundleRow(o), segRow('In the ground', SOCKET_OPTS, () => o.socket, (v) => { o.socket = v; app.saveUI(); }), hint('Points on rods are lashed; points on the ground at the ends become sockets. The path is only a first guess: the rod relaxes from it.'));
    if (app.tool === 'weave') b.append(profileRow(o), bundleRow(o), slider('Weavers', { min: 1, max: 20, step: 1, get: () => o.count, set: (v) => { o.count = v; app.saveUI(); } }), slider('Slack', { min: 1.02, max: 1.8, step: 0.01, get: () => o.slack, set: (v) => { o.slack = v; app.saveUI(); }, fmt: (v) => '× ' + v.toFixed(2) }),
      segRow('Pattern', [['parallel', 'Parallel'], ['diagonal', 'Diagonal']], () => o.pattern, (v) => { o.pattern = v; app.saveUI(); }), hint('Weavers spring across between the two rods, bulging away from the structure. Diagonal crosses them and lashes them where they meet.'));
    if (app.tool === 'lash') b.append(note(`Lashings are springs (${(app.W.P.material.joint_stiffness / 1000).toFixed(0)} kN/m) between a point on each rod. Each is rated for <b>${app.W.P.material.joint_capacity_n} N</b> and slips at ${app.W.P.material.slip_factor}× that. Two points apart are pulled together.`));
    if (app.tool === 'grow') b.append(slider('Sticks', { min: 1, max: 60, step: 1, get: () => o.count, set: (v) => { o.count = v; app.saveUI(); } }), slider('Radius', { min: 0.5, max: 4, step: 0.1, get: () => o.r, set: (v) => { o.r = v; app.saveUI(); app.toolPreview(); }, fmt: (v) => v.toFixed(1) + ' m' }),
      hint('Sticks start on rods inside the sphere and follow their family’s flow; the families and rules in <b>Grow</b> apply.'));
    if (app.tool === 'pull') b.append(note('Drag a point of any rod that is free to move. The label shows the force your hand needs; release and it springs back. Lashings carrying more than their slip load while you pull come undone.'));
    if (app.tool === 'remove') b.append(hint('Click a rod or a lashing to remove it. Everything relaxes again without it.'));
  }

  // ---------------------------------------------------------------- selection
  const KIND = { stick: 'Stick', frame: 'Frame member', arch: 'Arch', loop: 'Loop', hoop: 'Hoop', rod: 'Rod', weave: 'Weaver', pole: 'Ground pole', post: 'Temporary post', ridge: 'Ridge' };
  const CLASS_LABEL = { cold: 'Bent cold (springs back)', soak: 'Soaked and pre-bent', steam: 'Steam-bent to shape', straight: 'Straight', pole: 'Staked on the ground' };
  function renderSel(b) {
    const w = app.W; const sim = app.activeSim(); const rods = Array.from(app.sel.rods).filter((id) => w.model.rods.has(id)); const joints = Array.from(app.sel.joints);
    if (rods.length + joints.length > 1) {
      b.append(h('p', { class: 'note', text: `${rods.length ? rods.length + (rods.length === 1 ? ' rod' : ' rods') : ''}${rods.length && joints.length ? ' and ' : ''}${joints.length ? joints.length + (joints.length === 1 ? ' lashing' : ' lashings') : ''} selected` }));
      b.append(h('div', { class: 'btns' }, btn('Remove', () => app.removeSelected(), 'danger', { disabled: app.inSeq() || null }), btn('Clear', () => app.clearSel()))); return;
    }
    const st = sim ? app.stressOf(sim) : null;
    if (rods.length === 1) {
      const r = w.model.rods.get(rods[0]); const e = sim && sim.index.get(r.id); const k = e ? e.k : -1; const sp = PH.sectionOf(w.model.material, r);
      const fam = r.fam ? app.design.families.find((f) => f.id === r.fam) : null; const cls = app.rodClass(r, sp);
      const nl = w.model.joints.filter((j) => j.a === r.id || j.b === r.id).length;
      b.append(h('div', { class: 'row two' }, h('span', { class: 'lab', html: `<b style="color:var(--ink)">${KIND[r.kind] || 'Rod'}</b> <span class="mono">${r.id}</span>` }), h('span', { class: 'hint', text: fam ? fam.name + ' (' + fam.id + ')' : r.temp ? 'struck when the formwork comes out' : r.held ? 'on scaffolding' : '' })));
      const vPeak = h('span'), vS = h('span'), vF = h('span'), vL = h('span');
      const upd = () => {
        const s2 = app.activeSim(); const t = s2 ? app.stressOf(s2) : null; const e2 = s2 && s2.index.get(r.id); const k2 = e2 ? e2.k : -1; const u = t && k2 >= 0 ? t.rodMax[k2] : null;
        vPeak.replaceChildren(u == null ? '—' : statusEl(u, fmt.pct(u) + ' of strength')); vS.textContent = t && k2 >= 0 ? fmt.MPa(t.rodStress[k2]) : '—'; vF.textContent = t && k2 >= 0 ? fmt.MPa(t.rodForm[k2]) : '—'; vL.textContent = t && k2 >= 0 ? fmt.MPa(t.rodLoad[k2]) : '—';
      };
      upd(); panels.sel.live = upd; void k; void st;
      b.append(kv([
        ['Profile', String((PH.profiles(w.model.material)[sp.profile] || {}).label || sp.profile).split(' · ')[0] + ' · ' + sp.section_mm + ' mm' + (sp.bundle > 1 ? ' × ' + sp.bundle : '')],
        ['Length', fmt.m(r.L) + (r.L > w.model.material.max_rod_m && r.kind !== 'pole' ? ' (over stock)' : '')],
        ['Bending', CLASS_LABEL[cls] || cls], ['Built at stage', String(r.stage)], ['Lashings', String(nl)], ['Ground sockets', String((r.fix || []).length)],
        ['Peak stress', vPeak], ['Stress', vS], ['Bent into place', vF], ['Added by loads', vL]
      ]));
      if (!app.inSeq()) {
        const setProp = (fn, label) => app.edit(label, (m) => { const q = m.rods.get(r.id); if (q) fn(q); }, { members: r.kind !== 'stick', toast: false });
        b.append(h('div', { class: 'row two' }, h('span', { class: 'lab', text: 'Profile' }), seg(PROFILE_OPTS.concat([['pole', 'Pole']]), () => sp.profile, (v) => setProp((q) => { if (v === 'stick') delete q.profile; else q.profile = v; }), 'Profile')));
        b.append(h('div', { class: 'btns' },
          btn('Bundle −', () => setProp((q) => { q.bundle = Math.max(1, (q.bundle || 1) - 1); if (q.bundle === 1) delete q.bundle; }), '', { disabled: sp.bundle <= 1 || null }),
          btn('Bundle +', () => setProp((q) => { q.bundle = Math.min(12, (q.bundle || 1) + 1); })),
          btn(r.held ? 'Let go' : 'Hold in place', () => setProp((q) => { if (q.held) delete q.held; else q.held = true; q.v = (q.v || 0) + 1; }), '', { title: 'Holding fixes every point of the rod, as scaffolding would' }),
          btn('Remove', () => app.removeSelected(), 'danger')));
      }
      return;
    }
    if (joints.length === 1) {
      const j = w.model.joints.find((q) => q.id === joints[0]); if (!j) { b.append(hint('That lashing is gone.')); return; }
      const wr = j.wraps || 1; const cap = w.model.material.joint_capacity_n * wr; const vC = h('span');
      const upd = () => { const s2 = app.activeSim(); const ji = s2 ? s2.jointIds.indexOf(j.id) : -1; const f = ji >= 0 ? s2.jointF[ji] : null; vC.replaceChildren(f == null ? (app.inSeq() ? 'not tied yet' : '—') : statusEl(f / cap, fmt.N(f) + ' · ' + fmt.pct(f / cap) + ' of capacity')); };
      upd(); panels.sel.live = upd;
      b.append(h('div', { class: 'row two' }, h('span', { class: 'lab', html: `<b style="color:var(--ink)">Lashing</b> <span class="mono">${j.id}</span>` }), h('span', { class: 'hint', text: j.a + ' to ' + j.b })));
      b.append(kv([['Carries', vC], ['Bound', wr === 1 ? 'once' : wr + ' times'], ['Capacity', fmt.N(cap)], ['Slips at', fmt.N(cap * w.model.material.slip_factor)], ['Built at stage', String(j.stage)], ['Stiffness', ((j.k || w.model.material.joint_stiffness) * wr / 1000).toFixed(0) + ' kN/m']]));
      const bind = (n) => app.edit(null, (m) => { const q = m.joints.find((x) => x.id === j.id); if (q) { if (n > 1) q.wraps = n; else delete q.wraps; } }, { members: false, toast: false });
      if (!app.inSeq()) b.append(h('div', { class: 'btns' }, btn('Bind once more', () => bind(wr + 1), '', { disabled: wr >= 4 || null, title: 'Each binding adds the capacity and stiffness of one lashing' }), wr > 1 ? btn('Bind less', () => bind(wr - 1)) : null, btn('Remove', () => app.removeSelected(), 'danger')));
    }
  }

  // ---------------------------------------------------------------- start: frames, formwork, hoops, ties
  app.placeFrame = function (over) {
    const f = Object.assign({}, app.opt.frame, over || {});
    const out = app.edit(null, (m, s) => Mo.frame(m, { type: f.type, span: f.span, length: f.length, profile: f.profile, bundle: f.bundle, count: f.type === 'dome' ? f.count : f.type === 'tunnel' ? f.count + 1 : undefined, spacing: f.type === 'tunnel' ? f.span * 0.42 : undefined }, s));
    if (out) { app.toast(({ cross: 'Cross', dome: 'Dome', tunnel: 'Tunnel', tripod: 'Tripod' })[f.type] + ' frame sprung: ' + out.length + ' rods of ' + fmt.m(f.length, 1) + ' over ' + fmt.m(f.span, 1)); setTimeout(app.frameAll, 50); }
  };
  app.placeLayout = function (id, quiet) {
    const P = SF.Formwork.PRESETS.find((q) => q.id === id) || SF.Formwork.PRESETS[0]; const els = P.els();
    const taken = new Set((app.design.formworkEls || []).map((e) => e.id)); for (const el of els) { let n = el.id, k = 2; while (taken.has(n)) n = el.id + '_' + k++; el.id = n; taken.add(n); }
    const out = app.edit(null, (m, s) => { app.design.formworkEls = (app.design.formworkEls || []).concat(els); return Mo.fromFormwork(m, SF.Formwork.build(els), s); });
    if (out && !quiet) { const held = out.filter((r) => r.held).length, temp = out.filter((r) => r.temp).length; app.toast(P.label.split(':')[0] + ' placed as ' + out.length + ' members' + (held ? ', ' + held + ' on scaffolding' : '') + (temp ? ', ' + temp + ' temporary posts' : '') + '. Grow sticks on it next.', 4500); }
    setTimeout(app.frameAll, 50);
  };
  function renderStart(b) {
    const w = app.W; const o = app.opt.frame; const seq = app.inSeq();
    b.append(h('h4', { class: 'sub', text: 'Starter frames' }), seg([['cross', 'Cross'], ['dome', 'Dome'], ['tunnel', 'Tunnel'], ['tripod', 'Tripod']], () => o.type, (v) => { o.type = v; app.saveUI(); panels.start.render(); }, 'Frame type'));
    b.append(slider('Span', { min: 2, max: 10, step: 0.1, get: () => o.span, set: (v) => { o.span = v; app.saveUI(); }, fmt: (v) => v.toFixed(1) + ' m' }), slider('Rod length', { min: 3, max: 14, step: 0.1, get: () => o.length, set: (v) => { o.length = v; app.saveUI(); }, fmt: (v) => v.toFixed(1) + ' m' }));
    if (o.type === 'dome' || o.type === 'tunnel') b.append(slider(o.type === 'dome' ? 'Arches' : 'Hoops', { min: 2, max: 6, step: 1, get: () => o.count, set: (v) => { o.count = v; app.saveUI(); } }));
    b.append(segRow('Profile', PROFILE_OPTS.slice(0, 2), () => o.profile, (v) => { o.profile = v; app.saveUI(); }), bundleRow(o));
    b.append(h('div', { class: 'btns' }, btn('Spring the frame', () => app.placeFrame(), 'primary', { disabled: seq || null })), hint('Rods longer than the span, set in ground sockets, spring into arches: their shape comes from the physics, as in Basketry. Frames are placed at the centre of the ground.'));
    b.append(h('h4', { class: 'sub', text: 'Formwork layouts' }), select('Layout', SF.Formwork.PRESETS.map((p) => [p.id, p.label]), () => app.opt.layout, (v) => { app.opt.layout = v; app.saveUI(); }));
    b.append(h('div', { class: 'btns' }, btn('Place as members', () => app.placeLayout(app.opt.layout), '', { disabled: seq || null })), hint('Stickfield’s formwork: ground poles are staked, hoops and arches become steam-bent members set where they meet the ground, members off the ground stand on scaffolding, and posts are temporary.'));
    const held = Array.from(w.model.rods.values()).filter((r) => r.held).length, temp = Array.from(w.model.rods.values()).filter((r) => r.temp).length;
    if (held || temp) b.append(note(`<b>${held ? held + ' on scaffolding' : ''}${held && temp ? ', ' : ''}${temp ? temp + ' temporary post' + (temp === 1 ? '' : 's') : ''}.</b> Strike the formwork when the sticks are in: the structure then has to stand on its own.`, 'warn'),
      h('div', { class: 'btns' }, btn('Strike the formwork', () => { const r = app.edit(null, (m, s) => Mo.release(m, s)); if (r) app.toast((r.struck.length ? r.struck.length + (r.struck.length === 1 ? ' post struck' : ' posts struck') : '') + (r.struck.length && r.held.length ? ', ' : '') + (r.held.length ? r.held.length + (r.held.length === 1 ? ' member let go' : ' members let go') : '') + '. Watch it settle.', 4200); }, '', { disabled: seq || null })));
    const sc = app.opt.scatter, jn = app.opt.join;
    b.append(h('h4', { class: 'sub', text: 'Drop hoops' }), slider('Hoops', { min: 1, max: 30, step: 1, get: () => sc.count, set: (v) => { sc.count = v; app.saveUI(); } }), slider('Circumference', { min: 3, max: 10, step: 0.1, get: () => sc.length, set: (v) => { sc.length = v; app.saveUI(); }, fmt: (v) => v.toFixed(1) + ' m' }));
    b.append(h('div', { class: 'btns' }, btn('Drop hoops', () => { let kept = 0; app.edit(null, (m, s) => { const r = Mo.scatterHoops(m, { count: sc.count, length: sc.length, seed: 1 + Math.floor(Math.random() * 9999) }, s); kept = r.length; return r; }); app.toast(kept + ' of ' + sc.count + ' hoops caught on the structure (each needs two lashings); the rest fell through.', 4200); }, '', { disabled: seq || !w.model.rods.size || null })),
      hint('Hoops dropped at random through the structure, kept where they catch on two rods or more (Basketry’s scatter).'));
    b.append(h('h4', { class: 'sub', text: 'Tie crossings' }), slider('Within', { min: 0.03, max: 0.6, step: 0.01, get: () => jn.radius, set: (v) => { jn.radius = v; app.saveUI(); }, fmt: (v) => fmt.cm(v) }));
    b.append(h('div', { class: 'btns' }, btn('Lash all crossings', () => { let n = 0; app.edit(null, (m, s) => { const ids = Array.from(m.rods.values()).filter((r) => r.kind !== 'pole').map((r) => r.id); const r = Mo.autoJoin(m, ids, { radius: jn.radius, perRod: 10, spacing: 0.45, perPair: 2 }, s); n = r.length; return null; }, { members: false }); app.toast(n ? n + ' new lashings where rods pass within ' + fmt.cm(jn.radius) : 'No unlashed crossings within ' + fmt.cm(jn.radius)); }, '', { disabled: seq || !w.model.rods.size || null }),
      btn('Clear everything', async () => { if (await app.confirm({ title: 'Clear everything?', text: 'Every rod and lashing goes. Undo brings it back.', ok: 'Clear', danger: true })) { app.edit('Cleared', (m) => { Mo.remove(m, Array.from(m.rods.keys()), []); m.meta.events = []; app.design.formworkEls = []; }); app.updateEmpty(); } }, 'danger', { disabled: seq || !w.model.rods.size || null })));
  }

  // ---------------------------------------------------------------- grow
  const REJ = { site: 'no free start', field: 'off the flow', short: 'too short', open: 'through an opening', contacts: 'held in fewer than two places', dense: 'too crowded', ground: 'meets the ground badly', tight: 'too tight to bend' };
  function renderGrow(b) {
    const w = app.W; const A = w.P.grow; const fams = app.design.families; const g = w.grow; const growing = g && !g.done;
    for (const f of fams) {
      const sw = h('span', { class: 'sw', style: { background: app.colors[app.famColorName(f.id)] } });
      const en = h('input', { type: 'checkbox', 'aria-label': 'Grow ' + f.name, onchange: () => { f.enabled = en.checked; app.autosave(); panels.grow.render(); } }); en.checked = !!f.enabled;
      const pre = h('select', { 'aria-label': f.name + ' flow', onchange: () => { f.preset = pre.value; app.W.fwDirty = true; app.autosave(); if (app.view.flow) app.updateFlow(); } }); for (const p of D.PRESETS_FLOW) pre.append(h('option', { value: p.id, text: p.label })); pre.value = f.preset;
      b.append(h('div', { class: 'fam' + (f.enabled ? '' : ' off') }, en, sw, h('span', { class: 'nm', text: f.name }), pre));
      const ty = h('select', { 'aria-label': f.name + ' type', onchange: () => { f.type = ty.value; app.autosave(); } }); for (const [v, l] of D.STICK_TYPES) ty.append(h('option', { value: v, text: l })); ty.value = f.type || 'bent';
      const pr = h('select', { 'aria-label': f.name + ' profile', onchange: () => { f.profile = pr.value; app.autosave(); } }); for (const [v, l] of [['stick', 'Stick'], ['weave', 'Weave'], ['frame', 'Frame']]) pr.append(h('option', { value: v, text: l })); pr.value = f.profile || 'stick';
      const sh = h('input', { type: 'range', min: 0, max: 2, step: 0.05, 'aria-label': f.name + ' share' }); sh.value = f.share; const shv = h('span', { class: 'v', text: f.share.toFixed(2) });
      sh.addEventListener('input', () => { f.share = +sh.value; shv.textContent = f.share.toFixed(2); }); sh.addEventListener('change', () => app.autosave());
      b.append(h('div', { class: 'famsub' }, h('span'), ty, pr, h('span'), h('span'), h('span', { class: 'hint', text: 'Share' }), sh, shv));
    }
    b.append(h('h4', { class: 'sub', text: 'Rules' }));
    const p = (k, label, min, max, step, f) => slider(label, { min, max, step, get: () => A[k], set: (v) => { A[k] = v; if (k === 'lenMin' && A.lenMax < v + 0.2) A.lenMax = v + 0.2; if (k === 'lenMax' && A.lenMin > v - 0.2) A.lenMin = Math.max(0.6, v - 0.2); app.autosave(); }, after: () => { if (k === 'count' || k === 'lenMin' || k === 'lenMax') panels.grow.render(); }, fmt: f });
    b.append(p('count', 'Sticks', 5, 400, 1), p('batch', 'Per batch', 1, 20, 1, (v) => v + ' then settle'), p('lenMin', 'Shortest', 0.6, 4, 0.1, (v) => v.toFixed(1) + ' m'), p('lenMax', 'Longest', 1, 7.5, 0.1, (v) => v.toFixed(1) + ' m'),
      p('reach', 'Reach', 0.4, 3.5, 0.1, (v) => v.toFixed(1) + ' m'), p('overhang', 'Free ends', 0, 1.2, 0.05, (v) => v.toFixed(2) + ' m'), p('tieRadius', 'Lash within', 0.02, 0.25, 0.01, (v) => fmt.cm(v)), p('tieSpacing', 'Lash spacing', 0.2, 1.2, 0.05, (v) => v.toFixed(2) + ' m'));
    b.append(segRow('Pre-bend', [['auto', 'When needed'], ['always', 'Always'], ['never', 'Never']], () => A.prebend, (v) => { A.prebend = v; app.autosave(); }));
    b.append(check('Sticks may meet the ground (steep feet only)', () => A.ground, (v) => { A.ground = v; app.autosave(); }), check('Keep hoop openings clear', () => A.openings, (v) => { A.openings = v; app.autosave(); }));
    b.append(h('div', { class: 'row' }, h('label', { text: 'Seed' }), h('input', { type: 'number', min: 1, max: 99999, value: A.seed, 'aria-label': 'Seed', onchange: (e) => { A.seed = Math.max(1, Math.round(+e.target.value || 1)); app.autosave(); } }), btn('New', () => { A.seed = 1 + Math.floor(Math.random() * 99999); app.autosave(); panels.grow.render(); }, 'sm')));
    if (growing) b.append(h('div', { class: 'progress' }, h('i', { style: { width: (100 * g.placed / g.count).toFixed(0) + '%' } })), h('div', { class: 'btns' }, btn('Stop growing', () => app.stopGrowth(), 'primary'), h('span', { class: 'hint mono', text: g.placed + ' of ' + g.count + ' · batch ' + g.batches })));
    else b.append(h('div', { class: 'btns' }, btn('Grow ' + A.count + ' sticks', () => app.startGrowth(A.count), 'primary', { disabled: app.inSeq() || !w.model.rods.size || null }), check('Show the flow', () => app.view.flow, (v) => { app.view.flow = v; app.saveUI(); app.updateFlow(); })));
    if (g && g.done && g.tries) { const rj = Object.entries(g.rej).filter(([, v]) => v > 0).sort((a, b2) => b2[1] - a[1]).slice(0, 4).map(([k, v]) => v + ' ' + REJ[k]).join(', '); b.append(hint(`Last growth: ${g.placed} placed from ${g.tries} tries. Turned down: ${rj || 'none'}.`)); }
    b.append(hint('Each batch grows on the structure as it now stands, then everything settles under its weight before the next. A stick must be held in two places, crosses get lashed, and bends tighter than a stick can take cold are pre-bent over a jig.'));
  }
  // short streamlines of the families' flows around the members
  app.updateFlow = function () {
    if (!app.view.flow) { V.setField(null); return; }
    const w = app.W; if (!w.model.rods.size) { V.setField(null); return; } const FW = w.frame(); const E = w.fields; const fams = app.design.families.filter((f) => f.enabled);
    const rnd = M.rng(5); const segs = []; const v = [0, 0, 0]; const seeds = [];
    for (const r of w.model.rods.values()) if (r.kind !== 'stick') for (let i = 0; i < r.pts.length; i += 2) seeds.push(r.pts[i]);
    if (!seeds.length || !fams.length) { V.setField(null); return; }
    for (let s = 0; s < 320; s++) {
      const f = fams[s % fams.length]; const F = E.sampler(f.id); if (!F) continue; const q = seeds[rnd.int(seeds.length)]; const rr = w.P.grow.reach * 0.7 * Math.sqrt(rnd());
      const d = M.norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]); let p = [q[0] + d[0] * rr, Math.max(0.05, q[1] + d[1] * rr), q[2] + d[2] * rr];
      for (let k = 0; k < 6; k++) { F(p[0], p[1], p[2], v); const m = Math.hypot(v[0], v[1], v[2]); if (m < 0.15) break; const n = [p[0] + v[0] / m * 0.09, p[1] + v[1] / m * 0.09, p[2] + v[2] / m * 0.09]; segs.push(p[0], p[1], p[2], n[0], n[1], n[2]); p = n; }
    }
    V.setField(segs); void FW;
  };

  // ---------------------------------------------------------------- checks
  function renderChecks(b, badge) {
    const w = app.W; const sim = app.activeSim(); if (!sim || !w.model.rods.size) { b.append(hint('Nothing to check yet.')); badge.hidden = true; return; }
    if (app.inSeq()) { b.append(note('These checks are for the finished design. The build order bar shows the structure part-built.')); }
    const S = SF.Checks.summary(w); const sockets = SF.Checks.sockets(w); const lying = SF.Checks.lying(w); const cap = S.cap;
    const sw = sockets[0]; let issues = 0; const tiles = h('div', { class: 'tiles' });
    const tile = (lab, num, sub, st, onclick) => { if (st === 'crit') issues++; const t = h(onclick ? 'button' : 'div', { class: 'tile ' + (st || ''), onclick }, h('span', { class: 'lab', text: lab }), h('span', { class: 'num', text: num }), h('span', { class: 'sub', text: sub })); tiles.append(t); };
    tile('Peak stress', fmt.pct(S.peak), S.peakRod ? S.peakRod + ' · of strength' : 'of strength', status(S.peak), S.peakRod ? () => { app.setSel([S.peakRod], []); } : null);
    tile('Hardest lashing', fmt.N(S.maxTie), S.overTies ? S.overTies + ' over capacity' : 'all within capacity', status(S.maxTieU), S.overIds.length ? () => app.setSel([], S.overIds) : S.maxTieId ? () => app.setSel([], [S.maxTieId]) : null);
    tile('Ground sockets', sw ? fmt.pct(sw.util) : '—', sw ? 'worst: ' + sw.why + ' in ' + SF.Checks.soilOf(w.P).name.toLowerCase() : 'none', sw ? sw.status : 'ok', sw ? () => app.setSel([sw.rod], []) : null);
    tile('Lying on the ground', String(lying.length), lying.length ? 'add nothing to the structure' : 'none', lying.length ? 'warn' : 'ok', lying.length ? () => app.setSel(lying.map((q) => q.id), []) : null);
    tile('Longer than stock', String(S.overStock.length), S.overStock.length ? 'splice, or shorten them' : 'all under ' + w.model.material.max_rod_m + ' m', S.overStock.length ? 'warn' : 'ok', S.overStock.length ? () => app.setSel(S.overStock, []) : null);
    tile('Bending', (S.cls.soak || 0) + ' pre-bent', (S.cls.cold || 0) + ' cold · ' + (S.cls.straight || 0) + ' straight · ' + (S.members) + ' members', '', null);
    b.append(tiles);
    // fixes, one click each
    const fixes = h('div', { class: 'btns' });
    if (lying.length) fixes.append(btn('Remove ' + lying.length + ' lying stick' + (lying.length === 1 ? '' : 's'), () => app.edit(lying.length + ' sticks that lay on the ground removed', (m) => Mo.remove(m, lying.map((q) => q.id), []), { members: false }), '', { disabled: app.inSeq() || null, title: 'Sticks lying on the ground carry nothing' }));
    if (S.overRods.length) fixes.append(btn('Remove ' + S.overRods.length + ' overstressed stick' + (S.overRods.length === 1 ? '' : 's'), () => app.edit(S.overRods.length + ' overstressed sticks removed: the rest settles without them', (m) => Mo.remove(m, S.overRods, []), { members: false }), '', { disabled: app.inSeq() || null, title: 'Sticks past their strength would break: take them out and let the rest settle' }));
    if (S.overIds.length) fixes.append(btn('Bind ' + S.overIds.length + ' overloaded lashing' + (S.overIds.length === 1 ? '' : 's') + ' twice', () => { const ids = new Set(S.overIds); app.edit(S.overIds.length + ' lashings bound again', (m) => { for (const q of m.joints) if (ids.has(q.id)) q.wraps = Math.min(4, (q.wraps || 1) + 1); }, { members: false }); }, '', { disabled: app.inSeq() || null, title: 'Each extra binding adds a lashing’s capacity' }));
    if (fixes.children.length) b.append(fixes);
    // the worst rods and lashings
    const st = S.stress; const worst = sim.rods.map((r, k) => [r, st.rodMax[k]]).filter(([r]) => r.kind !== 'pole').sort((a, c) => c[1] - a[1]).slice(0, 5);
    const ul = h('ul', { class: 'list', 'aria-label': 'Most stressed rods' }); for (const [r, u] of worst) ul.append(h('li', { onclick: () => app.setSel([r.id], []) }, h('span', { text: (KIND[r.kind] || 'Rod') + ' ' + r.id }), h('span', { class: 'm' }, statusEl(u, fmt.pct(u)))));
    const tj = sim.jointIds.map((id, j) => [id, sim.jointF[j], sim.jointCap[j]]).sort((a, c) => c[1] / c[2] - a[1] / a[2]).slice(0, 4);
    const ul2 = h('ul', { class: 'list', 'aria-label': 'Hardest-working lashings' }); for (const [id, f, cp] of tj) ul2.append(h('li', { onclick: () => app.setSel([], [id]) }, h('span', { text: 'Lashing ' + id + (cp > cap ? ' (bound ' + Math.round(cp / cap) + '×)' : '') }), h('span', { class: 'm' }, statusEl(f / cp, fmt.N(f)))));
    b.append(h('h4', { class: 'sub', text: 'Most stressed' }), ul, h('h4', { class: 'sub', text: 'Hardest-working lashings' }), ul2);
    // the build, stage by stage
    const sw2 = app.sweep && app.sweep.done ? app.sweep : null;
    if (sw2) { const wst = sw2.worst; const lv = app.stageLevel(wst); b.append(note(wst && lv !== 'ok' ? `<b>During the build:</b> the worst moment is after stage ${wst.k}: ${[wst.drop > 0.05 ? 'what was already built sinks ' + fmt.cm(wst.drop) + ' as it goes in' : '', wst.slips ? wst.slips + ' lashing' + (wst.slips === 1 ? '' : 's') + ' would slip' : '', wst.buildOver ? wst.buildOver + ' rod' + (wst.buildOver === 1 ? ' is' : 's are') + ' overstressed until later work holds ' + (wst.buildOver === 1 ? 'it' : 'them') : ''].filter(Boolean).join(', ')}. Prop it there, or change the order.` : '<b>During the build:</b> every stage stands.', lv), h('div', { class: 'btns' }, wst && lv !== 'ok' ? btn('Show that stage', () => app.showStage(wst.k)) : null)); }
    else b.append(h('div', { class: 'btns' }, btn('Check every stage of the build', () => app.startSweep && app.startSweep(), '', { disabled: !Mo.stages(w.model).length || null })), hint('Replays the build order with physics: after each stage, the part-built structure is relaxed under its own weight, with the scaffolding still in until it is struck.'));
    if (!w.settled && !app.inSeq()) b.append(hint('Still settling: the numbers update as it moves.'));
    badge.hidden = !issues; badge.className = 'badge crit'; badge.textContent = issues + (issues === 1 ? ' issue' : ' issues');
  }
  function renderStats(S, sw) {
    const el = $('#stats'); if (!el) return; el.innerHTML = ''; if (!S) return;
    const stat = (lab, val, cls, opt) => el.append(h('span', { class: 'stat ' + (cls || '') + (opt ? ' opt' : '') }, lab, h('b', { text: val })));
    stat('sticks', String(S.sticks)); stat('members', String(S.members), '', true); stat('lashings', String(S.lashings)); stat('peak stress', fmt.pct(S.peak), status(S.peak) === 'ok' ? '' : status(S.peak));
    stat('hardest lashing', fmt.N(S.maxTie), status(S.maxTieU) === 'ok' ? '' : status(S.maxTieU), true); stat('rod', fmt.n(S.length) + ' m', '', true); void sw;
  }

  // ---------------------------------------------------------------- physics and materials
  function renderPhysics(b) {
    const w = app.W; const mat = w.P.material; const G = w.P.ground;
    const ph = (k, label, min, max, step, f, scale) => slider(label, { min, max, step, get: () => mat[k] / (scale || 1), set: (v) => { mat[k] = v * (scale || 1); app.physChanged(); }, change: true, fmt: f });
    b.append(h('div', { class: 'btns' }, btn(app.paused ? 'Run the physics' : 'Pause the physics', () => { app.setPaused(!app.paused); panels.physics.render(); }, app.paused ? 'primary' : ''), btn('Settle now', () => { const sim = app.activeSim(); if (!sim) return; const r = PH.relax(sim, { budgetMs: 1500 }); if (app.W.seq) { app.W.seq.settled = r.settled; app.onSeqSettled(); } else { app.W.settled = r.settled; if (r.settled) app.onSettled(); } app.invalidate(); app.toast(r.settled ? 'Settled after ' + fmt.n(r.iterations) + ' more iterations' : 'Still moving after ' + fmt.n(r.iterations) + ' iterations: it keeps going live'); }, '', { disabled: (app.W.seq ? app.W.seq.settled : w.settled) || null, title: 'Relax hard for a second and a half' })));
    b.append(slider('Speed', { min: 3, max: 16, step: 1, get: () => app.view.budget, set: (v) => { app.view.budget = v; app.saveUI(); }, fmt: (v) => v + ' ms/frame' }));
    b.append(h('h4', { class: 'sub', text: 'Load' }), ph('gravity', 'Weight ×', 0, 4, 0.25, (v) => '× ' + v.toFixed(2)), hint('1 is the structure’s own weight. Raise it to see the margin it has before rods overstress and lashings slip.'));
    b.append(h('h4', { class: 'sub', text: 'Lashings' }), ph('joint_stiffness', 'Stiffness', 5, 60, 1, (v) => v.toFixed(0) + ' kN/m', 1000), ph('joint_capacity_n', 'Capacity', 100, 2000, 10, (v) => v.toFixed(0) + ' N'),
      ph('slip_factor', 'Slips at', 1.5, 6, 0.1, (v) => '× ' + v.toFixed(1)), ph('joint_rot', 'Grip', 0, 60, 1, (v) => v.toFixed(0) + ' N·m/rad'),
      check('Lashings slip when overloaded', () => w.slipOn, (v) => { w.slipOn = v; app.view.slip = v; app.saveUI(); }));
    const sp = D.SPECIES.find((s) => s.id === mat.species) || D.SPECIES[0];
    b.append(h('h4', { class: 'sub', text: 'Timber' }), select('Species', D.SPECIES.map((s) => [s.id, s.name]), () => mat.species, (v) => { mat.species = v; app.physChanged(); panels.physics.render(); }),
      hint(`<i>${sp.latin}</i>: E ${sp.E_gpa} GPa, bending strength ${sp.mor} MPa, ${sp.density} kg/m³ (<a href="${sp.src}" target="_blank" rel="noopener">source</a>). Rattan weavers: E 6 GPa, 55 MPa.`),
      ph('strength_factor', 'Design strength', 0.3, 1, 0.05, (v) => fmt.pct(v) + ' of clear wood'));
    b.append(h('h4', { class: 'sub', text: 'Sections' }));
    const profs = PH.profiles(mat);
    for (const [id, lab, min, max] of [['frame', 'Frame members', 20, 80], ['stick', 'Sticks', 8, 40], ['weave', 'Weavers', 5, 20], ['pole', 'Ground poles', 40, 120]]) {
      b.append(slider(lab, { min, max, step: 1, get: () => profs[id].section_mm, set: (v) => { mat.profiles = Object.assign({}, mat.profiles); mat.profiles[id] = Object.assign({}, mat.profiles[id], { section_mm: v }); app.physChanged(); }, change: true, fmt: (v) => v + ' mm' }));
    }
    b.append(ph('bundle_action', 'Bundles act as one', 0, 1, 0.05, (v) => fmt.pct(v)), ph('max_rod_m', 'Stock length', 2, 12, 0.5, (v) => v.toFixed(1) + ' m'));
    const soil = SF.Checks.soilOf(w.P);
    b.append(h('h4', { class: 'sub', text: 'Ground' }), select('Soil', D.SOILS.map((s) => [s.id, s.name]), () => G.soil, (v) => { G.soil = v; mat.ground_mu = (D.SOILS.find((q) => q.id === v) || D.SOILS[1]).mu; app.physChanged(); app.refreshPanels(); panels.physics.render(); }),
      hint(`Bearing ${soil.q} kPa, friction ${soil.mu}, a peg holds ${soil.pegU} N up and ${soil.pegH} N sideways.`),
      segRow('New sockets', SOCKET_OPTS, () => G.socket, (v) => { G.socket = v; app.autosave(); }));
    b.append(hint('Rods are chains of nodes about 30 cm apart with stretch and bending springs; lashings are springs between them; the whole is relaxed by dynamic relaxation, live, as in Basketry. Stresses are indicative: test critical joints before you build.'));
  }

  // ---------------------------------------------------------------- view
  function renderView(b) {
    const v = app.view;
    b.append(h('div', { class: 'row two' }, h('span', { class: 'lab', text: 'Colour by' }), seg(app.MODES, () => v.color, (val) => { v.color = val; app.saveUI(); app.invalidate(); app.renderLegend(); }, 'Colour by')));
    b.append(slider('Thickness', { min: 1, max: 3, step: 0.1, get: () => v.thickness, set: (x) => { v.thickness = x; app.invalidate(); }, after: () => app.saveUI(), fmt: (x) => '× ' + x.toFixed(1) }));
    b.append(check('Show every lashing', () => v.ties, (x) => { v.ties = x; app.saveUI(); app.invalidate(); }), check('Show the families’ flow', () => v.flow, (x) => { v.flow = x; app.saveUI(); app.updateFlow(); }));
    b.append(h('h4', { class: 'sub', text: 'Section' }), seg([[null, 'Off'], ['x', 'Across X'], ['z', 'Across Z'], ['y', 'Plan cut']], () => v.section, (x) => { v.section = x; const bb = app.bounds(); const c = x === 'x' ? 0 : x === 'y' ? 1 : 2; if (x) v.secPos = x === 'y' ? Math.min(1.2, bb.max[1] * 0.5) : (bb.min[c] + bb.max[c]) / 2; applySection(); panels.view.render(); }, 'Section'));
    if (v.section) {
      const bb = app.bounds(); const c = v.section === 'x' ? 0 : v.section === 'y' ? 1 : 2;
      b.append(slider('Cut at', { min: Math.floor((bb.min[c] - 0.2) * 10) / 10, max: Math.ceil((bb.max[c] + 0.2) * 10) / 10, step: 0.02, get: () => v.secPos, set: (x) => { v.secPos = x; applySection(); }, fmt: (x) => x.toFixed(2) + ' m' }), check('Keep the other side', () => v.secFlip, (x) => { v.secFlip = x; applySection(); }));
    }
  }
  function applySection() { const v = app.view; V.setSection(v.section, v.secPos, v.secFlip, app.bounds()); }
  app.applySection = applySection;

  // ---------------------------------------------------------------- legend
  app.renderLegend = function () {
    const el = $('#legend'); if (!el || !app.W) return; const mode = app.view.color; el.innerHTML = '';
    const cats = (items) => { const c = h('div', { class: 'cats' }); for (const [col, lab] of items) c.append(h('span', { class: 'cat' }, h('span', { class: 'sw', style: { background: col } }), lab)); return c; };
    if (mode === 'stress' || mode === 'load') {
      const fb = PH.profiles(app.W.model.material).stick.strength_mpa;
      el.append(h('h4', { text: mode === 'stress' ? 'Stress · share of strength' : 'Stress added by loads' }), h('div', { class: 'ramp', style: { background: app.rampCSS() } }),
        h('div', { class: 'ends' }, h('span', { text: '0' }), h('span', { text: mode === 'stress' ? '50%' : (fb / 2).toFixed(0) + ' MPa' }), h('span', { text: mode === 'stress' ? '100%' : fb.toFixed(0) + ' MPa' })),
        cats([[app.colors.over, mode === 'stress' ? 'Over strength' : 'Over stick strength']]));
    } else if (mode === 'order') {
      const st = Mo.stages(app.W.model); el.append(h('h4', { text: 'Build order' }), h('div', { class: 'ramp', style: { background: app.rampCSS() } }), h('div', { class: 'ends' }, h('span', { text: 'stage ' + (st[0] || 1) }), h('span', { text: 'stage ' + (st[st.length - 1] || 1) })));
    } else if (mode === 'bending') el.append(h('h4', { text: 'Bending' }), cats(app.CLASSES.map(([, lab, col]) => [app.colors[col], lab])));
    else if (mode === 'family') el.append(h('h4', { text: 'Stick family' }), cats(app.design.families.map((f) => [app.colors[app.famColorName(f.id)], f.name]).concat([[app.colors.frame, 'Members']])));
    else el.append(h('h4', { text: 'Timber' }), cats([[app.colors.frame, 'Frame'], [app.colors.stick, 'Stick'], [app.colors.rattan, 'Rattan weaver'], [app.colors.pole, 'Ground pole']]));
    const lr = h('div', { class: 'cats lrow' }); for (const [col, lab] of [[app.colors.twine, 'Lashing'], [app.colors.warn, 'Near capacity'], [app.colors.crit, 'Over capacity']]) lr.append(h('span', { class: 'cat' }, h('span', { class: 'ball', style: { background: col } }), lab));
    el.append(lr);
  };
})();
