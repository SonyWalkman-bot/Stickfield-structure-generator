/* Weavefield — the build order: every edit is a stage. Scrub back to see the structure as it stands after any stage,
   relaxed under its own weight with its scaffolding still in; play it through; or check every stage and chart how far
   the part-built structure moves from its finished shape. */
(function () {
  'use strict';
  const app = window.WF; const { M, Mo, $, h, fmt } = app;
  const STAGE_MAX_MS = 2600, HOLD_MS = 380;
  const level = (q) => (!q ? '' : q.slips || q.fallen || q.buildOver || q.drop > 0.2 ? 'crit' : q.drop > 0.05 ? 'warn' : 'ok');
  app.stageLevel = level;

  app.renderTimeline = function () {
    const el = $('#timeline'); if (!el || !app.W) return; el.innerHTML = '';
    const stages = Mo.stages(app.W.model); app.stageList = stages; const n = stages.length; const seq = app.inSeq();
    const idx = seq ? app.seqIdx : Math.max(0, n - 1);
    const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    el.append(h('span', { class: 'tl-title', text: 'Build order' }));
    const playing = app.play;
    el.append(h('div', { class: 'tl-ctrl' },
      h('button', { class: 'ib', title: 'First stage', 'aria-label': 'First stage', disabled: n < 2 || null, onclick: () => app.showStageIdx(0), html: I('<path d="M6 5v14M18 6l-8 6 8 6Z"/>') }),
      h('button', { class: 'ib', title: 'Back a stage ([)', 'aria-label': 'Back a stage', disabled: n < 2 || (seq && idx <= 0) || null, onclick: () => app.seqStepBy(-1), html: I('<path d="m15 6-6 6 6 6"/>') }),
      h('button', { class: 'ib', title: playing ? 'Pause' : 'Play the build', 'aria-label': playing ? 'Pause' : 'Play the build', 'aria-pressed': playing ? 'true' : 'false', disabled: n < 2 || null, onclick: () => app.togglePlay(), html: playing ? I('<path d="M9 6v12M15 6v12"/>') : I('<path d="M8 5v14l11-7Z" fill="currentColor"/>') }),
      h('button', { class: 'ib', title: 'Forward a stage (])', 'aria-label': 'Forward a stage', disabled: !seq || null, onclick: () => app.seqStepBy(1), html: I('<path d="m9 6 6 6-6 6"/>') })));
    const track = h('div', { class: 'track' }); const marks = h('div', { class: 'marks', 'aria-hidden': 'true' });
    const res = app.sweep && app.sweep.results ? new Map(app.sweep.results.map((q) => [q.k, q])) : null;
    const maxMove = res && app.sweep.results.length ? Math.max(0.05, ...app.sweep.results.map((q) => q.drop)) : 1;
    for (let i = 0; i < n; i++) {
      const q = res ? res.get(stages[i]) : null; const x = n > 1 ? (i / (n - 1)) * 100 : 50;
      const hgt = q ? 3 + 13 * Math.sqrt(Math.min(1, q.drop / maxMove)) : 6;
      marks.append(h('i', { style: { left: x + '%', height: hgt.toFixed(1) + 'px', background: q ? 'var(--' + level(q) + ')' : i === idx ? 'var(--accent-fill)' : 'var(--rule-2)' },
        title: q ? `Stage ${q.k}: ${q.drop > 0.005 ? 'what was built sinks ' + fmt.cm(q.drop) + ' as it goes in' : 'what was built holds'}, peak stress ${fmt.pct(q.peak)}, hardest lashing ${fmt.N(q.tie)}${q.slips ? ', ' + q.slips + ' would slip' : ''}${q.buildOver ? ', ' + q.buildOver + ' overstressed only while building' : ''}` : 'Stage ' + stages[i] }));
    }
    const inp = h('input', { type: 'range', min: 0, max: Math.max(0, n - 1), step: 1, 'aria-label': 'Build stage', disabled: n < 2 || null });
    inp.value = idx; inp.addEventListener('input', () => { app.play = false; app.showStageIdx(+inp.value, true); });
    track.append(marks, inp); el.append(track);
    const read = h('div', { class: 'tl-read' }); app.tlRead = read; el.append(read); app.updateReadout();
    const act = h('div', { class: 'tl-act btns' }); el.append(act);
    if (app.sweep && (app.sweep.running || app.sweep.waiting)) act.append(h('button', { class: 'ib sm', onclick: () => app.stopSweep() }, 'Stop check'));
    else if (seq) act.append(h('button', { class: 'ib sm primary', onclick: () => app.exitSeq() }, 'Live design'));
    else act.append(h('button', { class: 'ib sm', disabled: n < 2 || null, onclick: () => app.startSweep(), title: 'Replay the build with physics and chart each stage' }, 'Check every stage'));
  };
  app.updateReadout = function () {
    const el = app.tlRead; if (!el) return; const n = (app.stageList || []).length; const w = app.W;
    if (app.sweep && app.sweep.waiting) { el.textContent = 'Settling the finished design first…'; return; }
    if (app.sweep && app.sweep.running) { el.innerHTML = ''; el.append(`Checking stage ${app.sweep.i + 1} of ${app.sweep.stages.length}…`); return; }
    if (!w.seq) { el.textContent = n ? `${n} stage${n === 1 ? '' : 's'} · finished design${n > 1 ? ' · drag back to replay the build' : ''}` : 'Every edit becomes a stage of the build'; return; }
    const q = w.seqStats(); el.innerHTML = ''; const mv = q.drop > 0.2 || q.fallen ? 'crit' : q.drop > 0.05 ? 'warn' : '';
    el.append(h('b', { text: `After stage ${w.seq.k}` }), ` (${app.seqIdx + 1} of ${n}) · ${q.rods} rods · `, h('span', { class: mv, text: q.drop > 0.005 ? 'sinks ' + fmt.cm(q.drop) : 'holds' }), ' · ' + fmt.cm(q.move) + ' off the finished shape', ' · peak ', h('span', { class: q.buildOver ? 'crit' : q.peak > 1 ? 'warn' : '', text: fmt.pct(q.peak) }), ' · lashing ' + fmt.N(q.tie) + (q.slips ? ' · ' : ''), q.slips ? h('span', { class: 'crit', text: q.slips + ' slipping' }) : '', w.seq.settled ? '' : ' · settling…');
  };
  app.showStage = (k) => { const i = (app.stageList || Mo.stages(app.W.model)).indexOf(k); if (i >= 0) app.showStageIdx(i); };
  app.showStageIdx = function (i, fromSlider) {
    const stages = app.stageList || Mo.stages(app.W.model); const n = stages.length; if (!n) return;
    i = M.clamp(Math.round(i), 0, n - 1);
    if (i >= n - 1) { app.exitSeq(); return; }
    const wasSeq = app.inSeq(); if (app.W.grow && !app.W.grow.done) { app.toast('Stop the growth before replaying the build'); return; }
    if (app.ts.drag) return; app.W.seqTo(stages[i]); app.seqIdx = i; app.seqT0 = performance.now(); app.seqSettledAt = 0;
    if (!wasSeq) { if (app.tool !== 'select') app.setTool('select', true); app.updateRail(); app.renderHint(); }
    banner(); app.invalidate(); if (!fromSlider) app.renderTimeline(); else { updateTrackMarks(); app.updateReadout(); }
  };
  function updateTrackMarks() { const box = $('#timeline .marks'); if (!box) return; const res = app.sweep && app.sweep.results; Array.from(box.children).forEach((r, i) => { if (!res) r.style.background = i === app.seqIdx ? 'var(--accent-fill)' : 'var(--rule-2)'; }); const act = $('#timeline .tl-act'); if (act && !act.querySelector('.primary') && app.inSeq() && !(app.sweep && app.sweep.running)) { act.innerHTML = ''; act.append(h('button', { class: 'ib sm primary', onclick: () => app.exitSeq() }, 'Live design')); } }
  function banner() {
    const b = $('#seqbanner'); if (!app.inSeq()) { b.hidden = true; return; } const n = app.stageList.length; b.hidden = false; b.innerHTML = '';
    b.append(h('span', { html: `<b>After stage ${app.W.seq.k}</b> of ${app.stageList[n - 1]}: the part-built structure under its own weight` }), h('button', { class: 'ib', onclick: () => app.exitSeq() }, 'Live design'));
  }
  app.exitSeq = function () {
    if (!app.inSeq()) return; app.W.seqTo(null); app.seqIdx = null; app.play = false; if (app.sweep && app.sweep.running) app.sweep.running = false;
    $('#seqbanner').hidden = true; app.updateRail(); app.renderHint(); app.invalidate(); app.renderTimeline(); app.updateEmpty(); app.refreshPanels();
  };
  app.seqStepBy = function (d) {
    const n = (app.stageList || []).length; if (n < 2) return;
    if (!app.inSeq()) { if (d < 0) app.showStageIdx(n - 2); return; }
    app.showStageIdx(app.seqIdx + d);
  };
  app.onSeqSettled = function () { app.seqSettledAt = performance.now(); app.updateReadout(); if (app.sel.rods.size || app.sel.joints.size) app.renderSelection(); };
  // play: step through the stages, each shown until it settles (or for a moment if it keeps moving)
  app.togglePlay = function () {
    if (app.play) { app.play = false; app.renderTimeline(); return; }
    const n = (app.stageList || []).length; if (n < 2) return; app.play = true;
    if (!app.inSeq() || app.seqIdx >= n - 2) app.showStageIdx(0); else app.renderTimeline();
  };
  app.playTick = function () {
    const w = app.W; if (!w.seq) { app.play = false; return; } const now = performance.now();
    const done = (w.seq.settled && now - (app.seqSettledAt || now) > HOLD_MS) || now - app.seqT0 > STAGE_MAX_MS;
    if (!done) return; if (app.seqIdx >= app.stageList.length - 2) { app.play = false; app.exitSeq(); app.toast('That is the whole build'); return; }
    app.showStageIdx(app.seqIdx + 1);
  };
  // check every stage: relax each part-built state in turn and record how it stands
  app.startSweep = function () {
    const w = app.W; if (w.grow && !w.grow.done) { app.toast('Stop the growth first'); return; }
    const stages = Mo.stages(w.model); if (stages.length < 2) { app.toast('There is only one stage so far'); return; }
    app.play = false; app.sweep = { running: false, waiting: true, done: false, i: 0, stages: stages.slice(0, -1), results: [], t0: performance.now() };
    if (app.inSeq()) { app.W.seqTo(null); app.seqIdx = null; }
    if (app.paused) app.setPaused(false); if (app.W.settled) app.beginSweep(); else { app.toast('Letting the design settle first'); app.renderTimeline(); }
  };
  // the finished shape is the reference every stage is measured against, so it starts once the live design has settled
  app.beginSweep = function () { const s = app.sweep; if (!s || !s.waiting) return; s.waiting = false; s.running = true; app.W.sync(); app.stageList = Mo.stages(app.W.model); app.showStageIdx(0); app.renderTimeline(); };
  app.stopSweep = function () { if (!app.sweep) return; app.sweep.running = false; app.sweep = null; if (app.inSeq()) app.exitSeq(); else app.renderTimeline(); app.toast('Check stopped'); };
  app.sweepTick = function (budget) {
    const s = app.sweep; const w = app.W; if (!s || !s.running || !w.seq) return;
    w.seqStep(budget * 1.6); const now = performance.now();
    if (!w.seq.settled && now - app.seqT0 < STAGE_MAX_MS) return;
    const q = w.seqStats(); q.stress = null; s.results.push(q); s.i++;
    if (s.i < s.stages.length) { app.W.seqTo(s.stages[s.i]); app.seqIdx = s.i; app.seqT0 = performance.now(); banner(); app.updateReadout(); return; }
    // done: show the worst moment
    s.running = false; s.done = true; const score = (q2) => q2.drop + (q2.slips ? 1 : 0) + (q2.buildOver ? 0.5 : 0) + q2.fallen * 0.3;
    s.worst = s.results.reduce((a, b) => (score(b) > score(a) ? b : a), s.results[0]);
    const bad = s.results.filter((q2) => level(q2) === 'crit').length, warn = s.results.filter((q2) => level(q2) === 'warn').length;
    const why = (q2) => [q2.drop > 0.05 ? 'what was built sinks ' + fmt.cm(q2.drop) + ' as it goes in' : '', q2.slips ? q2.slips + ' lashing' + (q2.slips === 1 ? '' : 's') + ' slip' : '', q2.buildOver ? q2.buildOver + ' rod' + (q2.buildOver === 1 ? ' is' : 's are') + ' overstressed until later work holds ' + (q2.buildOver === 1 ? 'it' : 'them') : ''].filter(Boolean).join(', ');
    app.toast(bad ? `${bad} stage${bad === 1 ? '' : 's'} of the build would struggle. The worst is after stage ${s.worst.k}: ${why(s.worst) || 'it moves a lot'}.` : warn ? `The build stands, though ${warn} stage${warn === 1 ? '' : 's'} sag more than 5 cm before the rest goes in.` : 'Every stage of the build holds: no stage makes what is already built sink more than 5 cm.', 7500);
    app.showStage(s.worst.k); app.renderTimeline(); app.refreshPanels();
  };
})();
