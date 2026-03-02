/**
 * Base geometry entry point.
 */

import { compoundShapes, Sketches, type Solid, type SketchInterface } from "replicad";
import type { BaseConfig, LabelBaseResult } from "./base.js";
import { buildPredBase } from "./pred.js";
import { buildPlainBase } from "./plain.js";
import { buildNoneBase } from "./none.js";
import { buildPredboxBase } from "./predbox.js";
import { buildTailorboxBase } from "./tailorbox.js";
import { buildCullenectBase } from "./cullenect.js";
import { buildModernBase } from "./modern.js";
import { LabelStyle } from "../options.js";

export function buildBase(config: BaseConfig): LabelBaseResult {
  switch (config.baseType) {
    case "pred":
      return buildPredBase(config);
    case "plain":
      return buildPlainBase(config);
    case "none":
      return buildNoneBase(config);
    case "predbox":
      return buildPredboxBase(config);
    case "tailorbox":
      return buildTailorboxBase(config);
    case "cullenect":
      return buildCullenectBase(config);
    case "modern":
      return buildModernBase(config);
    default:
      throw new Error(`Unknown base type: ${config.baseType}`);
  }
}

/**
 * Extrude a label Drawing onto/into a base solid.
 *
 * Z-offsets per plan:
 * - Embossed: label at z=0 (base surface), extrude up by +depth (raised text)
 * - Debossed: label at z=0, extrude down by -depth (cut into surface)
 * - Embedded: label at z=0, extrude up by +depth, returned as separate compound
 *   (not fused to base — allows different colors in slicers)
 */
export interface ExtrudeResult {
  solid: Solid;
  /** For embedded: number of triangles belonging to the base (first body in compound) */
  baseTriangleCount?: number;
}

/**
 * Extrude a label sketch and combine with the base solid using fuse or cut.
 * When the sketch has multiple separate outer shapes (Sketches), extrude and
 * combine each body individually to avoid passing a large compound to
 * OpenCascade's boolean algorithms, which can recurse deeply enough to
 * overflow the WASM call stack (e.g. QR codes with many separate modules).
 */
function extrudeAndCombine(
  sketch: SketchInterface | Sketches,
  depth: number,
  base: Solid | null,
  op: "fuse" | "cut",
): Solid {
  const sign = op === "cut" ? -1 : 1;
  if (sketch instanceof Sketches) {
    let result = base;
    for (const s of sketch.sketches) {
      const part = s.extrude(sign * depth) as Solid;
      result = result ? (result[op](part) as Solid) : part;
    }
    return result!;
  }
  const labelSolid = sketch.extrude(sign * depth) as Solid;
  return base ? (base[op](labelSolid) as Solid) : labelSolid;
}

export function extrudeLabel(
  baseResult: LabelBaseResult,
  labelDrawing: import("replicad").Drawing,
  style: LabelStyle,
  depth: number = 0.4,
): ExtrudeResult {
  const { solid } = baseResult;

  if (style === LabelStyle.EMBOSSED) {
    const sketch = labelDrawing.sketchOnPlane("XY", 0);
    return { solid: extrudeAndCombine(sketch, depth, solid ?? null, "fuse") };
  } else if (style === LabelStyle.DEBOSSED) {
    const sketch = labelDrawing.sketchOnPlane("XY", 0);
    return { solid: extrudeAndCombine(sketch, depth, solid ?? null, "cut") };
  } else {
    // EMBEDDED: flush label for multi-color printing.
    // Cut the label shape down into the base, then fill the void with
    // a separate label solid. The result is visually flat but the slicer
    // can assign different colors to base vs label.
    const sketch = labelDrawing.sketchOnPlane("XY", 0);
    if (solid) {
      const baseCut = extrudeAndCombine(sketch, depth, solid, "cut");
      const labelSolid = extrudeAndCombine(
        labelDrawing.sketchOnPlane("XY", 0), depth, null, "fuse",
      );
      const baseMesh = baseCut.mesh({ tolerance: 0.05, angularTolerance: 5 });
      const baseTriangleCount = baseMesh.triangles.length / 3;
      const compound = compoundShapes([baseCut, labelSolid]) as unknown as Solid;
      return { solid: compound, baseTriangleCount };
    }
    return { solid: extrudeAndCombine(sketch, depth, null, "fuse") };
  }
}

export type { BaseConfig, BaseType, LabelBaseResult } from "./base.js";
export { DEFAULT_MARGINS, DEFAULT_DEPTHS, hasAdjustableDepth, getMaxLabelDepth } from "./base.js";
