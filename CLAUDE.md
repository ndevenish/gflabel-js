# CLAUDE.md — gflabel-js

## Project Overview

TypeScript/WebAssembly port of [gflabel](https://github.com/ndevenish/gflabel) (Python/build123d) for generating 3D-printable Gridfinity labels. Runs both as a web app (Vite + React + Three.js) and a Node CLI.

## Commands

- `npm run dev` — Start dev server
- `npm run build` — Type-check and production build
- `npx tsc --noEmit` — Type-check only
- `npx tsx src/cli.ts <base> <labels...> [options]` — CLI usage
- `bash scripts/compare.sh [svg|stl]` — Compare JS vs Python output (requires `../gflabel-py`)

## Architecture

```
src/
  cli.ts              — Node CLI entry point
  App.tsx             — React app root
  main.tsx            — Vite entry
  cad/
    worker.ts         — Web Worker: initializes OpenCascade WASM, handles RENDER/EXPORT
    workerClient.ts   — Promise-based wrapper for worker postMessage API
    label.ts          — LabelRenderer: parses specs, splits columns, renders multi-line labels
                        Returns ColoredDrawing[] throughout (one entry per visible fragment)
    font.ts           — opentype.js glyph → replicad Drawing pipeline, SVG export
                        coloredDrawingsToSVG() emits per-color <g> layers
    options.ts        — LabelStyle enum, RenderOptions, FontOptions, ColoredDrawing type
    bases/
      base.ts         — BaseConfig/LabelBaseResult interfaces
      index.ts        — buildBase() dispatcher, extrudeLabel() with style handling
                        extrudeLabel() accepts ColoredDrawing[], returns colorMap
      pred.ts         — Gridfinity pred-style label base (L-shaped profile, mounting holes, inner recess)
      plain.ts        — Plain rectangular base
    fragments/
      base.ts         — Fragment base class, ModifierFragment, registry, parser (specToFragments)
      hardware.ts     — nut, bolt, washer, head, circle, box, magnet, threaded_insert, etc.
      layout.ts       — Column splitter {|}, alignment {<}/{>}, {measure}, {color(name)}
      spacer.ts       — Expanding spacer {...}
      text.ts         — Text fragment (default for non-braced content)
  components/         — React UI components
```

## Key Technical Details

### CAD Pipeline
- **replicad** wraps OpenCascade WASM for solid modeling (draw → sketch → extrude → fuse/cut/fillet)
- **opentype.js** extracts glyph contours; Y coordinates are negated (opentype is Y-down, replicad is Y-up)
- Glyph holes are paired with their containing outer contour via bounding box before fusing (OpenCascade compound boolean operations silently drop disjoint faces)
- `drawPolysides(..., 6)` needs `.rotate(30)` to match build123d's flat-top hex orientation

### Color System
- `ColoredDrawing = { drawing: Drawing; color: string }` — the unit of label output
- `renderSingleLine()` returns `ColoredDrawing[]`, one per visible fragment, tracking `currentColor`
- `{color(name)}` is a `ModifierFragment` (zero-width, invisible) that updates `currentColor` for subsequent fragments
- `defaultColor` in `RenderOptions` sets the starting color (CLI: `--label-color`, default `"blue"`)
- `extrudeLabel()` groups `ColoredDrawing[]` by color, extrudes each group as a separate solid, builds `colorMap: Array<{triangleStart, triangleCount, color}>`
- For EMBOSSED/EMBEDDED: `colorMap` is populated; for DEBOSSED: no colorMap, viewer falls back to Z-position heuristic
- Base color passed separately to `extrudeLabel()` as `baseColor` (CLI: `--base-color`, default `"orange"`; UI: colour picker, default `#fdf26f`)
- CLI prints a part tree to console after extrusion, showing body names, colors, and triangle counts

### Mesh/Preview
- `solid.mesh()` returns indexed geometry: `vertices`, `normals`, and `triangles` (index buffer)
- Preview de-indexes the mesh for per-face vertex coloring using `colorMap` when present
- Compound mesh bodies are laid out in order: body 0 triangles first, then body 1, etc. — matches individual body mesh counts
- STL export uses `solid.blobSTL()` with its own tessellation params
- STEP export is exact geometry, no tessellation

### Label Styles
- **Embossed**: each color group extruded up from z=0 as separate solid; compound of [base, labelSolid_color1, ...]
- **Debossed**: all drawings fused, cut into base as single solid; no colorMap
- **Embedded**: all drawings fused and cut into base, then per-color fill solids added; compound of [base_cut, fillSolid_color1, ...]

### Pred Base Geometry
- Outer profile: single closed path with L-shaped corners (sharp) and r=0.9 fillets at vertical-to-horizontal transitions only
- Inner profile (embossed): sagittaArc transitions with r=0.4 and r=1.0 fillets; arcs extend **inward** toward center
- Cannot use mirror + fuse for profiles with arcs (replicad 2D boolean errors)
- 3D edge fillets (r=0.2) wrapped in try-catch as they can fail on complex topology

### Column Splitting
- `SPLIT_RE` regex splits specs on `{|}` or `{n|m}` dividers
- When counting capture groups in regex source, use `/\((?!\?)/g` to exclude non-capturing `(?:` groups (JS `String.split` includes capture groups in results)

## Conventions

- Port follows Python gflabel's geometry and naming where possible
- Fragment names match Python: `{nut}`, `{bolt(20)}`, `{washer}`, `{head(hex)}`, `{...}`, `{|}`, `{color(name)}`, etc.
- `ColoredDrawing` defined in `options.ts` to avoid circular imports (font.ts ← layout.ts ← fragments/index.ts ← label.ts)
- Comparison script (`scripts/compare.sh`) generates side-by-side Python vs JS output
- SVG export uses `fill-rule="evenodd"` for multi-path groups (letter holes)
