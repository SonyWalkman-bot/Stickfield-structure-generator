/* Stickfield — 3D vector field: grid, base presets (shell surface flows), brushes, sketch layers, scalar channels */
SF.Field = (function () {
  'use strict';
  const M = SF.M;

  function makeGrid(min, max, h) {
    const nx = Math.round((max[0] - min[0]) / h) + 1;
    const ny = Math.round((max[1] - min[1]) / h) + 1;
    const nz = Math.round((max[2] - min[2]) / h) + 1;
    return { min: min.slice(), h, nx, ny, nz, N: nx * ny * nz,
      max: [min[0] + (nx - 1) * h, min[1] + (ny - 1) * h, min[2] + (nz - 1) * h] };
  }
  const gidx = (g, i, j, k) => i + g.nx * (j + g.ny * k);

  // ---------- formwork triangle & shell surface ----------
  function triInfo(V) { // V: [[x,z]x3]
    const c = [(V[0][0] + V[1][0] + V[2][0]) / 3, (V[0][1] + V[1][1] + V[2][1]) / 3];
    // orientation: ensure counter-clockwise in (x,z) so inward normals are consistent
    const area2 = (V[1][0] - V[0][0]) * (V[2][1] - V[0][1]) - (V[2][0] - V[0][0]) * (V[1][1] - V[0][1]);
    const edges = [];
    for (let i = 0; i < 3; i++) {
      const a = V[i], b = V[(i + 1) % 3], o = V[(i + 2) % 3];
      const ex = b[0] - a[0], ez = b[1] - a[1]; const L = Math.hypot(ex, ez) || 1e-9;
      let nx = -ez / L, nz = ex / L; // left normal
      if ((c[0] - a[0]) * nx + (c[1] - a[1]) * nz < 0) { nx = -nx; nz = -nz; }
      const hgt = (o[0] - a[0]) * nx + (o[1] - a[1]) * nz;
      edges.push({ a, b, dir: [ex / L, ez / L], n: [nx, nz], len: L, h: hgt, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
    }
    return { V: V.map((v) => v.slice()), c, edges, area: Math.abs(area2) / 2 };
  }
  // shell height and gradient at (x,z). H = Hc * (27 l0 l1 l2)^g
  function shellAt(tri, shell, x, z) {
    const d = [0, 0, 0], lam = [0, 0, 0];
    let inside = true, distOut = 0;
    for (let i = 0; i < 3; i++) {
      const e = tri.edges[i];
      d[i] = (x - e.a[0]) * e.n[0] + (z - e.a[1]) * e.n[1];
      if (d[i] < 0) { inside = false; distOut = Math.max(distOut, -d[i]); }
      lam[i] = d[i] / e.h;
    }
    if (!inside) return { H: 0, gx: 0, gz: 0, inside: false, distOut, lam };
    // H = Hc * ((P+e)^g - e^g) / ((1+e)^g - e^g), P = 27 l0 l1 l2: smooth over the triangle, finite springing angle
    const g = shell.fullness, e = shell.spring == null ? 0.08 : shell.spring;
    const P = Math.max(0, 27 * lam[0] * lam[1] * lam[2]);
    const e0 = Math.pow(e, g), norm = Math.pow(1 + e, g) - e0;
    const H = shell.crown * (Math.pow(P + e, g) - e0) / norm;
    const dHdP = shell.crown * g * Math.pow(P + e, g - 1) / norm;
    // dP/dx = 27 * sum_i (prod_{j != i} l_j) * n_i.x / h_i
    let gx = 0, gz = 0;
    for (let i = 0; i < 3; i++) {
      const o = 27 * lam[(i + 1) % 3] * lam[(i + 2) % 3] / tri.edges[i].h;
      gx += o * tri.edges[i].n[0]; gz += o * tri.edges[i].n[1];
    }
    gx *= dHdP; gz *= dHdP;
    return { H, gx, gz, inside: true, distOut: 0, lam };
  }

  // direction of a preset flow at point (x,y,z); writes into out, returns magnitude
  function presetDir(preset, tri, shell, x, y, z, out) {
    out[0] = out[1] = out[2] = 0;
    if (preset === 'none') return 0;
    const s = shellAt(tri, shell, x, z);
    let fade = s.inside ? 1 : 1 - M.smooth(s.distOut / 0.9);
    if (fade <= 0) return 0;
    // surface normal (unnormalised): (-gx, 1, -gz)
    let Nx = -s.gx, Ny = 1, Nz = -s.gz; const nl = Math.hypot(Nx, Ny, Nz); Nx /= nl; Ny /= nl; Nz /= nl;
    let tx = 0, ty = 0, tz = 0;
    if (preset.startsWith('edge')) {
      const e = tri.edges[+preset[4] || 0];
      const dx = e.n[0], dz = e.n[1];
      if (!s.inside) {
        // beyond the far edges the flow lands: keep heading across, turning down to the ground
        tx = dx * 0.35; ty = -1; tz = dz * 0.35;
      } else {
        const mx = -dz, mz = dx; // m = d x up (horizontal, along edge)
        // t = m x N  (m = (mx,0,mz))
        tx = 0 * Nz - mz * Ny; ty = mz * Nx - mx * Nz; tz = mx * Ny - 0 * Nx;
        if (tx * dx + tz * dz < 0) { tx = -tx; ty = -ty; tz = -tz; }
      }
    } else if (!s.inside && (preset === 'swirl' || preset === 'radial')) {
      const cx = x - tri.c[0], cz = z - tri.c[1]; const cl = Math.hypot(cx, cz) || 1e-6;
      tx = (cx / cl) * 0.35; ty = -1; tz = (cz / cl) * 0.35;
    } else if (preset === 'rings' || preset === 'swirl' || preset === 'radial') {
      const cx = x - tri.c[0], cz = z - tri.c[1]; const cl = Math.hypot(cx, cz) || 1e-6;
      // contour (horizontal tangent): (-gz, 0, gx), oriented counter-clockwise
      let rx = -s.gz, rz = s.gx; const gl = Math.hypot(rx, rz);
      const circx = -cz / cl, circz = cx / cl;
      if (gl < 1e-3) { rx = circx; rz = circz; } else { rx /= gl; rz /= gl; const blend = M.smooth(gl / 0.4); rx = rx * blend + circx * (1 - blend); rz = rz * blend + circz * (1 - blend); const l2 = Math.hypot(rx, rz) || 1; rx /= l2; rz /= l2; }
      if (rx * circx + rz * circz < 0) { rx = -rx; rz = -rz; }
      if (preset === 'rings') { tx = rx; ty = 0; tz = rz; }
      else {
        // spirals and meridians fade out round an oculus at the crown instead of piling into one bundle
        fade *= M.smooth((cl - 0.45) / 0.8);
        // meridian (steepest ascent on the surface): (gx, gx^2+gz^2, gz) normalised; at crown fall back to radial-up
        let ux = s.gx, uy = s.gx * s.gx + s.gz * s.gz, uz = s.gz; let ul = Math.hypot(ux, uy, uz);
        if (ul < 1e-4) { ux = -cx / cl; uy = 0; uz = -cz / cl; ul = 1; }
        ux /= ul; uy /= ul; uz /= ul;
        if (preset === 'radial') { tx = ux; ty = uy; tz = uz; }
        else { const ca = Math.cos(0.62), sa = Math.sin(0.62); tx = ux * ca + rx * sa; ty = uy * ca; tz = uz * ca + rz * sa; }
      }
    }
    const tl = Math.hypot(tx, ty, tz) || 1;
    out[0] = (tx / tl) * fade; out[1] = (ty / tl) * fade; out[2] = (tz / tl) * fade;
    return fade;
  }

  // bake any direction function onto the grid
  function bakeFn(grid, fn) {
    const F = new Float32Array(grid.N * 3); const o = [0, 0, 0];
    for (let k = 0; k < grid.nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
      fn(grid.min[0] + i * grid.h, grid.min[1] + j * grid.h, grid.min[2] + k * grid.h, o);
      const q = 3 * gidx(grid, i, j, k); F[q] = o[0]; F[q + 1] = o[1]; F[q + 2] = o[2];
    }
    return F;
  }
  function bakeBase(grid, tri, shell, preset) {
    const F = new Float32Array(grid.N * 3); const o = [0, 0, 0];
    for (let k = 0; k < grid.nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
      const x = grid.min[0] + i * grid.h, y = grid.min[1] + j * grid.h, z = grid.min[2] + k * grid.h;
      presetDir(preset, tri, shell, x, y, z, o);
      const q = 3 * gidx(grid, i, j, k); F[q] = o[0]; F[q + 1] = o[1]; F[q + 2] = o[2];
    }
    return F;
  }

  // ---------- sampling ----------
  function sampleVec(g, F, x, y, z, out) {
    let fx = (x - g.min[0]) / g.h, fy = (y - g.min[1]) / g.h, fz = (z - g.min[2]) / g.h;
    if (fx < 0) fx = 0; if (fy < 0) fy = 0; if (fz < 0) fz = 0;
    if (fx > g.nx - 1.0001) fx = g.nx - 1.0001; if (fy > g.ny - 1.0001) fy = g.ny - 1.0001; if (fz > g.nz - 1.0001) fz = g.nz - 1.0001;
    const i = fx | 0, j = fy | 0, k = fz | 0; const tx = fx - i, ty = fy - j, tz = fz - k;
    const sx = g.nx, sxy = g.nx * g.ny;
    const b = i + sx * j + sxy * k;
    const w000 = (1 - tx) * (1 - ty) * (1 - tz), w100 = tx * (1 - ty) * (1 - tz), w010 = (1 - tx) * ty * (1 - tz), w110 = tx * ty * (1 - tz);
    const w001 = (1 - tx) * (1 - ty) * tz, w101 = tx * (1 - ty) * tz, w011 = (1 - tx) * ty * tz, w111 = tx * ty * tz;
    const i000 = 3 * b, i100 = 3 * (b + 1), i010 = 3 * (b + sx), i110 = 3 * (b + sx + 1);
    const i001 = 3 * (b + sxy), i101 = 3 * (b + sxy + 1), i011 = 3 * (b + sxy + sx), i111 = 3 * (b + sxy + sx + 1);
    for (let c = 0; c < 3; c++) {
      out[c] = F[i000 + c] * w000 + F[i100 + c] * w100 + F[i010 + c] * w010 + F[i110 + c] * w110 +
        F[i001 + c] * w001 + F[i101 + c] * w101 + F[i011 + c] * w011 + F[i111 + c] * w111;
    }
    return out;
  }
  function sampleScalar(g, S, x, y, z) {
    let fx = (x - g.min[0]) / g.h, fy = (y - g.min[1]) / g.h, fz = (z - g.min[2]) / g.h;
    if (fx < 0) fx = 0; if (fy < 0) fy = 0; if (fz < 0) fz = 0;
    if (fx > g.nx - 1.0001) fx = g.nx - 1.0001; if (fy > g.ny - 1.0001) fy = g.ny - 1.0001; if (fz > g.nz - 1.0001) fz = g.nz - 1.0001;
    const i = fx | 0, j = fy | 0, k = fz | 0; const tx = fx - i, ty = fy - j, tz = fz - k;
    const sx = g.nx, sxy = g.nx * g.ny; const b = i + sx * j + sxy * k;
    return S[b] * (1 - tx) * (1 - ty) * (1 - tz) + S[b + 1] * tx * (1 - ty) * (1 - tz) + S[b + sx] * (1 - tx) * ty * (1 - tz) + S[b + sx + 1] * tx * ty * (1 - tz) +
      S[b + sxy] * (1 - tx) * (1 - ty) * tz + S[b + sxy + 1] * tx * (1 - ty) * tz + S[b + sxy + sx] * (1 - tx) * ty * tz + S[b + sxy + sx + 1] * tx * ty * tz;
  }
  const inDomain = (g, x, y, z) => x >= g.min[0] && x <= g.max[0] && y >= g.min[1] - 0.05 && y <= g.max[1] && z >= g.min[2] && z <= g.max[2];

  // ---------- brushes ----------
  // dab: {p:[3], d:[3] stroke dir, a:[3] view axis, r, s, inv}
  function forNodes(g, p, r, fn) {
    const i0 = Math.max(0, Math.floor((p[0] - r - g.min[0]) / g.h)), i1 = Math.min(g.nx - 1, Math.ceil((p[0] + r - g.min[0]) / g.h));
    const j0 = Math.max(0, Math.floor((p[1] - r - g.min[1]) / g.h)), j1 = Math.min(g.ny - 1, Math.ceil((p[1] + r - g.min[1]) / g.h));
    const k0 = Math.max(0, Math.floor((p[2] - r - g.min[2]) / g.h)), k1 = Math.min(g.nz - 1, Math.ceil((p[2] + r - g.min[2]) / g.h));
    const r2 = r * r;
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = g.min[0] + i * g.h, y = g.min[1] + j * g.h, z = g.min[2] + k * g.h;
      const dx = x - p[0], dy = y - p[1], dz = z - p[2]; const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      const q = Math.sqrt(d2) / r; const w = (1 - q * q) * (1 - q * q);
      fn(gidx(g, i, j, k), w, dx, dy, dz, i, j, k);
    }
  }
  function applyDab(g, F, B, dab, tool) {
    const s = dab.s, d = dab.d, a = dab.a, r = dab.r;
    const sign = dab.inv ? -1 : 1;
    forNodes(g, dab.p, r, (n, w0, rx, ry, rz, i, j, k) => {
      const w = w0 * s; const q = 3 * n;
      let vx = F[q], vy = F[q + 1], vz = F[q + 2]; const m = Math.hypot(vx, vy, vz);
      if (tool === 'comb') {
        const tm = Math.max(m, 1.0); const t = Math.min(1, w * 0.26);
        const sx = d[0] * sign, sy = d[1] * sign, sz = d[2] * sign;
        vx += (sx * tm - vx) * t; vy += (sy * tm - vy) * t; vz += (sz * tm - vz) * t;
      } else if (tool === 'pinch' || tool === 'spread') {
        if (m < 1e-6) return;
        const hx = vx / m, hy = vy / m, hz = vz / m;
        // rel = centre - node = -r
        let px = -rx, py = -ry, pz = -rz; const pd = px * hx + py * hy + pz * hz;
        px -= pd * hx; py -= pd * hy; pz -= pd * hz;
        const sg = ((tool === 'pinch') ? 1 : -1) * sign; const f = (w * 0.5 * sg) / r;
        let nx = hx + px * f, ny = hy + py * f, nz = hz + pz * f; const nl = Math.hypot(nx, ny, nz) || 1;
        vx = (nx / nl) * m; vy = (ny / nl) * m; vz = (nz / nl) * m;
      } else if (tool === 'swirl' || tool === 'twist') {
        if (m < 1e-6) return;
        const hx = vx / m, hy = vy / m, hz = vz / m;
        const ax = tool === 'swirl' ? a : d; // axis
        let ppx = rx, ppy = ry, ppz = rz;
        if (tool === 'twist') { const pd = rx * ax[0] + ry * ax[1] + rz * ax[2]; ppx -= pd * ax[0]; ppy -= pd * ax[1]; ppz -= pd * ax[2]; }
        // tangential: axis x rel
        let tx = ax[1] * ppz - ax[2] * ppy, ty = ax[2] * ppx - ax[0] * ppz, tz = ax[0] * ppy - ax[1] * ppx;
        const tl = Math.hypot(tx, ty, tz); if (tl < 1e-6) return;
        const f = (w * 0.5 * sign) / tl;
        let nx = hx + tx * f, ny = hy + ty * f, nz = hz + tz * f; const nl = Math.hypot(nx, ny, nz) || 1;
        vx = (nx / nl) * m; vy = (ny / nl) * m; vz = (nz / nl) * m;
      } else if (tool === 'smooth') {
        let sx = 0, sy = 0, sz = 0, c = 0;
        const nb = [[i - 1, j, k], [i + 1, j, k], [i, j - 1, k], [i, j + 1, k], [i, j, k - 1], [i, j, k + 1]];
        for (const [ii, jj, kk] of nb) {
          if (ii < 0 || jj < 0 || kk < 0 || ii >= g.nx || jj >= g.ny || kk >= g.nz) continue;
          const qq = 3 * gidx(g, ii, jj, kk);
          // sign-align neighbours (line-field friendly)
          const dd = F[qq] * vx + F[qq + 1] * vy + F[qq + 2] * vz; const sgn = dd < 0 ? -1 : 1;
          sx += F[qq] * sgn; sy += F[qq + 1] * sgn; sz += F[qq + 2] * sgn; c++;
        }
        if (!c) return; const t = Math.min(1, w * 0.45);
        vx += (sx / c - vx) * t; vy += (sy / c - vy) * t; vz += (sz / c - vz) * t;
      } else if (tool === 'restore') {
        const t = Math.min(1, w * 0.5);
        vx += (B[q] - vx) * t; vy += (B[q + 1] - vy) * t; vz += (B[q + 2] - vz) * t;
      } else if (tool === 'void') {
        const t = 1 - Math.min(1, w * 0.45); vx *= t; vy *= t; vz *= t;
      }
      F[q] = vx; F[q + 1] = vy; F[q + 2] = vz;
    });
  }
  // coherent multi-family brush: the family nearest the stroke (or the lead) is changed as usual and the same
  // rotation is applied to every other family at that node, so the weave bends together and keeps its crossings
  function rotTo(a, b) { // rotation taking unit a to unit b: returns {k, c, s} or null
    const cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
    const sn = Math.hypot(cx, cy, cz), cs = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (sn < 1e-7) return null; return { k: [cx / sn, cy / sn, cz / sn], c: cs, s: sn };
  }
  function applyRot(F, q, R) {
    const vx = F[q], vy = F[q + 1], vz = F[q + 2]; const k = R.k; const c = R.c, s = R.s;
    const kv0 = k[1] * vz - k[2] * vy, kv1 = k[2] * vx - k[0] * vz, kv2 = k[0] * vy - k[1] * vx; const kd = (k[0] * vx + k[1] * vy + k[2] * vz) * (1 - c);
    F[q] = vx * c + kv0 * s + k[0] * kd; F[q + 1] = vy * c + kv1 * s + k[1] * kd; F[q + 2] = vz * c + kv2 * s + k[2] * kd;
  }
  const tmpF = new Float32Array(3);
  function applyDabMulti(g, Fs, Bs, dab, tool) {
    if (Fs.length < 2 || !(tool === 'comb' || tool === 'pinch' || tool === 'spread' || tool === 'swirl' || tool === 'twist')) { Fs.forEach((F, i) => applyDab(g, F, Bs[i], dab, tool)); return; }
    const d = dab.d; const hasDir = Math.hypot(d[0], d[1], d[2]) > 0.5;
    forNodes(g, dab.p, dab.r, (n, w0) => {
      const q = 3 * n; let lead = -1, best = -1, empty = true;
      for (let k = 0; k < Fs.length; k++) {
        const F = Fs[k]; const m = Math.hypot(F[q], F[q + 1], F[q + 2]); if (m > 0.2) empty = false; else continue;
        const al = hasDir ? Math.abs(F[q] * d[0] + F[q + 1] * d[1] + F[q + 2] * d[2]) / m : (k === 0 ? 1 : 0);
        if (al > best) { best = al; lead = k; }
      }
      if (empty || lead < 0) { Fs.forEach((F, i) => applyDabNode(g, F, Bs[i], dab, tool, n, w0)); return; }
      const F = Fs[lead]; const a = [F[q], F[q + 1], F[q + 2]]; const am = Math.hypot(a[0], a[1], a[2]); a[0] /= am; a[1] /= am; a[2] /= am;
      // run the single-family update on a scratch copy of the lead vector
      tmpF[0] = F[q]; tmpF[1] = F[q + 1]; tmpF[2] = F[q + 2];
      applyDabNodeArr(tmpF, Bs[lead], q, dab, tool, n, w0, g, F);
      const bm = Math.hypot(tmpF[0], tmpF[1], tmpF[2]); if (bm < 1e-9) return;
      const R = rotTo(a, [tmpF[0] / bm, tmpF[1] / bm, tmpF[2] / bm]); if (!R) return;
      for (let k = 0; k < Fs.length; k++) applyRot(Fs[k], q, R);
    });
  }
  // single-node versions of applyDab used by the multi-family path
  function applyDabNode(g, F, B, dab, tool, n, w0) { const one = { p: dab.p, d: dab.d, a: dab.a, r: dab.r, s: dab.s, inv: dab.inv }; nodeUpdate(g, F, B, one, tool, n, w0, F, 3 * n); }
  function applyDabNodeArr(arr, B, q, dab, tool, n, w0, g, F) { nodeUpdate(g, arr, B, dab, tool, n, w0, F, q, true); }
  function nodeUpdate(g, T, B, dab, tool, n, w0, Fsrc, q, scratch) {
    const i = n % g.nx, j = Math.floor(n / g.nx) % g.ny, k = Math.floor(n / (g.nx * g.ny));
    const x = g.min[0] + i * g.h, y = g.min[1] + j * g.h, z = g.min[2] + k * g.h; const rx = x - dab.p[0], ry = y - dab.p[1], rz = z - dab.p[2];
    const o = scratch ? 0 : q; const w = w0 * dab.s; const sign = dab.inv ? -1 : 1; const d = dab.d, a = dab.a, r = dab.r;
    let vx = T[o], vy = T[o + 1], vz = T[o + 2]; const m = Math.hypot(vx, vy, vz);
    if (tool === 'comb') {
      const tm = Math.max(m, 1.0); const t = Math.min(1, w * 0.26); let sx = d[0] * sign, sy = d[1] * sign, sz = d[2] * sign;
      if (m > 0.2 && vx * sx + vy * sy + vz * sz < 0) { sx = -sx; sy = -sy; sz = -sz; } // multi-family: keep each family's own sense
      vx += (sx * tm - vx) * t; vy += (sy * tm - vy) * t; vz += (sz * tm - vz) * t;
    } else if (tool === 'pinch' || tool === 'spread') {
      if (m < 1e-6) return; const hx = vx / m, hy = vy / m, hz = vz / m; let px = -rx, py = -ry, pz = -rz; const pd = px * hx + py * hy + pz * hz; px -= pd * hx; py -= pd * hy; pz -= pd * hz;
      const f = (w * 0.5 * ((tool === 'pinch') ? 1 : -1) * sign) / r; let nx = hx + px * f, ny = hy + py * f, nz = hz + pz * f; const nl = Math.hypot(nx, ny, nz) || 1; vx = nx / nl * m; vy = ny / nl * m; vz = nz / nl * m;
    } else if (tool === 'swirl' || tool === 'twist') {
      if (m < 1e-6) return; const hx = vx / m, hy = vy / m, hz = vz / m; const ax = tool === 'swirl' ? a : d; let ppx = rx, ppy = ry, ppz = rz;
      if (tool === 'twist') { const pd = rx * ax[0] + ry * ax[1] + rz * ax[2]; ppx -= pd * ax[0]; ppy -= pd * ax[1]; ppz -= pd * ax[2]; }
      let tx = ax[1] * ppz - ax[2] * ppy, ty = ax[2] * ppx - ax[0] * ppz, tz = ax[0] * ppy - ax[1] * ppx; const tl = Math.hypot(tx, ty, tz); if (tl < 1e-6) return;
      const f = (w * 0.5 * sign) / tl; let nx = hx + tx * f, ny = hy + ty * f, nz = hz + tz * f; const nl = Math.hypot(nx, ny, nz) || 1; vx = nx / nl * m; vy = ny / nl * m; vz = nz / nl * m;
    } else return;
    T[o] = vx; T[o + 1] = vy; T[o + 2] = vz;
  }
  // coherent sketch: rotate the nearest family toward the sketch stroke, carry the rotation to the others
  function applySketchMulti(grid, Fs, layer0, Sdens) {
    if (Fs.length < 2) { if (Fs.length) applySketch(grid, Fs[0], layer0, Sdens); return; }
    const L = layerFrame(layer0, grid); const maps = L.maps; if (!maps) return;
    const doDir = L.target !== 'density', doDen = L.target !== 'direction' && Sdens;
    for (let k = 0; k < grid.nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
      const x = grid.min[0] + i * grid.h, y = grid.min[1] + j * grid.h, z = grid.min[2] + k * grid.h;
      const rx = x - L.origin[0], ry = y - L.origin[1], rz = z - L.origin[2];
      const u = (rx * L.U[0] + ry * L.U[1] + rz * L.U[2]) / L.width + 0.5; const v = 0.5 - (rx * L.V[0] + ry * L.V[1] + rz * L.V[2]) / L.height;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const dep = rx * L.W[0] + ry * L.W[1] + rz * L.W[2]; const wd = L.extrude ? 1 : Math.exp(-(dep * dep) / (2 * L.depth * L.depth)); if (wd < 0.02) continue;
      const wt = sampleMap(maps, maps.wt, u, v) * wd * L.strength; if (wt < 0.002) continue;
      const n = gidx(grid, i, j, k); const q = 3 * n;
      if (doDir) {
        const ox = sampleMap(maps, maps.ox, u, v), oy = sampleMap(maps, maps.oy, u, v);
        let dx = L.U[0] * ox + L.V[0] * oy, dy = L.U[1] * ox + L.V[1] * oy, dz = L.U[2] * ox + L.V[2] * oy; const dl = Math.hypot(dx, dy, dz);
        if (dl > 1e-6) {
          dx /= dl; dy /= dl; dz /= dl; let lead = -1, best = -1;
          for (let f = 0; f < Fs.length; f++) { const F = Fs[f]; const m = Math.hypot(F[q], F[q + 1], F[q + 2]); if (m < 0.2) continue; const al = Math.abs(F[q] * dx + F[q + 1] * dy + F[q + 2] * dz) / m; if (al > best) { best = al; lead = f; } }
          if (lead < 0) { for (const F of Fs) { const t = Math.min(1, wt); F[q] += (dx - F[q]) * t; F[q + 1] += (dy - F[q + 1]) * t; F[q + 2] += (dz - F[q + 2]) * t; } }
          else {
            const F = Fs[lead]; const m = Math.hypot(F[q], F[q + 1], F[q + 2]); const a = [F[q] / m, F[q + 1] / m, F[q + 2] / m];
            if (a[0] * dx + a[1] * dy + a[2] * dz < 0) { dx = -dx; dy = -dy; dz = -dz; }
            const t = Math.min(1, wt); let bx = a[0] + (dx - a[0]) * t, by = a[1] + (dy - a[1]) * t, bz = a[2] + (dz - a[2]) * t; const bl = Math.hypot(bx, by, bz);
            if (bl > 1e-6) { const R = rotTo(a, [bx / bl, by / bl, bz / bl]); if (R) for (const G of Fs) applyRot(G, q, R); }
          }
        }
      }
      if (doDen) { const ink = sampleMap(maps, maps.ink, u, v); Sdens[n] = M.clamp(Sdens[n] + (ink - 0.35) * Math.min(1, wt) * 0.9, 0, 1); }
    }
  }

  function applyScalarDab(g, S, dab, mode, value) {
    const s = dab.s;
    forNodes(g, dab.p, dab.r, (n, w0, rx, ry, rz, i, j, k) => {
      const w = w0 * s; let v = S[n];
      if (mode === 'add') v += w * 0.22;
      else if (mode === 'sub') v -= w * 0.22;
      else if (mode === 'set') v += (value - v) * Math.min(1, w * 0.5);
      else if (mode === 'smooth') {
        let sum = 0, c = 0;
        const nb = [[i - 1, j, k], [i + 1, j, k], [i, j - 1, k], [i, j + 1, k], [i, j, k - 1], [i, j, k + 1]];
        for (const [ii, jj, kk] of nb) { if (ii < 0 || jj < 0 || kk < 0 || ii >= g.nx || jj >= g.ny || kk >= g.nz) continue; sum += S[gidx(g, ii, jj, kk)]; c++; }
        if (c) v += (sum / c - v) * Math.min(1, w * 0.6);
      }
      S[n] = v < 0 ? 0 : v > 1 ? 1 : v;
    });
  }

  // symmetry expansion of a dab about the triangle centroid (vertical axis)
  function expandSymmetry(dab, sym, tri) {
    const out = [dab]; if (!sym || sym === 'off') return out;
    const c = tri.c;
    const rotY = (v, ang, isPoint) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const x = isPoint ? v[0] - c[0] : v[0], z = isPoint ? v[2] - c[1] : v[2];
      const nx = x * ca - z * sa, nz = x * sa + z * ca;
      return isPoint ? [nx + c[0], v[1], nz + c[1]] : [nx, v[1], nz];
    };
    // mirror plane: vertical, through centroid and vertex 0
    const m0 = [tri.V[0][0] - c[0], tri.V[0][1] - c[1]]; const ml = Math.hypot(m0[0], m0[1]) || 1;
    const pn = [-m0[1] / ml, 0, m0[0] / ml]; // plane normal (horizontal)
    const refl = (v, isPoint) => {
      const q = isPoint ? [v[0] - c[0], v[1], v[2] - c[1]] : v.slice();
      const dd = q[0] * pn[0] + q[2] * pn[2];
      const r = [q[0] - 2 * dd * pn[0], q[1], q[2] - 2 * dd * pn[2]];
      return isPoint ? [r[0] + c[0], r[1], r[2] + c[1]] : r;
    };
    const mk = (p, d, a, inv) => Object.assign({}, dab, { p, d, a, inv });
    const rots = (sym === '3fold' || sym === '6fold') ? [2 * Math.PI / 3, 4 * Math.PI / 3] : [];
    for (const ang of rots) out.push(mk(rotY(dab.p, ang, true), rotY(dab.d, ang), rotY(dab.a, ang), dab.inv));
    if (sym === 'mirror' || sym === '6fold') {
      const base = out.slice();
      for (const b of base) {
        const a2 = refl(b.a); out.push(mk(refl(b.p, true), refl(b.d), [-a2[0], -a2[1], -a2[2]], b.inv));
      }
    }
    return out;
  }

  // ---------- sketch layers ----------
  // layer: {plane:'front'|'side'|'top'|'view', origin:[3], U:[3], V:[3], W:[3], width, height, depth, extrude, strength, target, maps:{w,h,ox,oy,wt,ink}}
  function layerFrame(layer, grid) {
    if (layer.plane === 'view' && layer.U) return layer;
    const cx = (grid.min[0] + grid.max[0]) / 2, cz = (grid.min[2] + grid.max[2]) / 2;
    const off = layer.offset || 0; const sc = layer.scale || 1;
    const width = 11.5 * sc; const aspect = layer.maps ? layer.maps.h / layer.maps.w : 0.75; const height = width * aspect;
    let origin, U, V, W;
    const lift = layer.lift || 0;
    if (layer.plane === 'front') { origin = [cx + (layer.shiftU || 0), height / 2 + lift, cz + off]; U = [1, 0, 0]; V = [0, 1, 0]; W = [0, 0, 1]; }
    else if (layer.plane === 'side') { origin = [cx + off, height / 2 + lift, cz + (layer.shiftU || 0)]; U = [0, 0, -1]; V = [0, 1, 0]; W = [1, 0, 0]; }
    else { origin = [cx + (layer.shiftU || 0), 0.15 + off + lift, cz]; U = [1, 0, 0]; V = [0, 0, -1]; W = [0, 1, 0]; }
    return Object.assign({}, layer, { origin, U, V, W, width, height });
  }
  function sampleMap(maps, arr, u, v) { // u,v in [0,1]
    const x = u * (maps.w - 1), y = v * (maps.h - 1);
    const i = Math.max(0, Math.min(maps.w - 2, x | 0)), j = Math.max(0, Math.min(maps.h - 2, y | 0));
    const tx = M.clamp(x - i, 0, 1), ty = M.clamp(y - j, 0, 1); const w = maps.w;
    return arr[j * w + i] * (1 - tx) * (1 - ty) + arr[j * w + i + 1] * tx * (1 - ty) + arr[(j + 1) * w + i] * (1 - tx) * ty + arr[(j + 1) * w + i + 1] * tx * ty;
  }
  function applySketch(grid, F, layer0, Sdens) {
    const L = layerFrame(layer0, grid); const maps = L.maps; if (!maps) return;
    const doDir = L.target !== 'density', doDen = L.target !== 'direction' && Sdens;
    for (let k = 0; k < grid.nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
      const x = grid.min[0] + i * grid.h, y = grid.min[1] + j * grid.h, z = grid.min[2] + k * grid.h;
      const rx = x - L.origin[0], ry = y - L.origin[1], rz = z - L.origin[2];
      const u = (rx * L.U[0] + ry * L.U[1] + rz * L.U[2]) / L.width + 0.5;
      const v = 0.5 - (rx * L.V[0] + ry * L.V[1] + rz * L.V[2]) / L.height;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const dep = rx * L.W[0] + ry * L.W[1] + rz * L.W[2];
      const wd = L.extrude ? 1 : Math.exp(-(dep * dep) / (2 * L.depth * L.depth));
      if (wd < 0.02) continue;
      const wt = sampleMap(maps, maps.wt, u, v) * wd * L.strength;
      if (wt < 0.002) continue;
      const n = gidx(grid, i, j, k);
      if (doDir) {
        const ox = sampleMap(maps, maps.ox, u, v), oy = sampleMap(maps, maps.oy, u, v);
        let dx = L.U[0] * ox + L.V[0] * oy, dy = L.U[1] * ox + L.V[1] * oy, dz = L.U[2] * ox + L.V[2] * oy;
        const dl = Math.hypot(dx, dy, dz); if (dl < 1e-6) continue; dx /= dl; dy /= dl; dz /= dl;
        const q = 3 * n; const vx = F[q], vy = F[q + 1], vz = F[q + 2]; const m = Math.hypot(vx, vy, vz);
        if (vx * dx + vy * dy + vz * dz < 0) { dx = -dx; dy = -dy; dz = -dz; }
        const tm = Math.max(m, 1); const t = Math.min(1, wt);
        F[q] = vx + (dx * tm - vx) * t; F[q + 1] = vy + (dy * tm - vy) * t; F[q + 2] = vz + (dz * tm - vz) * t;
      }
      if (doDen) {
        const ink = sampleMap(maps, maps.ink, u, v);
        Sdens[n] = M.clamp(Sdens[n] + (ink - 0.35) * Math.min(1, wt) * 0.9, 0, 1);
      }
    }
  }

  // ---------- channels ----------
  const CHANNELS = [
    { id: 'density', label: 'Density', def: 0.55, help: 'Stick spacing: low = sparse, high = tight' },
    { id: 'length', label: 'Length', def: 1.0, help: 'Maximum stick run: low values stop sticks early' },
    { id: 'section', label: 'Section', def: 1.0, help: 'Preferred stick width, 8 mm (0) to 20 mm (1)' },
    { id: 'finish', label: 'Finish', def: 0.0, help: 'Surface finish: natural (0) to charred (1)' },
    { id: 'pattern', label: 'Pattern', def: 0.75, help: 'Etch intensity and depth' }
  ];

  return { makeGrid, gidx, triInfo, shellAt, presetDir, bakeBase, bakeFn, sampleVec, sampleScalar, inDomain,
    applyDab, applyDabMulti, applySketchMulti, applyScalarDab, expandSymmetry, layerFrame, applySketch, sampleMap, CHANNELS };
})();
