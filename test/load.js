// Loads Weavefield src modules into Node's global scope for testing
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const dir = path.join(__dirname, '..', 'src');
globalThis.performance = globalThis.performance || require('perf_hooks').performance;
function load(files) {
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
  return globalThis.SF;
}
const ALL = ['00_math.js', '05_defaults.js', '10_field.js', '12_formwork.js', '20_physics.js', '30_model.js', '35_fields.js', '40_grow.js', '45_world.js', '60_checks.js'];
module.exports = { load, ALL };
