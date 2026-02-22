/**
 * Pred label base geometry — port of bases/pred.py.
 *
 * Creates the physical label body for Gridfinity pred-style labels.
 */

import {
  drawCircle,
  drawRoundedRectangle,
  type Solid,
} from "replicad";
import { LabelStyle } from "../options.js";
import type { BaseConfig, LabelBaseResult } from "./base.js";
import type { Vec2 } from "../label.js";

/**
 * Convert gridfinity units to mm for pred labels.
 * Formula: u * 42mm/u - 4.2mm
 */
function predWidthMm(widthU: number): number {
  return widthU * 42 - 4.2;
}

/**
 * Build a pred label base.
 */
export function buildPredBase(config: BaseConfig): LabelBaseResult {
  const widthMm = predWidthMm(config.width);
  const heightMm = config.height ?? 11.5;
  const recessed = config.style === LabelStyle.EMBOSSED;
  const depth = config.depth ?? 0.4;

  // Build 3D geometry — approximate the pred outer edge with a rounded rectangle
  const outerProfile = drawRoundedRectangle(widthMm, heightMm, 0.9);
  let solid = outerProfile.sketchOnPlane("XY").extrude(depth) as Solid;

  // Also extrude downward
  const solidBottom = outerProfile.sketchOnPlane("XY").extrude(-depth) as Solid;
  solid = solid.fuse(solidBottom);

  if (recessed) {
    // Cut the inner recess from the top
    const innerProfile = drawRoundedRectangle(widthMm - 2.2, heightMm - 1, 0.4);
    const innerSolid = innerProfile.sketchOnPlane("XY", depth).extrude(-depth) as Solid;
    solid = solid.cut(innerSolid);
  } else {
    // Move the whole body down so label surface is at z=0
    solid = solid.translate([0, 0, -depth]) as unknown as Solid;
  }

  // Mounting holes
  const straightWidth = widthMm - 1.9 * 2;
  const holeX = straightWidth / 2 + 0.4;
  const holeCut1 = drawCircle(0.75)
    .translate([holeX, 0])
    .sketchOnPlane("XY")
    .extrude(depth * 2) as Solid;
  const holeCut2 = drawCircle(0.75)
    .translate([-holeX, 0])
    .sketchOnPlane("XY")
    .extrude(depth * 2) as Solid;

  solid = solid.cut(holeCut1.translate([0, 0, -depth]) as unknown as Solid);
  solid = solid.cut(holeCut2.translate([0, 0, -depth]) as unknown as Solid);

  const area: Vec2 = {
    x: widthMm - 5.5,
    y: heightMm - 1,
  };

  return { solid, area };
}
