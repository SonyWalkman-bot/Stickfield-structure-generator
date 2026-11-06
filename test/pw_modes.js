// Dark mode, phone and tablet layouts on the grown fixture: screenshots, and no sideways scrolling.
const { setup, SHOTS, FIXTURE, tally } = require('./pw');
const fs = require('fs');
const saved = fs.readFileSync(FIXTURE, 'utf8'); const t = tally(); const allLogs = [];
(async () => {
  for (const [tag, opts] of [['dark', { dark: true }], ['phone', { viewport: { width: 390, height: 844 }, mobile: true, touch: true, dpr: 2 }], ['phone_dark', { viewport: { width: 390, height: 844 }, mobile: true, touch: true, dpr: 2, dark: true }], ['tablet', { viewport: { width: 1024, height: 768 } }]]) {
    const { browser, page, logs } = await setup(Object.assign({ wait: 300, init: `try { localStorage.setItem('weavefield.autosave.v1', ${JSON.stringify(saved)}); } catch (e) {}` }, opts));
    await page.waitForFunction(() => WF.W.settled, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: SHOTS + `/20_${tag}.png`, fullPage: tag.startsWith('phone') });
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    console.log(tag, 'scrollWidth', ov.sw, 'clientWidth', ov.cw, ov.sw > ov.cw ? 'OVERFLOW' : 'ok');
    if (tag === 'dark') { await page.evaluate(() => { WF.view.color = 'timber'; WF.invalidate(); WF.renderLegend(); }); await page.waitForTimeout(400); await page.screenshot({ path: SHOTS + `/21_dark_timber.png` }); await page.click('#filesBtn'); await page.waitForTimeout(300); await page.screenshot({ path: SHOTS + `/22_dark_files.png` }); await page.keyboard.press('Escape'); await page.click('#helpBtn'); await page.waitForTimeout(300); await page.screenshot({ path: SHOTS + `/23_dark_help.png` }); }
    for (const l of logs) allLogs.push(tag + ': ' + l); t.ok(ov.sw <= ov.cw, tag + ': no sideways scrolling');
    await browser.close();
  }
  t.done(allLogs);
})();
