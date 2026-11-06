// The offline copy (dist/Weavefield.html) opened as a file from a folder, with the network cut off: three.js and the fonts
// come from inside it, it grows, files save as real browser downloads, autosave survives reopening, design files open.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const { ROOT, SHOTS, GL_ARGS, tally } = require('./pw');
(async () => {
  const t = tally(); const DIR = path.join(SHOTS, 'offline'); fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'dist', 'Weavefield.html'), path.join(DIR, 'Weavefield.html'));
  const browser = await chromium.launch({ args: GL_ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, offline: true });
  const page = await ctx.newPage(); const logs = []; const net = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) net.push(r.url()); });
  await page.goto('file://' + path.join(DIR, 'Weavefield.html')); await page.waitForFunction(() => window.WF && WF.W && WF.W.sim, null, { timeout: 30000 });
  const f = await page.evaluate(async () => { await document.fonts.ready; return { three: window.THREE && THREE.REVISION, standalone: SF.STANDALONE, ui: document.fonts.check('13px "Instrument Sans"'), mono: document.fonts.check('12px "JetBrains Mono"'), disp: document.fonts.check('700 20px "Bricolage Grotesque"') }; });
  t.ok(f.three === '128' && f.standalone === true, 'three.js is inside the file: ' + JSON.stringify(f));
  t.ok(f.ui && f.mono && f.disp, 'the fonts are inside the file');
  await page.waitForFunction(() => WF.W.grow && WF.W.grow.placed >= 16, null, { timeout: 120000 }).catch(() => {});
  t.ok(await page.evaluate(() => WF.W.grow && WF.W.grow.placed >= 16), 'grows with no internet');
  await page.evaluate(() => WF.stopGrowth()); await page.waitForFunction(() => WF.W.settled, null, { timeout: 60000 }).catch(() => {});
  await page.screenshot({ path: SHOTS + '/offline_grown.png' });
  await page.click('#filesBtn'); await page.waitForTimeout(300);
  t.ok(/offline copy/.test((await page.textContent('#drawerBody .note')) || ''), 'Files says it is the offline copy');
  const save = async (label) => { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`#drawerBody .fileitem:has(.t:text-is("${label}")) button`)]); const p = path.join(DIR, dl.suggestedFilename()); await dl.saveAs(p); return { name: dl.suggestedFilename(), size: fs.statSync(p).size, p }; };
  const cut = await save('Cut list (.csv)'); t.ok(/_cut_list\.csv$/.test(cut.name) && fs.readFileSync(cut.p, 'utf8').startsWith('profile,'), 'cut list downloads: ' + cut.name);
  const pkg = await save('Fabrication package (.zip)'); t.ok(pkg.name.endsWith('.zip') && fs.readFileSync(pkg.p).subarray(0, 2).toString() === 'PK', 'package downloads: ' + pkg.name + ' ' + pkg.size + ' B');
  const des = await save('Design file (.json)'); t.ok(JSON.parse(fs.readFileSync(des.p, 'utf8')).format === 'weavefield-design/1', 'design file downloads: ' + des.name);
  const pic = await save('Picture of the view (.png)'); t.ok(pic.size > 5000, 'picture downloads: ' + pic.size + ' B');
  await page.keyboard.press('Escape');
  const rods = await page.evaluate(() => WF.W.model.rods.size); await page.waitForTimeout(1600);
  await page.reload(); await page.waitForFunction(() => window.WF && WF.W && WF.W.sim, null, { timeout: 30000 }); await page.waitForTimeout(400);
  t.ok(await page.evaluate(() => WF.W.model.rods.size) === rods, 'reopening the file brings the autosaved design back (' + rods + ' rods)');
  await page.evaluate(() => WF.newDesign()); await page.setInputFiles('#designInput', des.p); await page.waitForTimeout(800);
  t.ok(await page.evaluate(() => WF.W.model.rods.size) === rods, 'a saved design file opens');
  t.ok(net.length === 0, 'made no network requests' + (net.length ? ': ' + net.slice(0, 5).join(' ') : ''));
  t.done(logs); await browser.close();
})().catch((e) => { console.log('ERROR ' + e.message); process.exitCode = 1; });
