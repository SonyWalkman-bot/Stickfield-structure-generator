// the remaining controls: play the build, bundle and hold, physics sliders, fixes, theme switch, zip, undo while growing
const { setup, SHOTS, FIXTURE, tally } = require('./pw'); const fs = require('fs');
const saved = fs.readFileSync(FIXTURE, 'utf8');
(async () => {
  const { browser, page, logs } = await setup({ wait: 300, init: `try { localStorage.setItem('weavefield.autosave.v1', ${JSON.stringify(saved)}); } catch (e) {}` });
  const t = tally(); const ok = t.ok;
  const settle = async (ms = 30000) => { await page.waitForFunction(() => WF.W.settled, null, { timeout: ms }).catch(() => console.log('  (not settled in time)')); };
  await settle();
  // play the build for a few seconds
  await page.click('#timeline button[aria-label="Play the build"]'); await page.waitForTimeout(6000);
  let r = await page.evaluate(() => ({ play: WF.play, k: WF.W.seq && WF.W.seq.k })); ok(r.play && r.k > 1, 'playing the build: ' + JSON.stringify(r));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); r = await page.evaluate(() => ({ play: WF.play, seq: !!WF.W.seq })); ok(!r.play && !r.seq, 'Esc stops and returns live');
  // select a stick, bundle it, hold it
  const id = await page.evaluate(() => Array.from(WF.W.model.rods.values()).find((q) => q.kind === 'stick').id);
  await page.evaluate((id) => WF.setSel([id], []), id); await page.waitForTimeout(200);
  await page.click('[data-panel="sel"] button:has-text("Bundle +")'); await page.waitForTimeout(300);
  r = await page.evaluate((id) => WF.W.model.rods.get(id).bundle, id); ok(r === 2, 'bundle + makes a bundle of ' + r);
  await page.click('[data-panel="sel"] button:has-text("Hold in place")'); await page.waitForTimeout(300);
  r = await page.evaluate((id) => !!WF.W.model.rods.get(id).held, id); ok(r, 'held in place');
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  r = await page.evaluate((id) => ({ b: WF.W.model.rods.get(id).bundle || 1, held: !!WF.W.model.rods.get(id).held }), id); ok(r.b === 1 && !r.held, 'two undos restore it: ' + JSON.stringify(r));
  await settle();
  // physics: double the weight
  await page.click('[data-panel="physics"] > header'); await page.waitForTimeout(200);
  await page.evaluate(() => { const s = Array.from(document.querySelectorAll('[data-panel="physics"] input[type=range]')).find((i) => i.getAttribute('aria-label') === 'Weight ×'); s.value = 2; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(300); r = await page.evaluate(() => ({ g: WF.W.P.material.gravity, simg: WF.W.sim.mat.gravity, settled: WF.W.settled })); ok(r.g === 2 && !r.settled, 'weight ×2 rebuilds: ' + JSON.stringify(r));
  await settle(); const S2 = await page.evaluate(() => { const S = SF.Checks.summary(WF.W); return { peak: S.peak, maxTie: S.maxTie, over: S.overTies, rods: S.overRods.length }; }); console.log('  at twice the weight', JSON.stringify(S2));
  await page.screenshot({ path: SHOTS + '/40_double_weight.png' });
  // fixes
  const before = await page.evaluate(() => WF.W.model.rods.size);
  const fx = await page.$('[data-panel="checks"] button:has-text("overstressed stick")'); if (fx) { await fx.click(); await page.waitForTimeout(400); }
  const after = await page.evaluate(() => WF.W.model.rods.size); ok(!fx || after < before, 'remove overstressed sticks: ' + before + ' → ' + after);
  const bx = await page.$('[data-panel="checks"] button:has-text("twice")'); if (bx) { await bx.click(); await page.waitForTimeout(400); }
  r = await page.evaluate(() => WF.W.model.joints.filter((j) => j.wraps > 1).length); ok(!bx || r > 0, 'bound lashings twice: ' + r);
  await page.evaluate(() => { WF.W.P.material.gravity = 1; WF.physChanged(); }); await settle();
  // theme switch through data-theme
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await page.waitForTimeout(400);
  r = await page.evaluate(() => WF.colors.dark); ok(r === true, 'data-theme dark picked up');
  await page.screenshot({ path: SHOTS + '/41_theme_dark.png' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light')); await page.waitForTimeout(300);
  // zip package
  const z = await page.evaluate(async () => { const f = WF.buildPackage(); const b = WF.zip(f); const u = new Uint8Array(await b.arrayBuffer()); return { size: b.size, sig: u[0] === 0x50 && u[1] === 0x4b, files: f.length }; }); ok(z.sig && z.size > 1000, 'zip: ' + JSON.stringify(z));
  // undo while growing
  await page.evaluate(() => WF.startGrowth(40)); await page.waitForTimeout(2500); const g1 = await page.evaluate(() => WF.W.grow && WF.W.grow.placed);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(500);
  r = await page.evaluate(() => ({ grow: !!WF.W.grow, bar: document.getElementById('growbar').hidden, rods: WF.W.model.rods.size })); ok(!r.grow && r.bar, 'undo during growth stops it and takes it back (' + g1 + ' grown): ' + JSON.stringify(r));
  t.done(logs);
  await browser.close();
})();
