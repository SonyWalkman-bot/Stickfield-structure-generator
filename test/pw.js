// Browser test harness: serves dist/test.html (the published page in a plain document) to headless Chromium, with three.js
// from vendor/ and every other request blocked. Screenshots go to test/out/.
// Needs Playwright with Chromium: npm install && npx playwright install chromium
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const SHOTS = path.join(__dirname, 'out'); fs.mkdirSync(SHOTS, { recursive: true });
const FIXTURE = path.join(__dirname, 'fixtures', 'grotto-grown.weavefield.json');
const three = fs.readFileSync(path.join(ROOT, 'vendor', 'three-r128.min.js'));
// software WebGL, so it runs on machines (and CI) without a GPU
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
async function setup(opts = {}) {
  if (!fs.existsSync(path.join(ROOT, 'dist', 'test.html'))) throw new Error('run `npm run build` first');
  const browser = await chromium.launch({ args: GL_ARGS });
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, deviceScaleFactor: opts.dpr || 1, colorScheme: opts.dark ? 'dark' : 'light', hasTouch: !!opts.touch, isMobile: !!opts.mobile, acceptDownloads: true });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.includes('three.min.js')) return route.fulfill({ body: three, contentType: 'text/javascript' });
    if (u.startsWith('http://weavefield.test/')) { const f = path.join(ROOT, 'dist', decodeURIComponent(u.replace('http://weavefield.test/', '').split('?')[0])); return fs.existsSync(f) ? route.fulfill({ body: fs.readFileSync(f), contentType: 'text/html' }) : route.fulfill({ status: 404, body: '' }); }
    if (u.includes('fonts.g')) return route.fulfill({ body: '', contentType: 'text/css' });
    return route.abort();
  });
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto('http://weavefield.test/test.html');
  await page.waitForFunction(() => window.WF && WF.W && WF.W.sim, null, { timeout: 30000 });
  await page.waitForTimeout(opts.wait == null ? 600 : opts.wait);
  return { browser, page, logs };
}
// an init script that starts the page with a given saved design (a string of JSON) instead of the first-visit growth
const withDesign = (json) => `try { localStorage.setItem('weavefield.autosave.v1', ${JSON.stringify(json)}); } catch (e) {}`;
const EMPTY = JSON.stringify({ format: 'weavefield-design/1', name: 'Test', design: { name: 'Test' }, params: null, model: { rods: [], joints: [], meta: { stage: 0, next: 1 } } });
// pass/fail bookkeeping: each test ends with t.done(logs), which fails on any FAIL line or page error
function tally() {
  let fails = 0;
  return {
    ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; },
    done(logs) { const errs = (logs || []).filter((l) => /PAGEERROR|error:/.test(l)); if (logs && logs.length) console.log('console:\n  ' + logs.join('\n  ')); if (errs.length) fails++; console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exitCode = fails ? 1 : 0; }
  };
}
module.exports = { setup, SHOTS, FIXTURE, ROOT, GL_ARGS, withDesign, EMPTY, tally };
