/* Weavefield — files and versions: save and open designs (Stickfield designs bring their formwork across), the
   fabrication package (cut list, lashing schedule, Rhino/Fologram model, OBJ), a picture of the view, saved versions
   with thumbnails (Basketry's iterations); plus help and the confirm dialog. */
(function () {
  'use strict';
  const app = window.WF; const { M, Mo, V, $, h, fmt } = app;
  const C = SF.Checks;

  // ---------------------------------------------------------------- saving files
  async function saveFile(name, data) {
    const dl = app.caps.downloads;
    if (dl) {
      try { await dl.save({ filename: name, data }); app.toast('Saved ' + name); return true; }
      catch (e) { const code = e && e.code; if (code === 'declined') return false; if (code === 'rate_limited') { app.toast('Another save is still waiting for an answer'); return false; }
        if (code === 'unavailable' || code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed') { app.caps.downloads = null; app.refreshFiles(); } else { app.toast('Could not save: ' + ((e && (e.message || e.code)) || 'unknown error')); return false; } }
    }
    if (SF.STANDALONE) return browserSave(name, data); // the offline copy saves to the browser's downloads like any web page
    if (typeof data === 'string' && navigator.clipboard) { try { await navigator.clipboard.writeText(data); app.toast('Saving files is off here, so ' + name + ' was copied to the clipboard'); return true; } catch (e) { /* fall through */ } }
    app.toast('Saving files is not available in this view'); return false;
  }
  const TYPES = { json: 'application/json', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown', png: 'image/png', zip: 'application/zip', html: 'text/html' };
  function browserSave(name, data) {
    try {
      const ext = name.split('.').pop().toLowerCase(); const blob = data instanceof Blob ? data : new Blob([data], { type: (TYPES[ext] || 'application/octet-stream') + ';charset=utf-8' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); app.toast('Saved ' + name + ' to your downloads'); return true;
    } catch (e) { app.toast('Could not save ' + name + ': ' + (e.message || e)); return false; }
  }
  app.saveFile = saveFile;
  // the published tool carries the offline copy as a file beside the page; anyone who can open the page can take it away
  async function saveOfflineCopy() {
    try {
      const r = await fetch('Weavefield.html', { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob(); if (blob.size < 100000) throw new Error('incomplete');
      await saveFile('Weavefield.html', new Blob([blob], { type: 'text/html' }));
    } catch (e) { app.toast('Could not fetch the offline copy here (' + (e.message || e) + '). Ask for Weavefield.html instead.', 6000); }
  }
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) { // stored, no compression
    const enc = new TextEncoder(); const chunks = []; const central = []; let offset = 0;
    const d = new Date(); const dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF; const dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    for (const f of files) {
      const name = enc.encode(f.name); const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data; const crc = crc32(data);
      const hd = new DataView(new ArrayBuffer(30)); hd.setUint32(0, 0x04034b50, true); hd.setUint16(4, 20, true); hd.setUint16(6, 0x0800, true); hd.setUint16(10, dt, true); hd.setUint16(12, dd, true);
      hd.setUint32(14, crc, true); hd.setUint32(18, data.length, true); hd.setUint32(22, data.length, true); hd.setUint16(26, name.length, true); chunks.push(new Uint8Array(hd.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true); central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cd = central.reduce((s, a) => s + a.length, 0); const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cd, true); e.setUint32(16, offset, true);
    return new Blob(chunks.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/zip' });
  }
  app.zip = zip;
  const slug = () => (app.design.name || 'weavefield').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'weavefield';
  function settleFirst() { const w = app.W; if (w.seq) app.exitSeq(); if (!w.settled && w.sim) { SF.Phys.relax(w.sim, { budgetMs: 1500 }); w.settled = SF.Phys.settled(w.sim); } w.sync(); }
  app.buildPackage = function () {
    settleFirst(); const w = app.W; const name = app.design.name;
    return [
      { name: 'README.txt', data: C.readme(w, name) },
      { name: 'weavefield_model.json', data: JSON.stringify(C.modelJSON(w, name), null, 1) },
      { name: 'cut_list.csv', data: C.cutCSV(w.model) },
      { name: 'lashings.csv', data: C.lashCSV(w) },
      { name: 'model.obj', data: C.obj(w) },
      { name: 'rhino_fologram_import.py', data: C.rhinoScript() },
      { name: 'weavefield_design.json', data: JSON.stringify(app.serialise()) }
    ];
  };
  function snapshotPNG() {
    app.draw(); const c = V.snapshot(0, 0, true);
    return new Promise((res) => { try { c.toBlob((b) => res(b), 'image/png'); } catch (e) { res(null); } });
  }

  // ---------------------------------------------------------------- drawer
  function openDrawer(title, build) { $('#drawerTitle').textContent = title; const b = $('#drawerBody'); b.innerHTML = ''; build(b); $('#drawer').hidden = false; $('#scrim').hidden = false; $('#drawerClose').focus(); }
  app.closeDrawer = function () { $('#drawer').hidden = true; $('#scrim').hidden = true; };
  app.refreshFiles = function () { if (!$('#drawer').hidden && $('#drawerTitle').textContent === 'Files') openFiles(); };
  function fileItem(t, s, label, fn, primary) { return h('div', { class: 'fileitem' }, h('div', {}, h('div', { class: 't', text: t }), h('div', { class: 's', text: s })), h('button', { class: 'ib sm' + (primary ? ' primary' : ''), onclick: fn }, label)); }
  function openFiles() {
    openDrawer('Files', (b) => {
      const w = app.W; const can = !!app.caps.downloads || !!SF.STANDALONE; const cl = C.cutList(w.model); const n = w.model.rods.size;
      if (!can) b.append(h('p', { class: 'note warn', text: 'Saving files is not available in this view. Text files will be copied to the clipboard instead.' }));
      if (SF.STANDALONE) b.append(h('p', { class: 'note ok', html: '<b>This is the offline copy of Weavefield.</b> It runs from this one file in any modern browser, with no internet needed: share the file itself. Designs autosave in this browser on this computer; save a design file to take one elsewhere.' }));
      else b.append(h('h3', { text: 'The tool' }), fileItem('Weavefield for any computer (.html)', 'One file that runs offline in Chrome, Edge, Firefox or Safari. Share it by email, a shared drive or USB; double-click to open', 'Save', () => saveOfflineCopy(), true));
      b.append(h('h3', { text: 'For building' }));
      b.append(fileItem('Fabrication package (.zip)', 'Cut list, lashing schedule, Rhino and Fologram model with importer, OBJ tubes, README', 'Save', async () => { if (!n) { app.toast('Nothing to export yet'); return; } const f = app.buildPackage(); if (can) await saveFile(slug() + '.zip', zip(f)); else await saveFile('README.txt', f[0].data); }, !!SF.STANDALONE));
      b.append(fileItem('Cut list (.csv)', `${cl.rods} rods, ${fmt.n(cl.total_m, 1)} m, ${cl.stock} pieces of ${cl.stockLen} m stock`, 'Save', () => saveFile(slug() + '_cut_list.csv', C.cutCSV(w.model))));
      b.append(fileItem('Lashing schedule (.csv)', `${w.model.joints.length} lashings: where each sits on each rod and the force it carries`, 'Save', () => { settleFirst(); saveFile(slug() + '_lashings.csv', C.lashCSV(w)); }));
      b.append(fileItem('Model for Rhino (.json)', 'Relaxed centrelines in mm, Z up, with stages, sockets and lashing marks', 'Save', () => { settleFirst(); saveFile(slug() + '_model.json', JSON.stringify(C.modelJSON(w, app.design.name), null, 1)); }));
      b.append(fileItem('Picture of the view (.png)', 'What the 3D view shows now', 'Save', async () => { const blob = await snapshotPNG(); if (blob) saveFile(slug() + '.png', blob); else app.toast('Could not capture the view'); }));
      // cut list preview
      if (cl.rows.length) {
        const tb = h('table', { class: 'cuttable' }); tb.append(h('tr', {}, h('th', { text: 'Profile' }), h('th', { text: 'Length' }), h('th', { text: 'Qty' }), h('th', { text: 'Bending' })));
        for (const r of cl.rows.slice(0, 14)) tb.append(h('tr', { class: r.over ? 'over' : '' }, h('td', { class: 't', text: r.profile + ' ' + r.section_mm + ' mm' }), h('td', { text: r.length_m.toFixed(2) + ' m' }), h('td', { text: String(r.count) }), h('td', { class: 't', text: r.cls })));
        b.append(h('h3', { text: 'Cut list' }), tb); if (cl.rows.length > 14) b.append(h('p', { class: 'hint', text: (cl.rows.length - 14) + ' more lengths in the file. Lengths round up to 5 cm; hoops include a ' + w.model.material.lap_m + ' m lap.' }));
        if (cl.over.length) b.append(h('p', { class: 'note crit', text: cl.over.length + ' rods are longer than the ' + cl.stockLen + ' m stock: they are shown in red and count as spliced pieces.' }));
      }
      b.append(h('h3', { text: 'Design' }));
      b.append(fileItem('Design file (.json)', 'Everything here: rods, lashings, stages, families and settings. Open it again later', 'Save', () => saveFile(slug() + '.weavefield.json', JSON.stringify(app.serialise()))));
      b.append(fileItem('Open a design', 'A Weavefield design, or a Stickfield design to bring its formwork across', 'Open…', () => $('#designInput').click()));
      // versions
      b.append(h('h3', { text: 'Versions' }));
      const nameIn = h('input', { type: 'text', value: app.design.name + ' · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 'aria-label': 'Version name', style: { height: '30px', border: '1px solid var(--rule-2)', borderRadius: '6px', padding: '0 8px', background: 'var(--panel)', minWidth: 0, flex: 1 } });
      b.append(h('div', { class: 'btns', style: { flexWrap: 'nowrap' } }, nameIn, h('button', { class: 'ib primary', onclick: () => { saveVersion(nameIn.value); openFiles(); } }, 'Save version')));
      const vers = readVersions(); const list = h('div', { class: 'verlist' });
      if (!vers.length) list.append(h('p', { class: 'hint', text: 'Save versions as you go to compare them later. They are kept in this browser.' }));
      vers.forEach((v, i) => list.append(h('div', { class: 'ver' }, v.thumb ? h('img', { src: v.thumb, alt: '' }) : h('div', { class: 'noimg' }), h('div', { style: { minWidth: 0 } }, h('div', { class: 't', text: v.name }), h('div', { class: 's', text: new Date(v.saved).toLocaleString() + (v.stats ? ' · ' + v.stats : '') })),
        h('div', { class: 'btns' }, h('button', { class: 'ib', onclick: async () => { if (await app.confirm({ title: 'Open “' + v.name + '”?', text: 'It replaces what is here now. Save a version first if you want to keep it.', ok: 'Open' })) { try { app.loadDesign(v.data); app.autosave(); app.closeDrawer(); app.toast('Opened ' + v.name); } catch (e) { app.toast('That version could not be opened'); } } } }, 'Open'),
          h('button', { class: 'ib', 'aria-label': 'Delete version', onclick: () => { const l = readVersions(); l.splice(i, 1); writeVersions(l); openFiles(); } }, '✕')))));
      b.append(list);
    });
  }
  app.openFiles = openFiles;
  function readVersions() { try { const v = JSON.parse(localStorage.getItem(app.LS_VERS) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function writeVersions(l) { try { localStorage.setItem(app.LS_VERS, JSON.stringify(l)); return true; } catch (e) { app.toast('Browser storage is full: delete a version first'); return false; } }
  function saveVersion(name) {
    const w = app.W; const s = w.sim ? SF.Checks.summary(w) : null;
    let thumb = null; try { thumb = V.snapshot(168, 108); } catch (e) { thumb = null; }
    const l = readVersions(); l.unshift({ name: (name || app.design.name).slice(0, 80), saved: new Date().toISOString(), thumb, stats: s ? s.sticks + ' sticks · peak ' + fmt.pct(s.peak) : '', data: app.serialise() });
    while (l.length > 12) l.pop(); if (writeVersions(l)) app.toast('Version saved');
  }
  // opening a file: a Weavefield design, or a Stickfield design whose formwork comes across as members
  function openFile(text) {
    let o; try { o = JSON.parse(text); } catch (e) { app.toast('That file is not JSON'); return; }
    if (o && o.format === 'weavefield-design/1') { try { app.loadDesign(o); app.autosave(); app.closeDrawer(); app.toast('Opened ' + app.design.name); } catch (e) { app.toast('That design could not be opened'); } return; }
    if (o && o.format === 'stickfield-design/1' && o.design) {
      const els = Array.isArray(o.design.formworkEls) && o.design.formworkEls.length ? o.design.formworkEls : null;
      if (!els) { app.toast('That Stickfield design has no formwork layout to bring across'); return; }
      app.newDesign(); app.design.name = (o.design.name || 'Stickfield design') + ' (woven)'; $('#designName').value = app.design.name;
      const clean = SF.Formwork.sanitise ? SF.Formwork.sanitise(els) : els; app.edit(null, (m, s) => { app.design.formworkEls = clean; return Mo.fromFormwork(m, SF.Formwork.build(clean), s); });
      app.closeDrawer(); setTimeout(app.frameAll, 50); app.toast('Brought the Stickfield formwork across as members. Grow sticks on it next.', 4500); return;
    }
    if (o && o.format === 'weavefield/1') { app.toast('That is the Rhino model export. Open the design file (.json) instead'); return; }
    app.toast('That file is not a Weavefield or Stickfield design');
  }

  // ---------------------------------------------------------------- help
  app.openHelp = function () {
    const m = $('#helpModal'); m.innerHTML = '';
    const keys = [['V', 'Select'], ['A', 'Arch between two places'], ['L', 'Loop'], ['O', 'Hoop'], ['R', 'Lay a rod (Enter finishes)'], ['W', 'Weave between two rods'], ['J', 'Lash two rods'], ['G', 'Grow sticks here'], ['P', 'Push and pull'], ['X', 'Remove'],
      ['Space', 'Pause or run the physics'], ['F', 'Frame the structure'], ['1 2 3 4', '3D, plan, front, side'], ['[ ]', 'Step through the build'], ['Delete', 'Remove the selection'], ['Esc', 'Cancel, or back to the live design'], ['Ctrl Z', 'Undo (Shift for redo)'], ['H', 'This help']];
    m.append(h('button', { class: 'ib', style: { float: 'right' }, 'aria-label': 'Close help', onclick: () => app.closeHelp() }, '✕'),
      h('h2', { html: 'weave<b>field</b>' }),
      h('p', { text: 'Grow complex woven structures on a live physical model. Every rod is a chain of springs that bends and settles under its own weight; every lashing is a spring that can slip. What you see is always the relaxed shape, and the numbers come from it.' }),
      h('h3', { text: 'How it works' }),
      h('ul', {}, h('li', { html: '<b>Rods</b> (after Basketry) are nodes about 30 cm apart, joined by stretch springs and bending springs. Sticks bent cold spring back; steam-bent members and soaked sticks are pre-bent and keep their shape. Bundles act partly as one.' }),
        h('li', { html: '<b>Lashings</b> are zero-length springs between a point on each of two rods. Each has a working capacity; above its slip load it comes undone and the structure settles again without it.' }),
        h('li', { html: '<b>Ground sockets</b> fix a rod end, clamped along the rod, upright or pinned. The ground pushes back everywhere else, with friction. The Checks panel compares what each socket holds with the soil.' }),
        h('li', { html: '<b>Growth</b> (after Stickfield) places sticks along each family’s flow field, starting on rods where they now stand. A stick must be held in two places, crossings get lashed, openings stay clear and feet meet the ground steeply. Each batch settles before the next grows on it.' }),
        h('li', { html: '<b>The build order</b> is every edit in turn. Scrub back to see the part-built structure under its own weight, with scaffolding in until you strike it. <i>Check every stage</i> replays the whole build and charts, stage by stage, how far what is already built sinks as the next part goes in, which lashings would slip and which rods are overstressed only while building.' })),
      h('h3', { text: 'Getting going' }),
      h('p', { html: 'Spring a starter frame or place a formwork layout from <b>Start</b>, or draw arches by hand. Then grow sticks from <b>Grow</b>, or click with <b>Grow here</b>. Weave, lash and drop hoops to tie it together. Pull on it to feel it, raise the weight to test it, and export the cut list and lashing schedule from <b>Files</b>.' }),
      h('h3', { text: 'Keys' }), h('div', { class: 'keys' }, keys.map(([k, t]) => h('div', {}, h('kbd', { text: k }), ' ', t))),
      h('h3', { text: 'Taking it with you' }),
      h('p', { html: SF.STANDALONE ? 'This is the offline copy' + (SF.BUILD ? ', built ' + SF.BUILD : '') + ': one HTML file that runs in any modern browser with no internet. Share the file itself. Designs autosave in the browser that opened it; use <b>Files → Design file</b> to move a design between computers.' : 'Files → <b>Weavefield for any computer</b> saves the whole tool as one HTML file that runs offline in any modern browser. Share that file; designs move between copies as design files.' }),
      h('h3', { text: 'Credits and limits' }),
      h('p', { html: 'The rod and lashing physics follow <a href="https://runchat.com/p/grunch/basketry-684" target="_blank" rel="noopener">Basketry by Grunch</a>; the stick families, flows and formwork come from Stickfield. Rods pass through each other (only lashings and the ground connect them), stresses are indicative, and the soil model is simple: test critical joints and sockets before you build.' }));
    m.hidden = false; $('#scrim').hidden = false; m.querySelector('button').focus();
  };
  app.closeHelp = function () { $('#helpModal').hidden = true; if ($('#drawer').hidden) $('#scrim').hidden = true; };

  // ---------------------------------------------------------------- confirm dialog (in-page; no browser dialogs)
  let resolver = null;
  app.confirm = function (o) {
    const d = $('#dialog'); d.innerHTML = ''; const ok = h('button', { class: 'ib ' + (o.danger ? 'primary' : 'primary'), style: o.danger ? { background: 'var(--crit)', borderColor: 'var(--crit)' } : null, onclick: () => app.closeDialog(true) }, o.ok || 'OK');
    d.append(h('h3', { text: o.title }), h('p', { text: o.text || '' }), h('div', { class: 'btns' }, h('button', { class: 'ib', onclick: () => app.closeDialog(false) }, 'Cancel'), ok));
    d.hidden = false; $('#scrim').hidden = false; ok.focus();
    return new Promise((res) => { resolver = res; });
  };
  app.closeDialog = function (v) { $('#dialog').hidden = true; if ($('#drawer').hidden && $('#helpModal').hidden) $('#scrim').hidden = true; const r = resolver; resolver = null; if (r) r(v); };

  // ---------------------------------------------------------------- wiring
  function wire() {
    $('#filesBtn').addEventListener('click', openFiles); $('#helpBtn').addEventListener('click', app.openHelp); $('#drawerClose').addEventListener('click', app.closeDrawer);
    $('#scrim').addEventListener('click', () => { if (!$('#dialog').hidden) app.closeDialog(false); else { app.closeDrawer(); app.closeHelp(); } });
    $('#designInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => openFile(String(fr.result)); fr.readAsText(f); e.target.value = ''; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  void M;
})();
