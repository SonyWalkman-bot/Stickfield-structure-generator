// Runs the Node tests (no browser, no dependencies): physics accuracy, model operations, growth on every frame and layout.
const { spawnSync } = require('child_process'); const path = require('path');
const tests = [['t_phys.js', 'physics against beam theory'], ['t_arch.js', 'stress of a sprung arch'], ['t_new.js', 'pulling, formwork, build order, undo, focused growth'], ['t_frames.js', 'growth on every frame and formwork layout']];
let failed = 0; const t0 = Date.now();
for (const [file, what] of tests) {
  const t = Date.now(); const r = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8' });
  const passed = r.status === 0 && /ALL OK/.test(r.stdout); if (!passed) failed++;
  console.log((passed ? 'PASS' : 'FAIL') + '  ' + file.padEnd(13) + ' ' + what + '  (' + ((Date.now() - t) / 1000).toFixed(1) + ' s)');
  if (!passed || process.argv.includes('-v')) console.log((r.stdout + r.stderr).split('\n').map((l) => '      ' + l).join('\n'));
}
console.log(failed ? failed + ' of ' + tests.length + ' failed' : 'all ' + tests.length + ' passed in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s'); process.exitCode = failed ? 1 : 0;
