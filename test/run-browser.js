// Runs the browser tests one after another (each takes a minute or more on software WebGL). `npm run test:browser`
const { spawnSync } = require('child_process'); const path = require('path');
const all = [['pw_smoke.js', 'first visit, arch tool, undo, files'], ['pw_offline.js', 'the offline copy with no network'], ['pw_tools.js', 'every tool through real clicks'],
  ['pw_more.js', 'formwork strike, build-order check, section, versions, Stickfield import'], ['pw_misc.js', 'play the build, bundles, weight, fixes, theme, undo while growing'], ['pw_modes.js', 'dark mode, phone and tablet layouts']];
const only = process.argv.slice(2); const tests = only.length ? all.filter(([f]) => only.some((o) => f.includes(o))) : all;
let failed = 0;
for (const [file, what] of tests) {
  const t = Date.now(); const r = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8', timeout: 30 * 60 * 1000 });
  const passed = r.status === 0 && /ALL OK/.test(r.stdout); if (!passed) failed++;
  console.log((passed ? 'PASS' : 'FAIL') + '  ' + file.padEnd(15) + ' ' + what + '  (' + ((Date.now() - t) / 1000).toFixed(0) + ' s)');
  if (!passed) console.log((r.stdout + r.stderr).split('\n').map((l) => '      ' + l).join('\n'));
}
console.log(failed ? failed + ' of ' + tests.length + ' failed' : 'all ' + tests.length + ' passed; screenshots in test/out'); process.exitCode = failed ? 1 : 0;
