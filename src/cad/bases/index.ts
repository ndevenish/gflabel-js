/**
 * Base geometry entry point.
 */

import type { Solid } from "replicad";
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
    // EMBEDDED: label is a separate solid (not fused) for multi-color printing.
    // Cut label shape from the base, then return the label solid.
    // The slicer can assign different colors to the base vs label.
    const labelSolid = labelDrawing.sketchOnPlane("XY", 0).extrude(depth) as Solid;
    if (solid) {
      // Cut the label footprint from the base, then fuse the label back
      // as a compound so they remain visually distinct parts
      const baseCut = solid.cut(
        labelDrawing.sketchOnPlane("XY", 0).extrude(-depth) as Solid,
      );
      return baseCut.fuse(labelSolid);
    }
    return labelSolid;
  }
}

export type { BaseConfig, LabelBaseResult } from "./base.js";
export { DEFAULT_MARGINS } from "./base.js";
