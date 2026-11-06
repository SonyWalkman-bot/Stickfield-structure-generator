// Quick end-to-end check (also run in CI): first visit grows on the grotto, the arch tool springs an arch, undo works,
// the Files drawer hands out the offline copy, and nothing logs an error.
const { setup, SHOTS, tally } = require('./pw');
(async () => {
  const t = tally();
  // a stand-in for the claude.ai downloads capability, recording what the page saves
  const mock = `window.claude = { use: async (n) => n === 'downloads' ? { save: async (o) => { (window.__saved = window.__saved || []).push({ filename: o.filename, size: o.data && (o.data.size || o.data.length) }); } } : null };`;
  const { browser, page, logs } = await setup({ wait: 300, init: `try { localStorage.clear(); } catch (e) {}` + mock });
  await page.waitForFunction(() => WF.W.grow && WF.W.grow.placed >= 16, null, { timeout: 120000 }).catch(() => {});
  let r = await page.evaluate(() => ({ placed: WF.W.grow && WF.W.grow.placed, members: Array.from(WF.W.model.rods.values()).filter((q) => q.kind !== 'stick').length }));
  t.ok(r.members === 5 && r.placed >= 16, 'first visit: grotto members placed and sticks growing ' + JSON.stringify(r));
  await page.evaluate(() => WF.stopGrowth()); await page.waitForFunction(() => WF.W.settled, null, { timeout: 60000 }).catch(() => {});
  await page.screenshot({ path: SHOTS + '/smoke_grown.png' });
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
