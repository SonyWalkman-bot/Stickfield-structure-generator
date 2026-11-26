# Weavefield

Design basketry structures from rings, on a live physical model, and see whether they can be built.

*This repository is named after Stickfield, the structure generator Weavefield grew out of.*

Every rod in Weavefield is a chain of springs that bends and settles under its own weight. Every lashing is a spring
that can slip. What you see is always the relaxed shape, and the stresses, lashing forces and ground reactions come
from it. When the design works, export the cut list and lashing schedule and build it.

![Weavefield: 150 sticks grown on a grotto frame, coloured by stress](docs/screenshot.jpg)

## Try it

**Download [Weavefield.html](../../releases/latest/download/Weavefield.html)** from the latest release and double-click
it. It runs in your browser, entirely on your computer: no install, no account, no internet. It works in a recent
Chrome, Edge, Firefox or Safari on Windows, macOS, Linux or ChromeOS. Phones and tablets can't run an HTML file saved on
them.

Everything is in that one file, so you can share it by email, a shared drive or a USB stick.

## What you can do

- **Start with rings.** Set out baskets of stacked rings with the Basket tool, or lay a sketch of the plan under the
  design and trace it, or let Weavefield find the circles in it. Every ring belongs to a basket. A ring is at least
  1.2 m across (the tightest a soaked 18-20 mm pole bends) and has no upper size: past one 5 m pole it is spliced from
  several, and Weavefield says what it takes a crew to bend, lift and prop it by hand, and which sizes haven't been
  bent yet.
- **Twist and overlap.** Rings can tip, turn round the stack as they go up and drift off centre, so baskets swirl,
  zigzag and fan open; tipped rings cut through each other and are bolted where they cross. Pick any ring to resize,
  tip or move it on its own, add a ring above it or take it out. A basket takes up to 30 rings.
- **Brace the rings.** Lattice, diagonal, stake or spiral bracing. The top can be open, with sticks running up past
  the last ring, or pointed: the bracing carries on past the top ring and is bound together at a point. Every basket
  can lean, taper, flare or bulge.
- **Clad the whole structure.** One skin of thin sticks over every basket at once: where baskets meet it runs across
  the join, never into the space between them, so the whole thing reads as one form. The sticks follow one direction
  field (along the rings, with the twist, rising, flowing or any way), are lashed where they cross a ring or stick,
  and any that would crack or overload the baskets are left off.
- **Build it step by step.** Each ring goes up on its formwork and is braced before the next; then the formwork comes
  out and the basket has to stand. Baskets are bolted together where their rings cross. Scrub the build order to see
  every step settle under its own weight.
- **Check it against the yard.** Poles, sticks, bolts and clamps needed against what you have in stock, and every ring
  or bend beyond what has been tested.

- **Start from a frame.** Spring a cross, dome, tunnel or tripod: rods longer than the span bow into arches in their
  ground sockets. Or place a formwork layout (grotto, nest, tunnel, twin hoops, a spiral of posts, a pole triangle) as
  real members, with scaffolding you strike later.
- **Build by hand.** Spring arches between two points, stand loops, ring the structure with hoops, lay rods along a
  path, weave between two rods, and lash rods together.
- **Grow sticks.** Families of sticks follow flow fields around the members. Each one is held in two places, lashed
  where it crosses others, kept out of openings, and meets the ground steeply. Each batch settles under its weight
  before the next one grows on it.
- **Feel it.** Push and pull any point and read the force your hand needs. Raise the weight to see the margin.
  Lashings past their slip load come undone.
- **Check it.** See peak stress, the hardest-working lashings, ground sockets against the soil, sticks lying uselessly
  on the ground, and rods longer than stock. One click removes overstressed or lying sticks, or binds overloaded
  lashings twice.
- **Replay the build.** Scrub back through the build order to see the half-built structure under its own weight, with
  the scaffolding still in. *Check every stage* charts which stages sink, slip, or overstress a rod before later work
  holds it.
- **Take it to the workshop.** Export a cut list, a lashing schedule with marks on each rod, a Rhino/Fologram model
  with its importer, and an OBJ. Designs save as files and open in any copy of Weavefield.

## How it works

- **Rods** are chains of nodes about 30 cm apart, with stretch and bending springs. Sticks bent cold spring back;
  steam-bent members and soaked sticks keep the shape they were bent to; bundles act partly as one.
- **Lashings** are springs between a point on each of two rods, with a working capacity and a slip load.
- **The solver** relaxes the whole structure continuously (dynamic relaxation with kinetic damping), so every edit
  settles in front of you.
- **Stresses** come from the timber species' stiffness and strength, and **ground sockets** are checked against the
  soil.

Rods pass through each other (only lashings and the ground connect them), stresses are indicative, and the soil model
is simple. Test critical joints and sockets before you build.

## Building from source

You need Node 18 or later and nothing else:

```bash
npm run build    # writes dist/Weavefield.html (the offline copy) and dist/weavefield.html (the published page)
npm test         # physics against beam theory, model operations, growth on every layout
```

The browser tests use Playwright with Chromium:

```bash
npm ci && npx playwright install chromium
npm run test:smoke
npm run test:browser
```

Every push builds the tool and runs the tests on GitHub Actions; the built `Weavefield.html` is attached to each run.
Publishing a release on GitHub (for example `v1.1.0`) builds the tool and attaches `Weavefield.html` and
`Weavefield.zip` to it.

## Contributing

Contributions are welcome, from people and from their coding agents. Start with [CONTRIBUTING.md](CONTRIBUTING.md).
[CLAUDE.md](CLAUDE.md) explains how the code is put together, the physics, the conventions and how to check a change.

## Credits

The rod and lashing physics follow [Basketry by Grunch](https://runchat.com/p/grunch/basketry-684). The stick families,
flow fields, formwork layouts, ground rules and fabrication exports come from Stickfield, the tool Weavefield grew out
of. The offline copy includes [three.js](https://threejs.org) (MIT) and the fonts Bricolage Grotesque, Instrument Sans
and JetBrains Mono (SIL Open Font License 1.1). Timber properties come from PROTA and the Wood Database (sources are
linked in the app).

Weavefield is released under the [MIT licence](LICENSE).
