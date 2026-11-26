// Quick end-to-end check (also run in CI): first visit builds the basket pile, the Basket tool sets out a basket, the arch tool springs an arch, undo works,
// the Files drawer hands out the offline copy, and nothing logs an error.
const { setup, SHOTS, tally } = require('./pw');
(async () => {
  const t = tally();
  // a stand-in for the claude.ai downloads capability, recording what the page saves
  const mock = `window.claude = { use: async (n) => n === 'downloads' ? { save: async (o) => { (window.__saved = window.__saved || []).push({ filename: o.filename, size: o.data && (o.data.size || o.data.length) }); } } : null };`;
  const { browser, page, logs } = await setup({ wait: 300, init: `try { localStorage.clear(); } catch (e) {}` + mock });
  await page.waitForFunction(() => WF.W.settled, null, { timeout: 120000 }).catch(() => {});
  let r = await page.evaluate(() => ({ baskets: (WF.W.model.meta.baskets || []).length, rings: Array.from(WF.W.model.rods.values()).filter((q) => q.kind === 'ring').length, clad: Array.from(WF.W.model.rods.values()).filter((q) => q.kind === 'clad').length, settled: WF.W.settled }));
  t.ok(r.baskets === 3 && r.rings >= 12 && r.clad > 50 && r.settled, 'first visit: the swirling tower is built, clad and settles ' + JSON.stringify(r));
  // the Basket tool: click the ground, click again to size the base ring
  const nb = await page.evaluate(() => { WF.setTool('ring'); const n0 = WF.W.model.meta.baskets.length; WF.ringClick({ kind: 'ground', p: [6, 0, 0] }); WF.ringClick({ kind: 'ground', p: [6.7, 0, 0] }); return [n0, WF.W.model.meta.baskets.length, Array.from(WF.W.model.rods.values()).filter((q) => q.bk === 'B4' && q.kind === 'ring').map((q) => q.L)]; });
  t.ok(nb[1] === nb[0] + 1 && nb[2].length >= 1 && nb[2][0] >= 3.7 && nb[2][0] <= 5.0, 'Basket tool set out a basket: rings ' + JSON.stringify(nb[2]));
  const st = await page.evaluate(() => { WF.ringClick({ kind: 'ground', p: [6, 0, 0] }); return WF.W.model.meta.baskets.find((b) => b.id === 'B4').rings; });
  t.ok(st === nb[2].length + 1, 'clicking a basket stacks another ring on it (' + st + ' rings)');
  await page.evaluate(() => { WF.undo(); WF.undo(); WF.setTool('select'); });
  // free rings: one placed on the ground, then a sweep of them
  const fr = await page.evaluate(() => { const n0 = (WF.W.model.meta.free || []).length; WF.setTool('free'); WF.freeClick('free', { kind: 'ground', p: [5, 0, 3] }); const n1 = WF.W.model.meta.free.length; WF.setTool('sweep'); WF.freeClick('sweep', { kind: 'ground', p: [4, 0, -4] }); WF.freeClick('sweep', { kind: 'ground', p: [8, 0, -4] }); const n2 = WF.W.model.meta.free.length; WF.setTool('select'); return [n0, n1, n2]; });
  t.ok(fr[1] === fr[0] + 1 && fr[2] > fr[1] + 2, 'Free ring and Ring sweep tools add rings ' + JSON.stringify(fr));
  await page.evaluate(() => { WF.undo(); WF.undo(); });
  // Remove all, then undo
  await page.click('#clearBtn'); await page.click('#dialog .primary, #dialog button.danger'); await page.waitForTimeout(300);
  const ra = await page.evaluate(() => WF.W.model.rods.size); t.ok(ra === 0, 'Remove all empties the design');
  await page.evaluate(() => WF.undo()); const rb = await page.evaluate(() => WF.W.model.rods.size); t.ok(rb > 100, 'undo brings it all back (' + rb + ' rods)');
  await page.waitForFunction(() => WF.W.settled, null, { timeout: 60000 }).catch(() => {});
  await page.screenshot({ path: SHOTS + '/smoke_baskets.png' });
  // the arch tool, through real pointer events
  const scr = (p) => page.evaluate((p) => { const q = SF.View.project(p); const b = document.getElementById('gl').getBoundingClientRect(); return [b.left + q[0], b.top + q[1]]; }, p);
  const n0 = await page.evaluate(() => WF.W.model.rods.size);
  await page.keyboard.press('a'); for (const p of [[-1.5, 0, 0.5], [1.5, 0, 0.9]]) { const [x, y] = await scr(p); await page.mouse.move(x, y); await page.waitForTimeout(80); await page.mouse.click(x, y); await page.waitForTimeout(150); }
  const n1 = await page.evaluate(() => WF.W.model.rods.size); t.ok(n1 === n0 + 1, 'arch tool added a rod (' + n0 + ' → ' + n1 + ')');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200); t.ok(await page.evaluate(() => WF.W.model.rods.size) === n0, 'undo takes it away');
  // files: the offline copy and the cut list go through the downloads capability
  await page.click('#filesBtn'); await page.waitForTimeout(300);
  await page.click('#drawerBody .fileitem:has(.t:text-is("Weavefield for any computer (.html)")) button'); await page.waitForTimeout(1200);
  await page.click('#drawerBody .fileitem:has(.t:text-is("Cut list (.csv)")) button'); await page.waitForTimeout(400);
  const saved = await page.evaluate(() => window.__saved || []);
  t.ok(saved.some((s) => s.filename === 'Weavefield.html' && s.size > 1000000), 'offline copy handed out: ' + JSON.stringify(saved));
  t.ok(saved.some((s) => /_cut_list\.csv$/.test(s.filename)), 'cut list saved');
  await page.screenshot({ path: SHOTS + '/smoke_files.png' });
  t.done(logs); await browser.close();
})().catch((e) => { console.log('ERROR ' + e.message); process.exitCode = 1; });
