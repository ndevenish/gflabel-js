/**
 * Base geometry entry point.
 */

import { compoundShapes, type Solid } from "replicad";
import type { BaseConfig, LabelBaseResult } from "./base.js";
import { buildPredBase } from "./pred.js";
import { buildPlainBase } from "./plain.js";
import { LabelStyle } from "../options.js";

export function buildBase(config: BaseConfig): LabelBaseResult {
  switch (config.baseType) {
    case "pred":
      return buildPredBase(config);
    case "plain":
      return buildPlainBase(config);
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
export function extrudeLabel(
  baseResult: LabelBaseResult,
  labelDrawing: import("replicad").Drawing,
  style: LabelStyle,
  depth: number = 0.4,
): Solid {
  const { solid } = baseResult;

  if (style === LabelStyle.EMBOSSED) {
    // Raised text fused onto base surface
    const labelSolid = labelDrawing.sketchOnPlane("XY", 0).extrude(depth) as Solid;
    return solid ? solid.fuse(labelSolid) : labelSolid;
  } else if (style === LabelStyle.DEBOSSED) {
    // Text cut into base surface
    const labelSolid = labelDrawing.sketchOnPlane("XY", 0).extrude(-depth) as Solid;
    return solid ? solid.cut(labelSolid) : labelSolid;
  } else {
    // EMBEDDED: flush label for multi-color printing.
    // Cut the label shape down into the base, then fill the void with
    // a separate label solid. The result is visually flat but the slicer
    // can assign different colors to base vs label.
    const labelSolid = labelDrawing.sketchOnPlane("XY", 0).extrude(-depth) as Solid;
    if (solid) {
      const baseCut = solid.cut(labelSolid);
      // Combine as compound (separate bodies) so slicer can assign different colors
      return compoundShapes([baseCut, labelSolid]) as unknown as Solid;
    }
    return labelSolid;
  }
}

export type { BaseConfig, LabelBaseResult } from "./base.js";
export { DEFAULT_MARGINS } from "./base.js";
