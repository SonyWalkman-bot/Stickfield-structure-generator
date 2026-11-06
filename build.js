// Weavefield build: the published page (dist/weavefield.html), a test page, and the offline copy (dist/Weavefield.html,
// one self-contained file with three.js and the fonts inside) zipped with a README for sharing (dist/Weavefield.zip).
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const P = (...a) => path.join(__dirname, ...a);
const order = ['00_math.js', '05_defaults.js', '10_field.js', '12_formwork.js', '20_physics.js', '30_model.js', '35_fields.js', '40_grow.js', '45_world.js', '60_checks.js',
  '80_view.js', '90_app.js', '91_tools.js', '92_panels.js', '93_timeline.js', '94_files.js'];
const BUILD = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const modules = order.map((f) => `/* ===== ${f} ===== */\n` + fs.readFileSync(P('src', f), 'utf8')).join('\n');
const bundle = (standalone) => `window.SF = window.SF || {}; SF.STANDALONE = ${standalone}; SF.BUILD = ${JSON.stringify(BUILD)};\n` + modules;
for (const s of [modules]) if (/<\/script/i.test(s)) throw new Error('</script> found in modules');
const tpl = fs.readFileSync(P('src', 'template.html'), 'utf8');
fs.mkdirSync(P('dist'), { recursive: true });

// 1. the published page (the artifact host wraps it in a document)
const page = tpl.replace('/*__MODULES__*/', () => bundle(false));
fs.writeFileSync(P('dist', 'weavefield.html'), page);
const skel = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>`;
fs.writeFileSync(P('dist', 'test.html'), skel + page + '</body></html>');

// 2. the offline copy: a whole document, nothing loaded from the internet
const three = fs.readFileSync(P('vendor', 'three-r128.min.js'), 'utf8'); if (/<\/script/i.test(three)) throw new Error('</script> in three.js');
const font = (file) => 'url(data:font/woff2;base64,' + fs.readFileSync(P('vendor', 'fonts', file)).toString('base64') + ") format('woff2')";
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const fonts = `<style>/* Fonts: Bricolage Grotesque, Instrument Sans and JetBrains Mono, each © its project authors, SIL Open Font License 1.1 */
@font-face{font-family:"Bricolage Grotesque";font-style:normal;font-display:swap;font-weight:200 800;font-stretch:75% 100%;src:${font('bricolage-grotesque-latin-standard-normal.woff2')};unicode-range:${LATIN}}
@font-face{font-family:"Instrument Sans";font-style:normal;font-display:swap;font-weight:400 700;font-stretch:75% 100%;src:${font('instrument-sans-latin-standard-normal.woff2')};unicode-range:${LATIN}}
@font-face{font-family:"JetBrains Mono";font-style:normal;font-display:swap;font-weight:100 800;src:${font('jetbrains-mono-latin-wght-normal.woff2')};unicode-range:${LATIN}}</style>`;
const icon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke-width="2.6" stroke-linecap="round"><rect width="32" height="32" rx="7" fill="#f8f7f2"/><path d="M4 25C8 10 24 10 28 25" stroke="#191b18"/><path d="M4 18C12 11 20 25 28 17" stroke="#2a63c8"/></svg>');
let body = tpl
  .replace(/<title>[^<]*<\/title>\s*/, '')
  .replace(/<meta name="claude:viewport-fit-sides"[^>]*>\s*/, '')
  .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/, '')
  .replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js"><\/script>/, () => '<script>\n' + three + '\n</script>')
  .replace('/*__MODULES__*/', () => bundle(true));
if (/https:\/\/(fonts\.googleapis|cdnjs)/.test(body.replace(/href="https:\/\/[^"]*"/g, ''))) throw new Error('an external load is left in the offline copy');
const styleEnd = body.indexOf('</style>') + '</style>'.length; const headCss = body.slice(0, styleEnd), rest = body.slice(styleEnd);
const offline = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Weavefield: grow woven stick structures on a live physical model, check them, and export the cut list. Runs offline from this one file.">
<title>Weavefield</title>
<link rel="icon" href="${icon}">
<!-- Weavefield offline copy, built ${BUILD}. Open this file in any modern browser; it needs no internet.
     Rod and lashing physics after Basketry by Grunch (https://runchat.com/p/grunch/basketry-684); stick growth and formwork from Stickfield.
     Includes three.js r128 (MIT licence, © 2010-2021 three.js authors) and the fonts named below (SIL Open Font License 1.1). -->
${fonts}
${headCss.trim()}
</head>
<body>
${rest.trim()}
</body>
</html>
`;
fs.writeFileSync(P('dist', 'Weavefield.html'), offline);

