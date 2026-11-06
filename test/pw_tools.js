// Every tool through real pointer events on an empty design: frame, arch, loop, hoop, lash, weave, lay a rod, grow here,
// push and pull, select, delete, undo/redo, the build order and its stage check, and the fabrication package.
const { setup, SHOTS, EMPTY, tally } = require('./pw');
(async () => {
  const { browser, page, logs } = await setup({ wait: 400, init: `try { localStorage.setItem('weavefield.autosave.v1', ${JSON.stringify(EMPTY)}); localStorage.removeItem('weavefield.ui.v1'); } catch (e) {}` });
  const R = async () => page.evaluate(() => ({ rods: WF.W.model.rods.size, joints: WF.W.model.joints.length, stage: WF.W.model.meta.stage, settled: WF.W.settled }));
  const settle = async (ms = 20000) => { await page.waitForFunction(() => WF.W.settled && !(WF.W.grow && !WF.W.grow.done), null, { timeout: ms }).catch(() => console.log('  (not settled in time)')); };
  const scr = async (p) => page.evaluate((p) => { const q = SF.View.project(p); const r = document.getElementById('gl').getBoundingClientRect(); return [r.left + q[0], r.top + q[1]]; }, p);
  const click = async (p) => { const [x, y] = await scr(p); const vp = page.viewportSize(); if (x < 70 || y < 60 || x > vp.width - 360 || y > vp.height - 50) console.log('  (point off the view)', p.map((v) => v.toFixed(2)).join(','), x.toFixed(0), y.toFixed(0)); await page.mouse.move(x, y); await page.waitForTimeout(60); await page.mouse.click(x, y); await page.waitForTimeout(120); };
  const node = async (id, t) => page.evaluate(([id, t]) => { const s = WF.W.sim; const e = s.index.get(id); const i = Math.round(t * (e.n - 1)); const o = 3 * (e.off + i); return [s.X[o], s.X[o + 1], s.X[o + 2]]; }, [id, t]);
  const t = tally(); const ok = t.ok;
  ok(await page.isVisible('#empty3d'), 'empty card shows on an empty design');
  await page.screenshot({ path: SHOTS + '/10_empty.png' });
  await page.click('#empty3d .ib.primary'); await settle();
  let r = await R(); ok(r.rods === 3, 'dome frame: ' + JSON.stringify(r));
  await page.evaluate(() => SF.View.view('persp')); await page.evaluate(() => WF.frameAll()); await page.waitForTimeout(300);
  await page.screenshot({ path: SHOTS + '/11_dome.png' });
  // arch between two ground points
  await page.keyboard.press('a'); await click([-2.2, 0, 1.0]); await click([2.0, 0, 1.4]); await settle();
  r = await R(); ok(r.rods === 4, 'arch sprung: ' + JSON.stringify(r));
  // a loop standing on the first arch's crown area
  const ids = await page.evaluate(() => Array.from(WF.W.model.rods.keys())); console.log('  rods', ids.join(' '));
  await page.keyboard.press('l'); await click(await node(ids[0], 0.3)); await settle();
  r = await R(); ok(r.rods === 5, 'loop stood: ' + JSON.stringify(r));
  // a flat hoop round the crown of the dome
  await page.keyboard.press('o'); await page.evaluate(() => { WF.opt.hoop.length = 5; }); const crown = await node(ids[0], 0.5); await page.mouse.move(0, 0); await click(await node(ids[0], 0.3)); await settle();
  r = await R(); ok(r.rods === 6, 'hoop placed: ' + JSON.stringify(r) + ' toast: ' + (await page.textContent('#toast')));
  // lash two rods where they pass close to each other (but are not lashed yet)
  const pair = await page.evaluate(() => { const s = WF.W.sim; let best = null; const tied = new Set(WF.W.model.joints.map((j) => j.a + ':' + j.ia + '|' + j.b + ':' + j.ib));
    s.rods.forEach((A, ka) => s.rods.forEach((B, kb) => { if (kb <= ka || A.kind === 'pole' || B.kind === 'pole') return; const ea = s.index.get(A.id), eb = s.index.get(B.id);
      for (let i = 2; i < ea.n - 2; i++) for (let k = 2; k < eb.n - 2; k++) { const a = 3 * (ea.off + i), b = 3 * (eb.off + k); const d = Math.hypot(s.X[a] - s.X[b], s.X[a + 1] - s.X[b + 1], s.X[a + 2] - s.X[b + 2]);
        if (d > 0.08 && d < 0.4 && !tied.has(A.id + ':' + i + '|' + B.id + ':' + k) && (!best || d < best.d)) best = { d, pa: [s.X[a], s.X[a + 1], s.X[a + 2]], pb: [s.X[b], s.X[b + 1], s.X[b + 2]] }; } }));
    return best; });
  await page.keyboard.press('j'); if (pair) { await click(pair.pa); await click(pair.pb); } await settle();
  const r2 = await R(); ok(pair && r2.joints === r.joints + 1, 'lashed two rods ' + (pair ? pair.d.toFixed(2) + ' m apart' : '(no close pair)') + ': ' + JSON.stringify(r2) + ' toast: ' + (await page.textContent('#toast')));
  // weave between two dome arches
  await page.keyboard.press('w'); await click(await node(ids[0], 0.25)); await page.waitForTimeout(150); await click(await node(ids[1], 0.75)); await settle();
  r = await R(); ok(r.rods > 6, 'weave: ' + JSON.stringify(r) + ' toast: ' + (await page.textContent('#toast')));
  await page.screenshot({ path: SHOTS + '/12_tools.png' });
  // lay a rod: ground, over an arch, ground
  await page.keyboard.press('r'); const n0 = r.rods; await click([-1.2, 0, -2.0]); await click(await node(ids[2], 0.45)); await click([1.4, 0, 2.0]); await page.keyboard.press('Enter'); await settle();
  r = await R(); ok(r.rods === n0 + 1, 'rod laid: ' + JSON.stringify(r) + ' toast: ' + (await page.textContent('#toast')));
  // grow near the crown
  await page.keyboard.press('g'); await click(crown);
  await page.waitForFunction(() => WF.W.grow && WF.W.grow.done, null, { timeout: 60000 }).catch(() => {}); await settle();
  const g = await page.evaluate(() => ({ placed: WF.W.grow.placed, count: WF.W.grow.count, rej: WF.W.grow.rej })); ok(g.placed > 0, 'grow here: ' + JSON.stringify(g));
  await page.screenshot({ path: SHOTS + '/13_grown.png' });
  // push and pull: drag a free point down
  await page.keyboard.press('p'); const pn = await node(ids[3], 0.5); const [px, py] = await scr(pn);
  await page.mouse.move(px, py); await page.mouse.down(); await page.waitForTimeout(100);
  for (let k = 1; k <= 8; k++) { await page.mouse.move(px, py + k * 6); await page.waitForTimeout(60); }
  await page.waitForTimeout(700); const lab = await page.textContent('#labels'); await page.screenshot({ path: SHOTS + '/14_pull.png' });
  await page.mouse.up(); await page.waitForTimeout(300); ok(/N/.test(lab || ''), 'pull label: ' + lab + ' · toast: ' + (await page.textContent('#toast')));
  await settle();
  // select and inspect
  // a point on the rod that is far, on screen, from every lashing (lashings are picked first), so the click selects the rod
  const free = await page.evaluate((id) => { const s = WF.W.sim; const e = s.index.get(id); const lash = []; for (let j = 0; j < s.jointIds.length; j++) { const en = SF.Phys.jointEnds(s, j); lash.push(SF.View.project(SF.M.lerp3(en[0], en[1], 0.5))); }
    let best = 0.5, bd = -1; for (let i = 2; i < e.n - 2; i++) { const o = 3 * (e.off + i); const q = SF.View.project([s.X[o], s.X[o + 1], s.X[o + 2]]); let d = Infinity; for (const l of lash) d = Math.min(d, Math.hypot(l[0] - q[0], l[1] - q[1])); if (d > bd) { bd = d; best = i / (e.n - 1); } } return best; }, ids[1]);
  await page.keyboard.press('v'); await click(await node(ids[1], free)); await page.waitForTimeout(300);
  const sel = await page.evaluate(() => ({ rods: Array.from(WF.sel.rods), panel: !document.querySelector('[data-panel="sel"]').hidden, text: document.querySelector('[data-panel="sel"] .body').textContent.slice(0, 160) }));
  ok(sel.rods.length === 1 && sel.panel, 'selected: ' + JSON.stringify(sel));
  await page.screenshot({ path: SHOTS + '/15_select.png' });
  // remove it, undo, redo
  const before = await R(); await page.keyboard.press('Delete'); await page.waitForTimeout(200); let after = await R(); ok(after.rods === before.rods - 1, 'delete removes the rod');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200); after = await R(); ok(after.rods === before.rods, 'undo restores it');
  await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(200); after = await R(); ok(after.rods === before.rods - 1, 'redo removes it again');
  await settle();
  // build order: step back, then check every stage
  await page.keyboard.press('['); await page.waitForTimeout(800); const sq = await page.evaluate(() => ({ seq: !!WF.W.seq, k: WF.W.seq && WF.W.seq.k, read: document.querySelector('.tl-read').textContent, banner: !document.getElementById('seqbanner').hidden }));
  ok(sq.seq && sq.banner, 'build order shows a stage: ' + JSON.stringify(sq)); await page.screenshot({ path: SHOTS + '/16_seq.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); ok(!(await page.evaluate(() => !!WF.W.seq)), 'Esc returns to the live design');
  await page.evaluate(() => WF.startSweep()); await page.waitForFunction(() => WF.sweep && WF.sweep.done, null, { timeout: 120000 }).catch(() => {});
  const sw = await page.evaluate(() => WF.sweep && { n: WF.sweep.results.length, worst: WF.sweep.worst && { k: WF.sweep.worst.k, move: WF.sweep.worst.move, peak: WF.sweep.worst.peak, slips: WF.sweep.worst.slips } });
  ok(sw && sw.n > 3, 'checked every stage: ' + JSON.stringify(sw)); await page.waitForTimeout(400); await page.screenshot({ path: SHOTS + '/17_sweep.png' });
  await page.evaluate(() => WF.exitSeq());
  // files
  await page.click('#filesBtn'); await page.waitForTimeout(300); await page.screenshot({ path: SHOTS + '/18_files.png' });
  const pkg = await page.evaluate(() => WF.buildPackage().map((f) => f.name + ':' + f.data.length)); ok(pkg.length === 7, 'package: ' + pkg.join(' '));
  await page.keyboard.press('Escape');
  require('fs').writeFileSync(SHOTS + '/tools_design.weavefield.json', await page.evaluate(() => JSON.stringify(WF.serialise())));
  t.done(logs);
  await browser.close();
})();
