# Weavefield: notes for Claude and other coding agents

Weavefield grows woven stick structures on a live physical model. Every rod is a chain of springs that bends and settles
under its own weight, every lashing is a spring that can slip, and what the user sees is always the relaxed shape. It
ships as one HTML page: published on claude.ai, and as an offline copy that runs from a single file.

Read this before changing code. The README is for people using the tool; this file is for people changing it.

## Commands

```bash
npm run build          # dist/weavefield.html (published page), dist/Weavefield.html (offline copy), dist/Weavefield.zip, dist/test.html
npm test               # Node tests: physics against beam theory, model operations, growth on every layout (about 10 s, no dependencies)
npm ci && npx playwright install chromium   # once, for the browser tests
npm run test:smoke     # browser: first visit, a tool, undo, saving files (about a minute)
npm run test:offline   # browser: the offline copy from a folder with the network cut off
npm run test:browser   # every browser test (slow: software WebGL); screenshots land in test/out/
npm run fixture        # regenerate test/fixtures/grotto-grown.weavefield.json after a model or growth change
```

To try a change by hand, build and open `dist/Weavefield.html` in a browser. Building needs only Node 18+.

Tools for looking into a design file (save one from Files → Design file):

- `node tools/inspect-stress.js design.json [rodId]` lists the most stressed rods and where their stress comes from.
- `node tools/replay-stages.js design.json [strike]` replays the build stage by stage and prints how each stage stands.
- `node bench/scenes.js [count] [batch]` times growth on every layout.

## How the code is laid out

There is no bundler and there are no imports. `build.js` concatenates `src/*.js` in a fixed order into the page from
`src/template.html`. Every module is an IIFE that adds one namespace to `window.SF`, so order matters.

| File | Namespace | What it does |
|---|---|---|
| `00_math.js` | `SF.M` | vectors, seeded random numbers, small helpers |
| `05_defaults.js` | `SF.Defaults` | timber species, rod profiles, soils, default parameters, stick families, empty design |
| `10_field.js` | `SF.Field` | vector fields (from Stickfield): grids, flow presets, baking, sampling |
| `12_formwork.js` | `SF.Formwork` | formwork elements and layouts (from Stickfield): ground loops, hoops, arches, posts |
| `20_physics.js` | `SF.Phys` | the simulation: `build(model)` turns the design into flat typed arrays; `iterate`/`relax` solve it; `stress`, `reactions`, `grab`/`drop` |
| `30_model.js` | `SF.Model` | the design data and every operation on it: arch, loop, hoop, rod, weave, frames, hoops, lashings, formwork, strike, stages |
| `35_fields.js` | `SF.Fields` | each stick family's flow field over the current members |
| `40_grow.js` | `SF.Grow` | stick growth: `setup` gathers sites and rules, `place` adds sticks that pass them |
| `45_world.js` | `SF.World` | the live world: design plus running simulation, edits with undo and redo, growth in batches, build-order replay |
| `60_checks.js` | `SF.Checks` | summary, ground sockets against the soil, lying sticks, cut list, lashing schedule, Rhino JSON, OBJ, README |
| `80_view.js` | `SF.View` | three.js r128 view: instanced tubes, lashing beads, socket pads, previews, sections, camera, picking |
| `90_app.js` | `window.WF` | app core: state, theme colours, the live loop, drawing, edits, autosave, keyboard, boot |
| `91_tools.js` | | tool rail, hint bar, picking, previews, each tool's clicks, push and pull, growth controls |
| `92_panels.js` | | inspector panels (tool, selection, start, grow, checks, physics, view) and the legend |
| `93_timeline.js` | | build-order bar: scrub, play, check every stage |
| `94_files.js` | | Files drawer, offline copy, saved versions, opening designs (Stickfield too), help, confirm dialog |
| `template.html` | | markup and all CSS, including the light and dark design tokens |

The Node tests load modules 00 to 60 with `test/load.js`, so everything up to `SF.Checks` must run without a DOM.

## The design data (what gets saved)

A design file (`weavefield-design/1`) is
`{ format, saved, name, design: { name, families, strokes, scalarStrokes, formworkEls }, params: { material, grow, ground, view }, model }`
and `model` is `{ rods: [...], joints: [...], meta: { stage, next, events } }`.

A **rod** has:

