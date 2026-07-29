# Simple Signs

A [gSender](https://github.com/Sienci-Labs/gsender) plugin for designing simple
signs and generating GRBL-compliant G-code.

Pick a blank shape, type some text in any font installed on your machine, lay it
out on a grid, and send the toolpath straight to gSender's carve page.

- **Blank shapes** — rectangle, rounded rectangle, ellipse/circle, with holding
  tabs so the part does not break loose on the final pass
- **Hand-placed tabs** — drag them along the profile with mouse or touch, click
  the profile to add one, double-click or long-press to remove one
- **Any system font** — enumerated through the Local Font Access API and parsed
  to real vector outlines, so letters are cut as curves rather than traced from
  pixels
- **Four text strategies** — V-carve, pocket, outline profile, engrave centreline
- **Live preview** — a draggable 2D design canvas plus the same 3D viewer gSender
  uses for its own visualizer
- **Explicit generation** — the canvas is instant, the toolpath is computed on
  demand via **Generate toolpath** (or `Ctrl`/`Cmd`+`Enter`)
- **GRBL 1.1 output** — `G0`/`G1` linear motion only; no canned cycles, no `G43`

## Running it

### Standalone (no gSender needed)

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. A mock bridge stands in for gSender, so everything
works — including system font enumeration. **Load to gSender** downloads the
`.nc` file instead of handing it to the host.

### Inside gSender

The plugin system lives on gSender's `features/plugin-system` branch.

```bash
git clone -b features/plugin-system https://github.com/Sienci-Labs/gsender.git
cd gsender && npm install
```

Copy or symlink this repo into gSender's `plugins/` directory — in development
gSender loads that folder directly, no install step required:

```bash
# from the gsender checkout, on Windows
mklink /D plugins\simple-signs C:\dev\text_plugin
# macOS / Linux
ln -s /path/to/text_plugin plugins/simple-signs
```

Then build this plugin (gSender serves the compiled `ui/` directory, not `src/`):

```bash
cd /path/to/text_plugin
npm run build -- --watch
```

And start gSender:

```bash
cd /path/to/gsender
npm run dev
```

Open **Tools → Simple Signs**. Edits rebuild into `ui/` and the iframe
hot-reloads; adding a brand-new plugin folder still needs a gSender restart.

Alternatively, drop a built copy into gSender's user plugins directory
(`%APPDATA%\gSender\plugins\` on Windows) and restart.

## How it works

```
system font ──▶ opentype.js ──▶ flatten ──▶ union ──▶ offset ──▶ G-code
              (glyph outlines)  (polygons)  (clipper)  (clipper)
```

No off-the-shelf SVG-to-G-code library fitted: `svg-to-gcode` is plotter-only
(pen up/down, no tool compensation, tabs, or depth passes), `potrace` is
Node-only and raster-based, and `makerjs` has no G-code exporter. None handle
tabs, stepdown passes, or V-carve. So the pipeline composes `opentype.js` for
outlines and `clipper-lib` for offsetting and booleans, with a purpose-built
emitter on the end.

| Module | Responsibility |
|---|---|
| `lib/fonts.ts` | `queryLocalFonts()` discovery, lazy `opentype.parse`, file-upload fallback |
| `lib/flatten.ts` | Bézier → polygon, adaptive subdivision to a 0.01 mm chord tolerance |
| `lib/text.ts` | Multi-line layout, kerning, alignment, and the one Y-down → Y-up flip |
| `lib/shapes.ts` | Blank outlines |
| `lib/clipper.ts` | Integer scaling and **non-zero** fill for every boolean |
| `lib/strategies/` | `vcarve`, `pocket`, `outline`, `engrave`, and the blank profile |
| `lib/tabs.ts` | Arc-length tab placement, magnetic snapping, ramped entry and exit |
| `lib/gcode.ts` | GRBL emitter, modal word suppression, mm ↔ inch conversion |

### Coordinate systems

`opentype.js` emits SVG-convention coordinates (Y down). Everything downstream of
`lib/text.ts` works in **design space** — millimetres, Y up, origin at the centre
of the blank. `lib/generate.ts` applies the work-origin shift once, at the end.
The design canvas re-applies a Y-down transform for rendering only.

### Live geometry, on-demand toolpath

The two halves of the pipeline have very different costs. Measured against real
Arial with a two-line sign:

| Strategy | `buildGeometry` | full `generate` |
|---|---|---|
| engrave | 1.9 ms | 9.5 ms |
| outline | 1.5 ms | 8.7 ms |
| pocket | 1.1 ms | 41 ms |
| vcarve | 1.3 ms | 133 ms |

So `buildGeometry` — blank outline, glyph layout, cut line, tab markers — runs
live on every keystroke and every frame of a drag, and the design canvas stays
instant. The toolpath and G-code run only from **Generate toolpath**.

`toolpathSignature` decides when the displayed result has gone stale. It covers
everything the cut depends on and deliberately excludes `gridSpacing` and
`snapToGrid`, which only change how the canvas is drawn. **Load to gSender**,
**Save .nc** and **Copy** all regenerate first if the result is out of date, so
it is not possible to send a program that does not match the design on screen.

### Tab positions are fractions, not millimetres

`Tabs.positions` stores each tab's centre as a fraction of the profile
perimeter. Fractions rather than absolute distances so tabs stay proportionally
placed when the blank is resized, or when a change of tool diameter moves the
offset cut line they sit on. The "count" control redistributes into that array
via `evenTabPositions` rather than living beside it — two sources of truth would
drift the moment anything is dragged.

Dragging projects the pointer onto the profile with `closestPointOnContour`,
then `magnetToEvenSpacing` pulls the result toward a tidy layout if it lands
within ~10 screen pixels of one. Both are pure functions in `lib/`, so the
interaction logic is tested without a DOM.

### Why non-zero fill matters

Glyph counters — the hole in an `o`, the two in a `B` — arrive as subpaths wound
opposite to their outer. Under clipper's even-odd rule a union of overlapping
letters turns the overlap into a hole and the cutter carves a notch through the
middle of them. Every boolean in `lib/clipper.ts` uses non-zero, and callers
cannot override it. `src/lib/clipper.test.ts` pins this down.

### V-carve is an approximation

A V-bit with half-angle θ cuts a cone, so at depth `z` its edge sits `z·tan(θ)`
from the centreline. Inverting that, a ring offset `d` inside the outline belongs
at `z = d / tan(θ)`. Sweeping `d` inward until the offset vanishes gives the
tapered walls and sharp corners — and narrow strokes come out shallower than wide
ones automatically, which is the whole point.

This is offset-based, not a true medial axis: walls are a staircase of rings
rather than a continuous sweep. At the default 0.25 mm ring spacing the steps sit
well under the tool's own cusp height and are invisible in wood. **Check depth on
scrap before committing to a real workpiece.**

## System fonts

`queryLocalFonts()` is the only browser API that hands over font *binaries*,
which is what you need for outlines. It is Chromium-only, requires a secure
context, and is gated by the `local-fonts` Permissions-Policy (default allowlist
`self`). gSender mounts plugin iframes same-origin with `allow-same-origin`, so
the frame is covered — but that is a host detail we do not control, so the call
is feature-detected and every failure path falls back to loading a `.ttf`/`.otf`
by drag-and-drop or file picker.

## Development

```bash
npm run check   # tsc --noEmit
npm test        # vitest — 103 tests
npm run build   # production bundle into ui/
```

The 3D viewer (three.js + `@sienci/gviewer`) is loaded lazily and only once the
Toolpath tab is first opened, keeping the initial iframe load to ~171 kB gzipped.

## Known limitations

- Toolpaths are all linear moves; no arc fitting, so files are larger than they
  strictly need to be.
- Pocketing letters narrower than the cutter is geometrically impossible — the
  plugin warns and emits no text toolpath rather than guessing. Use a smaller
  bit, larger text, or V-carve.
- Ramping applies to tabs only; plunges are straight down.
- No lead-in/lead-out moves.