// 3. a zip to share: the tool, how to open it, the licences
const readme = `WEAVEFIELD
==========
Grow woven stick structures on a live physical model: rods that bend and settle under
their own weight, lashings that can slip, ground sockets, and a build order you can
replay with physics. Then export the cut list and lashing schedule to build it.

OPENING IT
- Double-click Weavefield.html. It opens in your web browser and runs entirely on your
  computer: no internet, no install, no account.
- Use a recent Chrome, Edge, Firefox or Safari, on Windows, macOS, Linux or ChromeOS.
- If it opens in a text editor or a preview instead, right-click it and choose
  Open with, then your browser.
- It needs 3D graphics (WebGL), which almost every computer from the last ten years has.
  If it says 3D is off, turn on hardware acceleration in the browser settings.
- Phones and tablets will not run an HTML file saved on them; use a computer.

YOUR WORK
- Designs autosave in the browser that opened the file, on that computer.
- To keep a design or move it to another computer: Files, then Design file (.json).
  Open it anywhere with Files, then Open a design.
- Files, then Fabrication package (.zip) saves the cut list, lashing schedule, a
  Rhino/Fologram model with its importer, and an OBJ.

SHARING
Share Weavefield.html itself (email, shared drive, USB stick). Everyone who opens it
gets the whole tool.

CREDITS
Rod and lashing physics after Basketry by Grunch:
https://runchat.com/p/grunch/basketry-684
Stick families, flows and formwork from Stickfield. Built ${BUILD}.
Includes three.js (MIT) and the fonts Bricolage Grotesque, Instrument Sans and
JetBrains Mono (SIL Open Font License 1.1): see LICENSES.txt.
`.replace(/\n/g, '\r\n');
const lic = ['three.js r128\n' + '='.repeat(13) + '\n' + fs.readFileSync(P('vendor', 'LICENSE-three.txt'), 'utf8'),
  ...['OFL-BricolageGrotesque.txt', 'OFL-InstrumentSans.txt', 'OFL-JetBrainsMono.txt'].map((f) => f.replace('OFL-', '').replace('.txt', '') + ' (font)\n' + '='.repeat(30) + '\n' + fs.readFileSync(P('vendor', 'fonts', f), 'utf8'))].join('\n\n').replace(/\r?\n/g, '\r\n');
function zipFiles(files) { // deflate, with CRCs
  const CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const d = new Date(); const dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name); const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data); const comp = zlib.deflateRawSync(raw, { level: 9 }); const crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(dt, 10); lh.writeUInt16LE(dd, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); parts.push(lh, name, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(dt, 12); ch.writeUInt16LE(dd, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42); central.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
fs.writeFileSync(P('dist', 'Weavefield.zip'), zipFiles([{ name: 'Weavefield/Weavefield.html', data: offline }, { name: 'Weavefield/README.txt', data: readme }, { name: 'Weavefield/LICENSES.txt', data: lic }]));
const kb = (f) => (fs.statSync(P('dist', f)).size / 1024).toFixed(0) + ' KB';
console.log('built', 'weavefield.html', kb('weavefield.html'), '| Weavefield.html', kb('Weavefield.html'), '| Weavefield.zip', kb('Weavefield.zip'));
