# WIP: QR Code "too much recursion" Fix

## Symptom

Drawing `{qr(M2x3mm)}` (or any QR code) on a pred base throws:

> Error: too much recursion

(Firefox) / `Maximum call stack size exceeded` (Chrome/Node). The same error also
prevented QR icon generation in `scripts/gen-fragment-icons.ts`.

## Root Cause

The pipeline from QR SVG → 3D solid passes through several stages, each of which
was investigated:

### Stage 1 — `svgToDrawing` (polygon-clipping union)

`bwip-js` produces a single `<path>` element whose `d` attribute contains ~38
sub-paths (pre-merged rows of adjacent same-colour QR modules). `svgToDrawing`
parses these into 38 contours, converts to polygons, and calls
`polygonClipping.union(...all)` to merge them.

The original single-spread call `union(polys[0], ...polys.slice(1))` can overflow
for large inputs. Fixed with a sequential pairwise loop. **However this was not
the primary cause of the browser error.**

### Stage 2 — `multiPolygonToDrawing` (replicad 2D fuse)

Because the 38 QR module rectangles are non-adjacent (bwip-js places them with
gaps), the polygon-clipping union returns them unchanged. `multiPolygonToDrawing`
fuses them pairwise via replicad's `Drawing.fuse()`, which internally uses
`fuseIntersectingBlueprints` → `organiseBlueprints` → O(N²) bounding-box and
curve-intersection checks. The result is a `Drawing` whose inner shape is a
`Blueprints([38 Blueprint objects])`. **Expensive but not the overflow.**

### Stage 3 — Extrusion & base fuse ← actual overflow

`extrudeLabel` called:

```ts
const labelSolid = labelDrawing.sketchOnPlane("XY", 0).extrude(depth) as Solid;
base.fuse(labelSolid);
```

For a `Blueprints` inner shape, `Drawing.sketchOnPlane()` returns a replicad
`Sketches` object. `Sketches.extrude()` calls `compoundShapes([38 extruded
rectangular solids])`, producing a `TopoDS_Compound` (not a `Solid`).

Passing a compound of 38 separate bodies to `BRepAlgoAPI_Fuse_3` causes
OpenCascade's WASM to traverse the compound recursively. With ~38 bodies and
OpenCascade's internal recursion depth per body, the total C++ call depth exceeds
the JavaScript/WASM call stack limit in the browser.

## Fix (committed b046704)

Replaced the single `sketch.extrude().fuse(base)` call with `extrudeAndCombine`,
which detects a `Sketches` result and extrudes + combines each body into the base
**one at a time**:

```ts
if (sketch instanceof Sketches) {
  let result = base;
  for (const s of sketch.sketches) {
    const part = s.extrude(sign * depth) as Solid;
    result = result ? (result[op](part) as Solid) : part;
  }
  return result!;
}
```

Each individual rectangular prism fused/cut against the base is a simple
boolean operation. It's passing the full compound at once that overwhelms
OpenCascade.

## Remaining Concerns

- **Performance**: 38 sequential boolean operations on the pred base may be slow
  for large QR codes (higher versions with more modules). Not yet measured.
- **QR icon generation**: `scripts/gen-fragment-icons.ts` still cannot generate
  QR icons via the CAD pipeline (the `svgToDrawing` overflow in the synchronous
  Node context was never fully resolved). The pre-generated `qr.svg` /
  `microqr.svg` (bwip-js raw SVG output with `data-*` metadata) are committed as
  static assets and excluded from regeneration.
- **Higher-version QR codes**: Longer data strings may produce higher QR versions
  (25×25, 29×29, …) with significantly more modules. The fix should scale, but
  very large QR codes could still be slow.
