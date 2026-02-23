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
    font.ts           — opentype.js glyph → replicad Drawing pipeline, SVG export
    options.ts        — LabelStyle enum, RenderOptions, FontOptions
    bases/
      base.ts         — BaseConfig/LabelBaseResult interfaces
      index.ts        — buildBase() dispatcher, extrudeLabel() with style handling
      pred.ts         — Gridfinity pred-style label base (L-shaped profile, mounting holes, inner recess)
      plain.ts        — Plain rectangular base
    fragments/
      base.ts         — Fragment base class, registry, parser (specToFragments)
      hardware.ts     — nut, bolt, washer, head, circle, box, magnet, threaded_insert, etc.
      layout.ts       — Column splitter {|}, alignment {<}/{>}, {measure}
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

### Mesh/Preview
- `solid.mesh()` returns indexed geometry: `vertices`, `normals`, and `triangles` (index buffer)
- Preview de-indexes the mesh for per-face vertex coloring (label vs base by Z position or compound body order)
- STL export uses `solid.blobSTL()` with its own tessellation params
- STEP export is exact geometry, no tessellation

### Label Styles
- **Embossed**: text extruded up from z=0, fused to base. Pred base gets inner recess.
- **Debossed**: text cut down into base from z=0
- **Embedded**: text cut into base, then filled with separate label solid via `compoundShapes()` (keeps bodies separate for multi-color slicing)

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
- Fragment names match Python: `{nut}`, `{bolt(20)}`, `{washer}`, `{head(hex)}`, `{...}`, `{|}`, etc.
- Comparison script (`scripts/compare.sh`) generates side-by-side Python vs JS output
- SVG export uses `fill-rule="evenodd"` for multi-path groups (letter holes)