- `id` like `r12`, and `kind`: stick, frame, arch, loop, hoop, rod, weave, pole, post or ridge
- `pts`, the relaxed node positions (metres, Y up), written back by `World.sync()` once it settles
- `L`, the rest length; `stage`; `closed`
- `fix`, its ground sockets: `{ i, p, d? }`, where `d` is the clamp direction and no `d` means pinned
- `v`, a version: bump it when `pts` are replaced, so warm starts ignore old positions
- optional fields:
  - `profile` (frame, weave or pole; stick when missing) and `bundle`
  - `fam`, the family of a grown stick
  - `held` (on scaffolding: every node fixed) and `temp` (a temporary post)
  - `fw` and `fwId`, if it came from a formwork element
  - `rest`, the shape a pre-bent or steam-bent rod keeps
  - `cls` (cold, soak or straight)
  - `k0`, its curvature × 1000 when it first settled

A **lashing** (`joints`) has:

- `id` like `j7`, and the two rods it ties: `a` at node `ia` (plus `ta` of the way to the next node) and `b` at `ib` (plus `tb`)
- `stage`
- optional fields:
  - `k`, its own stiffness
  - `wraps`, bound that many times: stiffness and capacity times that
  - `grip`, the rest lengths of its grip braces, stored once it first settles

**Stages.** Every edit is a stage (`Model.nextStage`), and growth makes one stage per batch.
`Model.stageModel(m, k)` rebuilds the design as it stood after stage `k`. `meta.events` records each formwork strike, so
the replay can put the scaffolding back.

## The physics (`20_physics.js`)

**Rods** are chains of nodes about `segment_m` (0.3 m) apart.

- Stretch springs: k = AX·EI/v³. AX = 30 is deliberately soft, for fast convergence.
- Bending springs act on each run of three nodes and push x(i−1) − 2·x(i) + x(i+1) towards its rest value, with
  k_b = EI/v³.
- Pre-bent rods (steam-bent frame members, soaked sticks) take their rest values from their rest shape. That shape is
  re-fitted to the rod's current orientation every 32 iterations (Kabsch), so it does not matter how the rod turns.

**Lashings** are zero-length springs (`joint_stiffness`, 20 kN/m) between a point on each rod.

- Grip braces between neighbouring nodes resist the rods turning against each other (`joint_rot`, scaled down for thin
  rods).
- A new lashing's grip follows the rods until the structure nearly settles, then holds, and is stored in `j.grip`.
- A lashing carrying more than `slip_factor` × its capacity comes undone (`World.slip`).

**Ground**

- Nodes stop at half the rod's width above the ground.
- Coulomb friction holds them, with mu from the soil.
- A socket fixes the end node, and for a clamp the next node too, along the rod's end chord.

**Solver.** Dynamic relaxation.

- Nodal mass is 0.5 × the node's stiffness row sum, with Barnes kinetic damping: at each kinetic-energy peak,
  velocities are zeroed after a half step back.
- Damping is viscous while a hand drags a node.
- Settled means the residual |F|/S is below 1e-6 m and no node moves more than 5e-6 m in a step.
- If a node jumps more than 0.2 m in one step, the run restarts with heavier masses.

**Stress** (MPa) is the axial N/A plus the bending E·c·|Δκ|.

- The bending is taken from the bending springs' own vector mismatch, so a rod back at its rest shape carries none.
- It is split into bending into place (E·c1: each rod of a bundle on its own) and added by loads (E·c: the bundle
  acting partly as one).
- Utilisation is stress ÷ (species bending strength × `strength_factor`).

**Units:** metres, newtons and pascals. Y is up in the app; the exports convert to millimetres with Z up.

**Limit:** rods pass through each other. Only lashings and the ground connect them.

`test/t_phys.js` checks the physics against beam theory (cantilever tip deflection, elastica rise) and against statics
(a lashing carries the weight it holds). Keep it passing; if a number moves, say why in the pull request.

## Growth (`40_grow.js`, from Stickfield)

Each family follows a flow-field preset (bridge, wrap, run along, rise, spiral, reach out). A stick is placed like this:

1. It starts at a node of a rod as it now stands, traces its family's field, and is fitted to an arc.
2. It is classed by the strain its bend needs: bent cold (up to `elastic_strain`), soaked and pre-bent (up to
   `soak_strain`), or straight.
3. Its ends snap to rods or the ground.

It is kept only if:

- it is held in two places
- its feet meet the ground steeply (at least 30°), with no humps
- it keeps hoop openings clear

Crossings within `tieRadius` are lashed.

`World.growTick` places a batch (`P.grow.batch`, default 8) once the last batch has settled, or after `P.grow.settle`
ms, so each batch grows on the structure as it stands. Growth in Node is deterministic for a given seed and model. The
browser can grow a slightly different structure, because there each batch only gets a time budget to settle.

## The app (`90` to `94`)

