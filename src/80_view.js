/* Weavefield — the 3D view (three.js r128): rods as instanced tubes that move with the simulation every frame,
   lashings as beads, ground sockets as pads, previews of what a click will add, a section plane, orbit/pan/zoom with a
   perspective or orthographic camera, and picking of rods, lashings and the ground. */
SF.View = (function () {
  'use strict';
  const M = SF.M;
  let T = null; const V = { ready: false };
  let renderer, scene, camP, camO, camera, container, canvas, cb = {};
  let needs = true; const G = {}; let colors = {}; let ortho = false;
  const cam = { target: [0, 1.2, 0], dist: 15, theta: 0.75, phi: 1.05 };
  const tmpM = () => new T.Matrix4(), UPV = () => new T.Vector3(0, 1, 0);
  let _m, _q, _p, _s, _d, _up, _c;
  V.requestRender = () => { needs = true; };

  V.init = function (cont, cnv, callbacks) {
    T = window.THREE; container = cont; canvas = cnv; cb = callbacks || {};
    _m = tmpM(); _q = new T.Quaternion(); _p = new T.Vector3(); _s = new T.Vector3(); _d = new T.Vector3(); _up = UPV(); _c = new T.Color();
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.NoToneMapping; renderer.localClippingEnabled = true; // colours stay true to the tokens
    scene = new T.Scene(); scene.fog = new T.Fog(0xeeeeee, 28, 70);
    camP = new T.PerspectiveCamera(36, 1, 0.05, 300); camO = new T.OrthographicCamera(-5, 5, 5, -5, -200, 400); camera = camP;
    G.hemi = new T.HemisphereLight(0xffffff, 0x8a8f86, 0.62); scene.add(G.hemi);
    G.sun = new T.DirectionalLight(0xfff6ea, 0.72); G.sun.position.set(-8, 14, 6); G.sun.castShadow = true;
    const sc = G.sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 60;
    const sm = Math.min(2048, renderer.capabilities.maxTextureSize, window.innerWidth < 900 ? 1024 : 2048); G.sun.shadow.mapSize.set(sm, sm); G.sun.shadow.bias = -0.0004; G.sun.shadow.normalBias = 0.015; G.sun.shadow.radius = 3; scene.add(G.sun, G.sun.target);
    G.fill = new T.DirectionalLight(0xe4ecff, 0.16); G.fill.position.set(9, 6, -8); scene.add(G.fill);
    G.shadow = new T.Mesh(new T.PlaneGeometry(120, 120), new T.ShadowMaterial({ opacity: 0.2 })); G.shadow.rotation.x = -Math.PI / 2; G.shadow.receiveShadow = true; G.shadow.renderOrder = -2; scene.add(G.shadow);
    G.gridMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, extensions: { derivatives: true },
      uniforms: { uMinor: { value: new T.Color(0x999999) }, uMajor: { value: new T.Color(0x666666) }, uFade: { value: 26 }, uOpacity: { value: 0.6 } },
      vertexShader: 'varying vec2 vXZ; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vXZ = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: 'uniform vec3 uMinor; uniform vec3 uMajor; uniform float uFade; uniform float uOpacity; varying vec2 vXZ;' +
        'float gl(vec2 p, float s){ vec2 q = p/s; vec2 g = abs(fract(q-0.5)-0.5)/fwidth(q); return 1.0-min(min(g.x,g.y),1.0); }' +
        'void main(){ float mi = gl(vXZ,0.5); float ma = gl(vXZ,2.0); vec2 ax = abs(vXZ)/fwidth(vXZ); float axl = 1.0-min(min(ax.x,ax.y),1.0); float f = 1.0-smoothstep(uFade*0.4,uFade,length(vXZ)); float a = max(max(mi*0.35, ma*0.75), axl)*f*uOpacity; if(a<0.01) discard; gl_FragColor = vec4(mix(uMinor,uMajor,max(ma,axl)), a); }'
    });
    G.grid = new T.Mesh(new T.PlaneGeometry(120, 120), G.gridMat); G.grid.rotation.x = -Math.PI / 2; G.grid.position.y = 0.001; G.grid.renderOrder = -1; scene.add(G.grid);
    G.clip = new T.Plane(new T.Vector3(1, 0, 0), 0);
    const mat = (o) => Object.assign(new T.MeshStandardMaterial(Object.assign({ roughness: 0.72, metalness: 0 }, o)), { clipShadows: true, clippingPlanes: [] });
    G.rodMat = mat({}); G.tieMat = mat({ roughness: 0.55 }); G.padMat = mat({ color: 0x3b342c, roughness: 0.85 }); G.cutMat = new T.MeshBasicMaterial({ color: 0x222222 });
    G.segGeo = new T.CylinderGeometry(1, 1, 1, 8, 1, true); G.ballGeo = new T.SphereGeometry(1, 10, 8); G.padGeo = new T.CylinderGeometry(1, 1.15, 1, 14, 1, false); G.cutGeo = new T.SphereGeometry(1, 8, 6);
    G.gap = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0xb8892f })); G.gap.frustumCulled = false; scene.add(G.gap);
    G.preview = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x2b6cdf, transparent: true, opacity: 0.95, depthTest: false })); G.preview.renderOrder = 9; G.preview.frustumCulled = false; scene.add(G.preview);
    G.marks = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0xb07d2a, transparent: true, opacity: 1, depthTest: false })); G.marks.renderOrder = 10; G.marks.frustumCulled = false; scene.add(G.marks);
    G.field = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: 0x1b7586, transparent: true, opacity: 0.45, clippingPlanes: [] })); G.field.frustumCulled = false; scene.add(G.field);
    G.hover = new T.Mesh(new T.SphereGeometry(0.07, 16, 12), new T.MeshBasicMaterial({ color: 0x2b6cdf, depthTest: false, transparent: true, opacity: 0.9 })); G.hover.renderOrder = 10; G.hover.visible = false; scene.add(G.hover);
    G.anchor = G.hover.clone(); G.anchor.material = G.hover.material.clone(); scene.add(G.anchor);
    G.secPlane = new T.Group(); G.secPlane.add(new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: 0x2b6cdf, transparent: true, opacity: 0.06, side: T.DoubleSide, depthWrite: false })));
    G.secPlane.add(new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(1, 1)), new T.LineBasicMaterial({ color: 0x2b6cdf, transparent: true, opacity: 0.5 }))); G.secPlane.visible = false; scene.add(G.secPlane);
    G.brush = new T.Mesh(new T.SphereGeometry(1, 24, 16), new T.MeshBasicMaterial({ color: 0x2b6cdf, transparent: true, opacity: 0.07, depthWrite: false })); G.brush.visible = false; G.brush.renderOrder = 8; scene.add(G.brush);
    V.ready = true; bindInput(); resize(); updateCamera();
    new ResizeObserver(resize).observe(container); loop();
  };
  function resize() {
    const w = Math.max(10, container.clientWidth), h = Math.max(10, container.clientHeight);
    renderer.setSize(w, h, false); camP.aspect = w / h; camP.updateProjectionMatrix(); fitOrtho(); needs = true;
  }
  function fitOrtho() { const r = canvas.getBoundingClientRect(); const a = r.width / Math.max(1, r.height); const hh = cam.dist * Math.tan(camP.fov * Math.PI / 360); camO.left = -hh * a; camO.right = hh * a; camO.top = hh; camO.bottom = -hh; camO.updateProjectionMatrix(); }
  function loop() { requestAnimationFrame(loop); if (cb.onFrame) cb.onFrame(); if (!needs) return; needs = false; renderer.render(scene, camera); if (cb.onRender) cb.onRender(); }
  function updateCamera() {
    const s = Math.sin(cam.phi);
    const pos = [cam.target[0] + cam.dist * s * Math.sin(cam.theta), cam.target[1] + cam.dist * Math.cos(cam.phi), cam.target[2] + cam.dist * s * Math.cos(cam.theta)];
    for (const c of [camP, camO]) { c.position.set(pos[0], pos[1], pos[2]); c.up.set(0, 1, 0); c.lookAt(cam.target[0], cam.target[1], cam.target[2]); c.updateMatrixWorld(); }
    fitOrtho(); needs = true; if (cb.onCamera) cb.onCamera();
  }
  V.setOrtho = (on) => { ortho = !!on; camera = ortho ? camO : camP; updateCamera(); };
  V.isOrtho = () => ortho;
  V.view = function (name) {
    if (name === 'top') { cam.phi = 0.0001; cam.theta = 0; } else if (name === 'front') { cam.phi = Math.PI / 2 - 0.0001; cam.theta = 0; }
    else if (name === 'side') { cam.phi = Math.PI / 2 - 0.0001; cam.theta = Math.PI / 2; } else { cam.phi = 1.05; cam.theta = 0.75; }
    updateCamera();
  };
  V.frame = function (box) {
    if (!box) return; const c = M.lerp3(box.min, box.max, 0.5); const r = Math.max(1.5, M.dist(box.min, box.max) / 2);
    cam.target = c; cam.dist = r / Math.tan((camP.fov / 2) * Math.PI / 180) * (camP.aspect < 1 ? 0.95 / camP.aspect : 0.85); updateCamera();
    const e = r * 1.4; const sc2 = G.sun.shadow.camera; sc2.left = sc2.bottom = -e; sc2.right = sc2.top = e; sc2.updateProjectionMatrix(); G.sun.target.position.set(c[0], 0, c[2]); G.sun.position.set(c[0] - 8, 14, c[2] + 6);
  };
  V.camState = () => ({ target: cam.target.slice(), dist: cam.dist, theta: cam.theta, phi: cam.phi });
  V.setCamState = (s) => { if (!s) return; Object.assign(cam, s); updateCamera(); };
  V.viewDir = function () { const d = new T.Vector3(); camera.getWorldDirection(d); return [d.x, d.y, d.z]; };

  // CSS colours are sRGB; materials work in linear light (the renderer encodes the output), so convert them first
  const lin = (hex) => new T.Color(hex).convertSRGBToLinear();
  V.setTheme = function (c) {
    colors = c; scene.background = new T.Color(c.view); scene.fog.color = lin(c.view);
    G.gridMat.uniforms.uMinor.value.set(c.grid); G.gridMat.uniforms.uMajor.value.set(c.gridMajor); G.gridMat.uniforms.uOpacity.value = c.dark ? 0.55 : 0.75;
    G.shadow.material.opacity = c.dark ? 0.38 : 0.18; G.hemi.intensity = c.dark ? 0.6 : 0.62; G.hemi.groundColor.copy(lin(c.dark ? '#3a403b' : '#8a8f86'));
    G.sun.intensity = c.dark ? 0.66 : 0.72; G.padMat.color.copy(lin(c.pad)); G.gap.material.color.copy(lin(c.twine));
    G.hover.material.color.copy(lin(c.accent)); G.anchor.material.color.copy(lin(c.ink)); G.brush.material.color.copy(lin(c.accent)); G.field.material.color.copy(lin(c.field));
    G.preview.material.color.copy(lin(c.accent)); G.marks.material.color.copy(lin(c.twine));
    for (const o of G.secPlane.children) o.material.color.copy(lin(c.accent));
    needs = true;
  };

  // ---------------- the structure, every frame ----------------
  function ensure(key, geo, mat, n, shadow) {
    let mesh = G[key];
    if (!mesh || mesh.instanceMatrix.count < n) {
      if (mesh) { scene.remove(mesh); mesh.dispose && mesh.dispose(); }
      mesh = new T.InstancedMesh(geo, mat, Math.max(32, Math.ceil(n * 1.5))); mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.setColorAt(0, new T.Color()); mesh.castShadow = !!shadow; mesh.receiveShadow = !!shadow; mesh.frustumCulled = false; scene.add(mesh); G[key] = mesh;
    }
    return mesh;
  }
  // draw: {sim, segColor(s, color), tieColor(j, color), rodRadius(k), tieRadius, showTies, sel:Set, hoverId}
  V.draw = function (o) {
    const sim = o.sim; if (!sim) return; const X = sim.X; const seg = sim.seg; const ns = seg.length / 4;
    const segs = ensure('segs', G.segGeo, G.rodMat, ns, true), knots = ensure('knots', G.ballGeo, G.rodMat, sim.N, true);
    const nt = sim.jointIds.length; const ties = ensure('ties', G.ballGeo, G.tieMat, nt, false);
    let k = 0, kn = 0;
    for (let q = 0, s = 0; q < seg.length; q += 4, s++) {
      const a = 3 * seg[q], b = 3 * seg[q + 1]; _d.set(X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]); const l = _d.length() || 1e-6;
      _q.setFromUnitVectors(_up, _d.multiplyScalar(1 / l)); const r = o.rodRadius(sim.nodeRod[seg[q]]);
      _p.set((X[a] + X[b]) / 2, (X[a + 1] + X[b + 1]) / 2, (X[a + 2] + X[b + 2]) / 2); _s.set(r, l, r); _m.compose(_p, _q, _s); segs.setMatrixAt(k, _m);
      o.segColor(s, _c); segs.setColorAt(k, _c); k++;
    }
    segs.count = k;
    _q.identity();
    for (let g = 0; g < sim.N; g++) { const r = o.rodRadius(sim.nodeRod[g]) * 1.0; _p.set(X[3 * g], X[3 * g + 1], X[3 * g + 2]); _s.set(r, r, r); _m.compose(_p, _q, _s); knots.setMatrixAt(kn, _m); o.nodeColor(g, _c); knots.setColorAt(kn, _c); kn++; }
    knots.count = kn;
    const gaps = []; let kt = 0;
    for (let j = 0; j < nt; j++) {
      const e = SF.Phys.jointEnds(sim, j); const vis = o.showTies || o.tieVisible(j); const rr = vis ? o.tieRadius(j) : 0;
      _p.set((e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2, (e[0][2] + e[1][2]) / 2); _s.set(rr, rr, rr); _m.compose(_p, _q, _s); ties.setMatrixAt(kt, _m); o.tieColor(j, _c); ties.setColorAt(kt, _c); kt++;
      if (vis && M.dist(e[0], e[1]) > 0.012) gaps.push(e[0][0], e[0][1], e[0][2], e[1][0], e[1][1], e[1][2]);
    }
    ties.count = kt;
    G.gap.geometry.setAttribute('position', new T.Float32BufferAttribute(gaps, 3)); G.gap.geometry.computeBoundingSphere();
    for (const mesh of [segs, knots, ties]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    // ground sockets
    let np = 0; for (const rod of sim.rods) np += (rod.fix || []).length; const pads = ensure('pads', G.padGeo, G.padMat, np, true); let kp = 0;
    sim.rods.forEach((rod, k) => { const r = Math.max(0.03, o.rodRadius(k) * 1.6); for (const f of rod.fix || []) { _p.set(f.p[0], 0.008, f.p[2]); _s.set(r, 0.016, r); _m.compose(_p, _q, _s); pads.setMatrixAt(kp++, _m); } });
    pads.count = kp; pads.instanceMatrix.needsUpdate = true;
    needs = true;
  };
  V.clearStructure = function () { for (const key of ['segs', 'knots', 'ties', 'pads']) if (G[key]) G[key].count = 0; G.gap.geometry.setAttribute('position', new T.Float32BufferAttribute([], 3)); needs = true; };

  // ---------------- overlays ----------------
  V.setPreview = function (lines, color) {
    const a = []; for (const l of lines || []) for (let i = 0; i + 1 < l.length; i++) a.push(l[i][0], l[i][1], l[i][2], l[i + 1][0], l[i + 1][1], l[i + 1][2]);
    G.preview.geometry.setAttribute('position', new T.Float32BufferAttribute(a, 3)); G.preview.geometry.computeBoundingSphere(); G.preview.visible = a.length > 0; if (color) G.preview.material.color.copy(lin(color)); needs = true;
  };
  V.setMarks = function (pts, size) {
    const a = []; const r = size || 0.06; for (const p of pts || []) a.push(p[0] - r, p[1], p[2], p[0] + r, p[1], p[2], p[0], p[1] - r, p[2], p[0], p[1] + r, p[2], p[0], p[1], p[2] - r, p[0], p[1], p[2] + r);
    G.marks.geometry.setAttribute('position', new T.Float32BufferAttribute(a, 3)); G.marks.geometry.computeBoundingSphere(); G.marks.visible = a.length > 0; needs = true;
  };
  V.setField = function (segs) { G.field.geometry.setAttribute('position', new T.Float32BufferAttribute(segs || [], 3)); G.field.geometry.computeBoundingSphere(); G.field.visible = !!(segs && segs.length); needs = true; };
  V.hover = function (p, color, size) { G.hover.visible = !!p; if (p) { G.hover.position.set(p[0], p[1], p[2]); G.hover.scale.setScalar(size || 1); if (color) G.hover.material.color.copy(lin(color)); } needs = true; };
  V.anchor = function (p) { G.anchor.visible = !!p; if (p) G.anchor.position.set(p[0], p[1], p[2]); needs = true; };
  V.brush = function (p, r) { G.brush.visible = !!p; if (p) { G.brush.position.set(p[0], p[1], p[2]); G.brush.scale.setScalar(r); } needs = true; };
  // section: axis 'x' | 'y' | 'z' (plan) | null; keep the side below/behind pos (flip keeps the other)
  V.setSection = function (axis, pos, flip, box) {
    const mats = [G.rodMat, G.tieMat, G.padMat, G.gap.material, G.field.material];
    if (!axis) { for (const m of mats) { m.clippingPlanes = []; m.needsUpdate = true; } G.secPlane.visible = false; needs = true; return; }
    const n = axis === 'x' ? [-1, 0, 0] : axis === 'y' ? [0, -1, 0] : [0, 0, -1]; const s = flip ? -1 : 1; G.clip.normal.set(n[0] * s, n[1] * s, n[2] * s); G.clip.constant = s * pos;
    for (const m of mats) { m.clippingPlanes = [G.clip]; m.needsUpdate = true; }
    const b = box || { min: [-4, 0, -4], max: [4, 4, 4] }; const c = M.lerp3(b.min, b.max, 0.5); const ext = M.sub(b.max, b.min).map((v) => v + 1.5);
    G.secPlane.visible = true; G.secPlane.rotation.set(0, 0, 0);
    if (axis === 'x') { G.secPlane.position.set(pos, c[1], c[2]); G.secPlane.rotation.y = Math.PI / 2; G.secPlane.scale.set(ext[2], ext[1], 1); }
    else if (axis === 'y') { G.secPlane.position.set(c[0], pos, c[2]); G.secPlane.rotation.x = Math.PI / 2; G.secPlane.scale.set(ext[0], ext[2], 1); }
    else { G.secPlane.position.set(c[0], c[1], pos); G.secPlane.scale.set(ext[0], ext[1], 1); }
    needs = true;
  };

  // ---------------- projection / picking ----------------
  V.project = function (p) { const v = new T.Vector3(p[0], p[1], p[2]).project(camera); const r = canvas.getBoundingClientRect(); return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height, v.z]; };
  function ray(x, y) { const r = canvas.getBoundingClientRect(); const ndc = new T.Vector2((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1); const rc = new T.Raycaster(); rc.setFromCamera(ndc, camera); return rc.ray; }
  V.rayPlane = function (x, y, p0, n) { const r = ray(x, y); const d = [r.direction.x, r.direction.y, r.direction.z], o = [r.origin.x, r.origin.y, r.origin.z]; const den = M.dot(d, n); if (Math.abs(den) < 1e-6) return null; const t = M.dot(M.sub(p0, o), n) / den; if (t < 0) return null; return M.madd(o, d, t); };
  V.rayGround = (x, y) => V.rayPlane(x, y, [0, 0, 0], [0, 1, 0]);
  V.target = () => cam.target.slice();
  // what is under the cursor: a lashing, a point on a rod, or the ground (snapped to 0.25 m unless alt)
  V.pick = function (e, sim, opts) {
    opts = opts || {}; const r = canvas.getBoundingClientRect(); const cx = e.clientX - r.left, cy = e.clientY - r.top;
    if (sim && sim.N) {
      const X = sim.X; const sx = new Float32Array(sim.N), sy = new Float32Array(sim.N), ok = new Uint8Array(sim.N), sz = new Float32Array(sim.N);
      const v = new T.Vector3(); const keep = opts.keep || (() => true);
      for (let g = 0; g < sim.N; g++) { v.set(X[3 * g], X[3 * g + 1], X[3 * g + 2]); const vis = keep(X[3 * g], X[3 * g + 1], X[3 * g + 2]); v.project(camera); sx[g] = (v.x + 1) / 2 * r.width; sy[g] = (1 - v.y) / 2 * r.height; sz[g] = v.z; ok[g] = v.z < 1 && vis ? 1 : 0; }
      if (opts.joints) {
        let best = null;
        for (let j = 0; j < sim.jointIds.length; j++) { const en = SF.Phys.jointEnds(sim, j); const p = M.lerp3(en[0], en[1], 0.5); v.set(p[0], p[1], p[2]); if (!keep(p[0], p[1], p[2])) continue; v.project(camera); if (v.z >= 1) continue; const d = Math.hypot((v.x + 1) / 2 * r.width - cx, (1 - v.y) / 2 * r.height - cy); if (d < 9 && (!best || d < best.d)) best = { d, id: sim.jointIds[j], j, p }; }
        if (best) return { kind: 'joint', id: best.id, j: best.j, p: best.p };
      }
      let best = null; const seg = sim.seg;
      for (let q = 0; q < seg.length; q += 4) {
        const a = seg[q], b = seg[q + 1]; if (!ok[a] || !ok[b]) continue; const dx = sx[b] - sx[a], dy = sy[b] - sy[a]; const l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((cx - sx[a]) * dx + (cy - sy[a]) * dy) / l2)); const d = Math.hypot(sx[a] + t * dx - cx, sy[a] + t * dy - cy); const z = sz[a] + (sz[b] - sz[a]) * t;
        if (d < 12 && (!best || d < best.d - 1.5 || (Math.abs(d - best.d) <= 1.5 && z < best.z))) best = { d, z, node: t < 0.5 ? a : b };
      }
      if (best) { const rod = sim.rods[sim.nodeRod[best.node]]; const i = best.node - sim.index.get(rod.id).off; const g = best.node; return { kind: 'rod', rod: rod.id, i, p: [X[3 * g], X[3 * g + 1], X[3 * g + 2]], spec: { rod: rod.id, i } }; }
    }
    const g = V.rayGround(e.clientX, e.clientY); if (!g) return null; const sn = (x) => (e.altKey ? x : Math.round(x * 4) / 4);
    const p = [sn(g[0]), 0, sn(g[2])]; return { kind: 'ground', p, spec: p };
  };

  // ---------------- input: left-drag orbits unless a tool takes it, right-drag pans, wheel zooms ----------------
  let drag = null; const pointers = new Map();
  function bindInput() {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', (e) => { if (!drag && cb.onLeave) cb.onLeave(e); });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', (e) => { if (cb.onDouble) cb.onDouble(e); });
  }
  function onDown(e) {
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) { if (drag && drag.mode === 'brush' && cb.onBrushEnd) cb.onBrushEnd(); drag = { mode: 'pinch', last: pinch() }; return; }
    let mode = e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey && !(cb.wantsShift && cb.wantsShift())) ? 'pan' : 'orbit';
    if (e.button === 0 && cb.wantsDrag && cb.wantsDrag(e)) mode = 'brush';
    drag = { mode, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, button: e.button };
    if (mode === 'brush' && cb.onBrushStart) cb.onBrushStart(e);
  }
  function pinch() { const p = Array.from(pointers.values()); return { cx: (p[0][0] + p[1][0]) / 2, cy: (p[0][1] + p[1][1]) / 2, d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) }; }
  function onMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (!drag) { if (cb.onHover) cb.onHover(e); return; }
    if (drag.mode === 'pinch') { if (pointers.size < 2) return; const s = pinch(), l = drag.last; cam.dist = M.clamp(cam.dist * (l.d / Math.max(10, s.d)), 1.2, 140); orbitBy(s.cx - l.cx, s.cy - l.cy); drag.last = s; return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 4) drag.moved = true;
    if (drag.mode === 'brush') { if (cb.onBrushMove) cb.onBrushMove(e); return; }
    if (!drag.moved) return;
    if (drag.mode === 'orbit') orbitBy(dx, dy); else panBy(dx, dy); drag.x = e.clientX; drag.y = e.clientY;
  }
  function onUp(e) {
    pointers.delete(e.pointerId); if (!drag) return;
    if (drag.mode === 'pinch') { if (pointers.size === 0) drag = null; return; }
    if (drag.mode === 'brush') { if (cb.onBrushEnd) cb.onBrushEnd(e); }
    else if (!drag.moved && drag.button === 0 && cb.onClick) cb.onClick(e);
    drag = null;
  }
  function orbitBy(dx, dy) { cam.theta -= dx * 0.0055; cam.phi = M.clamp(cam.phi - dy * 0.0055, 0.0001, 1.62); updateCamera(); }
  function panBy(dx, dy) {
    const r = canvas.getBoundingClientRect(); const k = 2 * cam.dist * Math.tan(camP.fov * Math.PI / 360) / r.height;
    const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    cam.target = [cam.target[0] - right.x * dx * k + up.x * dy * k, Math.max(-1, cam.target[1] - right.y * dx * k + up.y * dy * k), cam.target[2] - right.z * dx * k + up.z * dy * k]; updateCamera();
  }
  function onWheel(e) {
    e.preventDefault(); if (cb.onWheel && cb.onWheel(e)) return;
    const f = Math.exp(M.clamp(e.deltaY, -120, 120) * 0.0015); const p = V.rayPlane(e.clientX, e.clientY, cam.target, M.mul(V.viewDir(), -1));
    const nd = M.clamp(cam.dist * f, 1.2, 140); if (p && f < 1) cam.target = M.lerp3(cam.target, p, (1 - nd / cam.dist) * 0.6);
    cam.dist = nd; updateCamera();
  }
  // a copy of the view (render and copy in one go, as the drawing buffer is not kept): a JPEG thumbnail, or a full-size canvas
  V.snapshot = function (w, h, asCanvas) {
    renderer.render(scene, camera); const src = renderer.domElement; w = w || src.width; h = h || src.height; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const s = Math.max(w / src.width, h / src.height); const dw = src.width * s, dh = src.height * s; g.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
    if (asCanvas) return c; try { return c.toDataURL('image/jpeg', 0.75); } catch (err) { return null; }
  };
  V.renderer = () => renderer;
  return V;
})();
