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
 */
export function extrudeLabel(
  baseResult: LabelBaseResult,
  labelDrawing: import("replicad").Drawing,
  style: LabelStyle,
  depth: number = 0.4,
): Solid {
  const { solid } = baseResult;

  if (style === LabelStyle.EMBOSSED) {
    const labelSolid = labelDrawing.sketchOnPlane("XY", 0).extrude(depth) as Solid;
    return solid ? solid.fuse(labelSolid) : labelSolid;
  } else if (style === LabelStyle.DEBOSSED) {
    const labelSolid = labelDrawing.sketchOnPlane("XY", 0).extrude(-depth) as Solid;
    return solid ? solid.cut(labelSolid) : labelSolid;
  } else {
    // EMBEDDED
    const labelSolid = labelDrawing.sketchOnPlane("XY", 0).extrude(depth) as Solid;
    return solid ? solid.fuse(labelSolid) : labelSolid;
  }
}

export type { BaseConfig, LabelBaseResult } from "./base.js";
export { DEFAULT_MARGINS } from "./base.js";