- **State:** `window.WF` (`app`) holds the world `W`, `design`, `P`, the current `tool` and its state `ts`, the
  selection `sel`, `view` and the tool options `opt`.
- **The loop:** `SF.View` calls `app.onFrame` every animation frame.
  - The physics relaxes for a time budget, which grows when frames are slow.
  - Growth ticks, and the build-order replay steps.
  - The structure is redrawn only when something moved (`app.dirty`).
- **Edits:** every design change goes through `app.edit(label, fn(model, stage), opts)`. That calls `World.edit`
  (undo snapshot, a new stage, a warm rebuild of the simulation), then refreshes the panels and timeline and autosaves.
  Tool previews run the same operation on a cloned model (`dryRun`), so a preview shows exactly what a click will add.
- **Panels:**
  - Panels are re-rendered by their render functions.
  - Never re-render one while the pointer is held in the inspector or a text field has focus, or the click is lost;
    `app.pendingRefresh` catches up afterwards.
  - The selection's live numbers update in place (`panels.sel.live`).
- **Colours** come only from the CSS custom properties in `template.html`, in light and dark sets. `readTheme()`
  converts them for three.js (sRGB to linear for materials). Do not hard-code colours in JavaScript.
- **Storage:** `localStorage` keys are `weavefield.autosave.v1` (the design), `weavefield.ui.v1` (view and tool
  options) and `weavefield.versions.v1` (saved versions with thumbnails). Every read and write is in try/catch: the
  page must work without storage.

## Two builds from one source

**Published page** (`dist/weavefield.html`):

- loads three.js r128 from cdnjs and the fonts from Google Fonts
- saves files through the claude.ai downloads capability (`window.claude.use('downloads')`)
- hands out the offline copy, which is published beside it as `Weavefield.html`

**Offline copy** (`dist/Weavefield.html`):

- one self-contained document: three.js and the fonts (base64 woff2) are inside it, from `vendor/`
- runs with `SF.STANDALONE = true`
- saves through ordinary browser downloads
- makes no network requests; `test/pw_offline.js` checks this with the network cut off

Rules that keep both working:

- add no runtime network dependencies
- use `app.confirm`, never `alert`, `confirm` or `prompt`
- everything must work when opened from `file://`

## Conventions

- **JavaScript:** plain ES2020, no frameworks and no transpiling. It must run in current Chrome, Edge, Firefox and
  Safari.
- **Comments:** give each function a one-line comment saying, in plain words, what it is for. Physics constants live
  in `SF.Phys` or `SF.Defaults`, with a comment giving the source or the reason.
- **Words the user sees:** plain, in sentence case, with units on values. Say what happened and what to do next.
  - Say "lashing", not "joint".
  - Say "rod", "stick" or "member", not "element" or "node".
- **What not to commit:** `dist/` (CI builds it and attaches it to releases). Change `test/fixtures/` only with
  `npm run fixture`.

## Checking a change

1. Run `npm run build && npm test`.
2. **Interface:** run `npm run test:smoke`, then look at `test/out/*.png`. For layout, also run `node test/pw_modes.js`
   (dark, phone, tablet).
3. **Building, saving or loading:** run `npm run test:offline`.
4. **Physics:** `t_phys` must stay within its tolerances. `tools/inspect-stress.js` explains where stress comes from.

The browser tests use software WebGL (SwiftShader), so they are slow. Their timings say nothing about speed on a real
GPU.

## Gotchas learned the hard way

- Clamp a ground socket along the rod's end chord, not its true tangent. Otherwise a steam-bent arch is forced out of
  its own shape and shows stress it does not have.
- Take bending stress from the vector mismatch of the bending springs. Adding the magnitudes of placed and load
  curvature double-counts when a rod springs back.
- A rod lying on the ground needs Coulomb friction, or it creeps forever and never settles.
- Rebuilding the simulation recomputes lashing grip from current positions unless `j.grip` is stored. Without it, a
  lashed stick ratchets round a little at every rebuild.
- Re-rendering a panel under a held pointer swallows the click; keep the busy guard.
- In select and remove, lashings are picked before rods (within 9 px). Tests that mean to click a rod must click away
  from lashings.
- A three.js material with `clipShadows` needs `clippingPlanes: []` from the start, or the shadow pass crashes.
- On a slow GPU the frame rate, not the physics, limits growth; the adaptive physics budget in `onFrame` handles it.

## Where it came from

- The rod and lashing physics follow Basketry by Grunch (https://runchat.com/p/grunch/basketry-684).
- The stick families, flow fields, formwork layouts, ground rules and fabrication exports come from Stickfield, the tool
  Weavefield grew out of.
