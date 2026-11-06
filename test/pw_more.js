// formwork strike, build replay, section, flow, bending colours, versions, Stickfield import
const { setup, SHOTS, FIXTURE, tally } = require('./pw'); const fs = require('fs');
const saved = fs.readFileSync(FIXTURE, 'utf8');
(async () => {
  const { browser, page, logs } = await setup({ wait: 300, init: `try { localStorage.setItem('weavefield.autosave.v1', ${JSON.stringify(saved)}); localStorage.removeItem('weavefield.versions.v1'); } catch (e) {}` });
  const t = tally(); const ok = t.ok;
  const settle = async (ms = 30000) => { await page.waitForFunction(() => WF.W.settled, null, { timeout: ms }).catch(() => console.log('  (not settled in time)')); };
  await settle();
  let r = await page.evaluate(() => ({ rods: WF.W.model.rods.size, held: Array.from(WF.W.model.rods.values()).filter((q) => q.held).length }));
  ok(r.rods > 100 && r.held === 1, 'grown grotto loaded: ' + JSON.stringify(r));
  // strike the formwork
  await page.click('button:has-text("Strike the formwork")'); await page.waitForTimeout(300); await settle();
  r = await page.evaluate(() => ({ held: Array.from(WF.W.model.rods.values()).filter((q) => q.held).length, events: (WF.W.model.meta.events || []).length, toast: document.getElementById('toast').textContent }));
  ok(r.held === 0 && r.events === 1, 'struck: ' + JSON.stringify(r));
  await page.screenshot({ path: SHOTS + '/30_struck.png' });
  // stage before the strike: the hoop is held again
  await page.keyboard.press('['); await page.waitForTimeout(500);
  r = await page.evaluate(() => ({ k: WF.W.seq && WF.W.seq.k, held: WF.W.seq && Array.from(WF.W.seq.model.rods.values()).filter((q) => q.held).length }));
  ok(r.held === 1, 'replay before the strike holds the hoop: ' + JSON.stringify(r));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // check every stage
  await page.click('button:has-text("Check every stage")'); await page.waitForFunction(() => WF.sweep && WF.sweep.done, null, { timeout: 300000 }).catch(() => {});
  r = await page.evaluate(() => WF.sweep && { n: WF.sweep.results.length, worst: WF.sweep.worst && { k: WF.sweep.worst.k, drop: +WF.sweep.worst.drop.toFixed(3), move: +WF.sweep.worst.move.toFixed(3), peak: +WF.sweep.worst.peak.toFixed(2), buildOver: WF.sweep.worst.buildOver, slips: WF.sweep.worst.slips }, levels: WF.sweep.results.map((q) => WF.stageLevel(q)[0]).join('') });
  ok(r && r.n > 10, 'swept: ' + JSON.stringify(r)); await page.waitForTimeout(500); await page.screenshot({ path: SHOTS + '/31_sweep.png' });
  await page.evaluate(() => WF.exitSeq());
  // section + bending colours + flow
  await page.evaluate(() => { WF.view.color = 'bending'; WF.invalidate(); WF.renderLegend(); WF.view.section = 'x'; WF.view.secPos = 0; WF.applySection(); WF.view.flow = true; WF.updateFlow(); });
  await page.waitForTimeout(500); await page.screenshot({ path: SHOTS + '/32_section_bending_flow.png' });
  await page.evaluate(() => { WF.view.section = null; WF.applySection(); WF.view.flow = false; WF.updateFlow(); WF.view.color = 'family'; WF.invalidate(); WF.renderLegend(); });
  await page.waitForTimeout(300); await page.screenshot({ path: SHOTS + '/33_family.png' });
  // versions
  await page.click('#filesBtn'); await page.waitForTimeout(200); await page.click('text=Save version'); await page.waitForTimeout(300);
  const nv = await page.evaluate(() => JSON.parse(localStorage.getItem('weavefield.versions.v1') || '[]').length); ok(nv === 1, 'version saved (' + nv + ')');
  await page.screenshot({ path: SHOTS + '/34_versions.png' });
  await page.keyboard.press('Escape');
  // Stickfield design import (formwork comes across)
  const sf = { format: 'stickfield-design/1', design: { name: 'Twin test', mode: 'aggregate', formworkEls: [{ id: 'g1', type: 'ground', closed: true, pts: [[-4, -2], [4, -2], [4, 2], [-4, 2]] }, { id: 'h1', type: 'hoop', c: [0, 1.4, 0], r: 1.5, az: 90, el: 0, keep: true, open: true }] }, params: {} };
  const fp = SHOTS + '/stickfield_design.json'; fs.writeFileSync(fp, JSON.stringify(sf));
  await page.setInputFiles('#designInput', fp); await page.waitForTimeout(800);
  r = await page.evaluate(() => ({ name: WF.design.name, rods: WF.W.model.rods.size, kinds: Array.from(WF.W.model.rods.values()).map((q) => q.kind).join(','), toast: document.getElementById('toast').textContent }));
  ok(r.rods === 2, 'Stickfield import: ' + JSON.stringify(r));
  await settle(); await page.screenshot({ path: SHOTS + '/35_import.png' });
  // undo goes back to the grotto? (a new design starts a fresh history)
  t.done(logs);
  await browser.close();
})();
