/* Weavefield — what the structure asks of its parts and how to build it: stress and lashing checks, ground sockets
   against the soil, sticks lying on the ground, bending classes, the cut list, lashing marks and the export formats. */
SF.Checks = (function () {
  'use strict';
  const M = SF.M, PH = SF.Phys, Mo = SF.Model;
  const isMember = (r) => r.kind !== 'stick';
  const soilOf = (P) => SF.Defaults.SOILS.find((s) => s.id === P.ground.soil) || SF.Defaults.SOILS[1];

  // ---------------- overall summary from the running simulation ----------------
  function summary(W) {
    const sim = W.sim, m = W.model, P = W.P; if (!sim) return null; const st = PH.stress(sim);
    const profs = PH.profiles(m.material); let len = 0, mass = 0; const kinds = {}; const cls = { cold: 0, soak: 0, steam: 0, straight: 0 };
    let peak = 0, peakRod = null, sticks = 0;
    sim.rods.forEach((r, k) => {
      const sp = sim.rodP[k]; len += r.L * sp.bundle; mass += r.L * sp.A * sp.density; kinds[r.kind] = (kinds[r.kind] || 0) + 1;
      if (r.kind === 'pole') return;
      if (r.kind === 'stick') { sticks++; cls[r.cls || 'cold'] = (cls[r.cls || 'cold'] || 0) + 1; }
      if (st.rodMax[k] > peak) { peak = st.rodMax[k]; peakRod = r.id; }
    });
    const cap = m.material.joint_capacity_n; let maxTie = 0, maxTieId = null, over = 0, maxTieU = 0; const overIds = [];
    sim.jointIds.forEach((id, j) => { const f = sim.jointF[j], u = f / sim.jointCap[j]; if (f > maxTie) { maxTie = f; maxTieId = id; } if (u > maxTieU) maxTieU = u; if (u > 1) { over++; overIds.push(id); } });
    const overStock = Array.from(m.rods.values()).filter((r) => r.L > m.material.max_rod_m && r.kind !== 'pole').map((r) => r.id);
    const overRods = []; sim.rods.forEach((r, k) => { if (r.kind === 'stick' && st.rodMax[k] > 1) overRods.push(r.id); });
    return { rods: m.rods.size, sticks, members: m.rods.size - sticks, lashings: sim.jointIds.length, length: len, mass, kinds, cls, peak, peakRod, maxTie, maxTieId, maxTieU, overTies: over, overIds, overRods, cap, overStock, stress: st };
  }

  // ---------------- ground sockets against the soil ----------------
  // a stick end set in the ground is a driven peg (bearing on its end, pull-out and sideways capacity of the soil);
  // a frame member's foot sits on a pad and is pegged twice
  function sockets(W) {
    if (!W.sim) return []; const P = W.P; const soil = soilOf(P); const q = soil.q * 1000; const rows = [];
    for (const rc of PH.reactions(W.sim)) {
      const r = W.model.rods.get(rc.rod); if (!r) continue; const sp = PH.sectionOf(W.model.material, r); const member = isMember(r);
      const capV = member ? q * 0.2 * 0.2 : q * sp.A + soil.pegU * 1.5, capU = member ? 2 * soil.pegU : soil.pegU, capH = (member ? 2 * soil.pegH : soil.pegH) + soil.mu * rc.down;
      const parts = [[rc.down / capV, 'bearing'], [capU > 0 ? rc.up / capU : 0, 'pull-out'], [rc.side / capH, 'sideways']].sort((a, b) => b[0] - a[0]);
      rows.push(Object.assign({}, rc, { member, capV, capU, capH, util: parts[0][0], why: parts[0][1], status: parts[0][0] > 1 ? 'crit' : parts[0][0] > 0.8 ? 'warn' : 'ok' }));
    }
    return rows.sort((a, b) => b.util - a.util);
  }

  // ---------------- sticks lying on the ground (Stickfield's clean-up) ----------------
  function lying(W) {
    const Gp = W.P.ground; const zone = Gp.zone; const out = [];
    for (const r of W.model.rods.values()) {
      if (r.kind !== 'stick') continue; let low = 0, L = 0, maxY = 0;
      for (let i = 0; i < r.pts.length; i++) { maxY = Math.max(maxY, r.pts[i][1]); if (i) { const d = M.dist(r.pts[i], r.pts[i - 1]); L += d; if ((r.pts[i][1] + r.pts[i - 1][1]) / 2 < zone) low += d; } }
      if (low / Math.max(1e-6, L) >= 0.5 || maxY < 2 * zone) out.push({ id: r.id, L: r.L, low: low / Math.max(1e-6, L), maxY });
    }
    return out;
  }

  // ---------------- cut list (Basketry's): lengths rounded up, bundles count each rod, hoops include their lap ----------------
  function cutList(m, step) {
    step = step || 0.05; const mat = m.material; const profs = PH.profiles(mat); const groups = new Map(); const byProf = {}; let total = 0, rods = 0, stock = 0; const over = [];
    for (const r of m.rods.values()) {
      if (r.kind === 'pole') continue; const sp = PH.sectionOf(mat, r, profs); const L = Math.ceil((r.L + (r.closed ? mat.lap_m : 0)) / step - 1e-9) * step;
      const key = sp.profile + '|' + L.toFixed(2) + '|' + (r.cls || ''); const g = groups.get(key) || { profile: sp.profile, section_mm: sp.section_mm, length_m: +L.toFixed(2), cls: r.cls || (sp.steam ? 'steam' : 'cold'), count: 0, kinds: new Set(), rods: [] };
      g.count += sp.bundle; g.kinds.add(sp.bundle > 1 ? r.kind + ' x' + sp.bundle : r.kind); g.rods.push(r.id); groups.set(key, g);
      const bp = byProf[sp.profile] || (byProf[sp.profile] = { label: profs[sp.profile].label, section_mm: sp.section_mm, rods: 0, total_m: 0 });
      bp.rods += sp.bundle; bp.total_m += L * sp.bundle; total += L * sp.bundle; rods += sp.bundle; if (L > mat.max_rod_m) over.push(r.id); stock += Math.ceil(L / mat.max_rod_m - 1e-9) * sp.bundle;
    }
    const order = Object.keys(profs);
    const rows = Array.from(groups.values()).map((g) => Object.assign({}, g, { kinds: Array.from(g.kinds), over: g.length_m > mat.max_rod_m })).sort((a, b) => order.indexOf(a.profile) - order.indexOf(b.profile) || b.length_m - a.length_m);
    return { rows, byProf, total_m: total, rods, members: m.rods.size, stock, stockLen: mat.max_rod_m, over, lashings: m.joints.length, sockets: Array.from(m.rods.values()).reduce((s, r) => s + (r.fix || []).length, 0) };
  }
  // where each lashing sits along each rod, measured from end A (for marking the sticks before they go up)
  function marks(m) {
    const out = new Map(); for (const r of m.rods.values()) out.set(r.id, []);
    for (const j of m.joints) {
      const a = m.rods.get(j.a), b = m.rods.get(j.b); if (!a || !b) continue;
      out.get(a.id).push({ s: (j.ia + (j.ta || 0)) * PH.segLen(a), with: b.id, joint: j.id }); out.get(b.id).push({ s: (j.ib + (j.tb || 0)) * PH.segLen(b), with: a.id, joint: j.id });
    }
    for (const v of out.values()) v.sort((x, y) => x.s - y.s); return out;
  }

  // ---------------- exports ----------------
  const R = (p) => [+(p[0] * 1000).toFixed(1), +(-p[2] * 1000).toFixed(1), +(p[1] * 1000).toFixed(1)]; // y-up metres -> Rhino Z-up millimetres
  const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
  function cutCSV(m) { const c = cutList(m); const rows = [['profile', 'section_mm', 'cut_length_m', 'qty', 'bending', 'kind', 'rods', 'over_stock']]; for (const r of c.rows) rows.push([r.profile, r.section_mm, r.length_m.toFixed(2), r.count, r.cls, r.kinds.join(' '), r.rods.join(' '), r.over ? 'yes' : '']); return csv(rows); }
  function lashCSV(W) {
    const m = W.model; const rows = [['lashing', 'rod_a', 'mark_a_mm', 'rod_b', 'mark_b_mm', 'x_mm', 'y_mm', 'z_mm', 'force_N', 'binds', 'stage']]; const F = new Map(); if (W.sim) W.sim.jointIds.forEach((id, j) => F.set(id, W.sim.jointF[j]));
    for (const j of m.joints) {
      const a = m.rods.get(j.a), b = m.rods.get(j.b); if (!a || !b) continue; const i2 = a.closed ? (j.ia + 1) % a.pts.length : Math.min(a.pts.length - 1, j.ia + 1); const p = R(M.lerp3(a.pts[j.ia], a.pts[i2], j.ta || 0));
      rows.push([j.id, a.id, Math.round((j.ia + (j.ta || 0)) * PH.segLen(a) * 1000), b.id, Math.round((j.ib + (j.tb || 0)) * PH.segLen(b) * 1000), p[0], p[1], p[2], F.has(j.id) ? Math.round(F.get(j.id)) : '', j.wraps || 1, j.stage]);
    }
    return csv(rows);
  }
  function modelJSON(W, name) {
    const st = W.sim ? PH.stress(W.sim) : null; const util = new Map(); if (st) W.sim.rods.forEach((r, k) => util.set(r.id, +st.rodMax[k].toFixed(3)));
    const mk = marks(W.model); const profs = PH.profiles(W.model.material);
    return { format: 'weavefield/1', units: 'mm', up: 'Z', created: new Date().toISOString(), design: name, material: W.model.material, soil: soilOf(W.P),
      rods: Array.from(W.model.rods.values()).map((r) => ({ id: r.id, kind: r.kind, family: r.fam || null, profile: r.profile || 'stick', section_mm: (profs[r.profile || 'stick'] || profs.stick).section_mm, bundle: r.bundle || 1,
        bending: r.cls || (PH.sectionOf(W.model.material, r).steam ? 'steam' : 'cold'), stage: r.stage, closed: !!r.closed, length_mm: Math.round(r.L * 1000), utilisation: util.get(r.id) ?? null,
        points: r.pts.map(R), rest_shape: r.rest ? r.rest.map(R) : null, sockets: (r.fix || []).map((f) => ({ node: f.i, at: R(f.p), clamped: !!f.d })), lashing_marks_mm: mk.get(r.id).map((q) => ({ s: Math.round(q.s * 1000), with: q.with })) })),
      lashings: W.model.joints.map((j) => ({ id: j.id, a: j.a, b: j.b, stage: j.stage, binds: j.wraps || 1 })) };
  }
  function obj(W) {
    const out = ['# Weavefield export: units mm, Z up', 'o weavefield']; let base = 1; const profs = PH.profiles(W.model.material);
    for (const r of W.model.rods.values()) {
      const pts = r.closed ? r.pts.concat([r.pts[0]]) : r.pts; if (pts.length < 2) continue; const sp = PH.sectionOf(W.model.material, r, profs); const rad = sp.width / 2; const fr = M.frames(pts); const K = 8;
      out.push('g ' + r.id);
      for (let i = 0; i < pts.length; i++) for (let k = 0; k < K; k++) { const a = 2 * Math.PI * k / K; const p = M.add(pts[i], M.add(M.mul(fr.N[i], rad * Math.cos(a)), M.mul(fr.B[i], rad * Math.sin(a)))); out.push('v ' + R(p).join(' ')); }
      for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < K; k++) { const a = base + i * K + k, b = base + i * K + (k + 1) % K, c = base + (i + 1) * K + (k + 1) % K, d = base + (i + 1) * K + k; out.push(`f ${a} ${b} ${c} ${d}`); }
      base += pts.length * K;
    }
    return out.join('\n') + '\n';
  }
  function rhinoScript() {
    return `# Weavefield -> Rhino / Fologram importer (RhinoPython, Rhino 7 or 8)
# Pick weavefield_model.json when asked. One layer per build stage (Weavefield::Stage_001 ...) so Fologram can step through them,
# plus lashing points and ground sockets. Rod curves carry their profile, cut length and lashing marks as user text.
import json
import rhinoscriptsyntax as rs
path = rs.OpenFileName("Weavefield model", "JSON (*.json)|*.json||")
if path:
    with open(path) as f:
        m = json.load(f)
    rs.EnableRedraw(False)
    root = "Weavefield"
    if not rs.IsLayer(root): rs.AddLayer(root)
    def layer(name, color=None):
        full = root + "::" + name
        if not rs.IsLayer(full): rs.AddLayer(full, color)
        return full
    for r in m["rods"]:
        rs.CurrentLayer(layer("Stage_%03d" % r["stage"], (190, 150, 90) if r["kind"] == "stick" else (90, 60, 40)))
        pts = r["points"] + ([r["points"][0]] if r["closed"] else [])
        crv = rs.AddInterpCurve(pts) if len(pts) > 3 else rs.AddPolyline(pts)
        if not crv: continue
        rs.ObjectName(crv, r["id"])
        rs.SetUserText(crv, "profile", "%s %smm x%s" % (r["profile"], r["section_mm"], r["bundle"]))
        rs.SetUserText(crv, "bending", r["bending"])
        rs.SetUserText(crv, "length_mm", str(r["length_mm"]))
        rs.SetUserText(crv, "lashing_marks_mm", ";".join("%d>%s" % (q["s"], q["with"]) for q in r["lashing_marks_mm"]))
        for s in r["sockets"]:
            rs.CurrentLayer(layer("Ground sockets", (60, 60, 60)))
            pt = rs.AddPoint(s["at"]); rs.ObjectName(pt, "%s socket" % r["id"])
    rs.EnableRedraw(True)
    print("Weavefield: imported %d rods, %d lashings" % (len(m["rods"]), len(m["lashings"])))
`;
  }
  function readme(W, name) {
    const s = summary(W); const c = cutList(W.model);
    return `WEAVEFIELD EXPORT — ${name}
Generated ${new Date().toISOString()}

Units: millimetres. Axes: Rhino convention (Z up); Weavefield works Y-up internally and converts.

Files
  weavefield_model.json      Every rod: centreline (relaxed), rest shape if pre-bent, profile, bending, stage, sockets, lashing marks.
  cut_list.csv               Rod lengths grouped by profile and bending, rounded up to 5 cm; bundles count each rod; hoops include ${W.model.material.lap_m} m lap.
  lashings.csv               Every lashing with its mark on each rod (from end A) and the force it carries.
  model.obj                  Rod tubes, one group per rod.
  rhino_fologram_import.py   Rebuilds the rods in Rhino on one layer per build stage.

Structure
  ${s ? `${s.sticks} sticks and ${s.members} members, ${s.lashings} lashings, ${s.length.toFixed(0)} m of rod, about ${s.mass.toFixed(0)} kg.` : ''}
  ${c.rods} rods to cut, ${c.stock} pieces of ${c.stockLen} m stock${c.over.length ? `, ${c.over.length} longer than stock (splice them)` : ''}.

Notes
  Shapes come from the physics: rods are mass-spring chains (stretch and bending springs) relaxed under their own weight with
  lashings as springs. Sticks marked "soak" are pre-bent over a jig to their rest shape; "cold" sticks are bent in place.
  Stresses are indicative: check critical members and lashings by test before building.
`;
  }
  return { summary, sockets, lying, cutList, marks, cutCSV, lashCSV, modelJSON, obj, rhinoScript, readme, soilOf };
})();
