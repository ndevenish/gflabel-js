/**
 * Pred label base geometry — port of bases/pred.py.
 *
 * Creates the physical label body for Gridfinity pred-style labels.
 */

import {
  draw,
  drawCircle,
  type Drawing,
  type Solid,
} from "replicad";
import type { BaseConfig, LabelBaseResult } from "./base.js";
import type { Vec2 } from "../label.js";
import { LabelStyle } from "../options.js";

/**
 * Convert gridfinity units to mm for pred labels.
 * Formula: u * 42mm/u - 4.2mm
 */
function predWidthMm(widthU: number): number {
  return widthU * 42 - 4.2;
}

/**
 * Generate the outer edge profile of a pred-label.
 *
 * Port of Python _outer_edge(): The profile has an L-shaped corner
 * at each end (vertical section at 2.85mm height, then transitions
 * to the full height). Only the corner where the vertical meets the
 * top/bottom edge is filleted (r=0.9); the L-step corners are sharp.
 *
 * We draw the full outline as a single closed path to avoid
 * 2D boolean issues with mirrored arc curves.
 */
function outerEdge(widthMm: number, heightMm: number): Drawing {
  const straightWidth = widthMm - 1.9 * 2;
  const hw = straightWidth / 2; // half of straight width
  const hh = heightMm / 2; // half height
  const r = 0.9; // fillet radius (only at vertical-to-horizontal transitions)

  // Python draws one quadrant and mirrors twice. We draw the full outline.
  // L-shaped step corners (at ±2.85mm) are sharp — only the corner at
  // (±(hw+0.9), ±hh) where vertical meets horizontal gets filleted.
  // Start at a sharp L-step corner to avoid collinear start/end issues.
  const profile = draw([-hw - 1.9, 2.85])
    .lineTo([-hw - 0.9, 2.85])
    .lineTo([-hw - 0.9, hh])
    .customCorner(r) // fillet at top-left
    .lineTo([hw + 0.9, hh])
    .customCorner(r) // fillet at top-right
    .lineTo([hw + 0.9, 2.85])
    .lineTo([hw + 1.9, 2.85])
    // Right wall down
    .lineTo([hw + 1.9, -2.85])
    .lineTo([hw + 0.9, -2.85])
    .lineTo([hw + 0.9, -hh])
    .customCorner(r) // fillet at bottom-right
    .lineTo([-hw - 0.9, -hh])
    .customCorner(r) // fillet at bottom-left
    .lineTo([-hw - 0.9, -2.85])
    .lineTo([-hw - 1.9, -2.85])
    // Left wall back up to start
    .close();

  // Subtract mounting holes
  const holeX = hw + 0.4;
  const hole1 = drawCircle(0.75).translate([holeX, 0]);
  const hole2 = drawCircle(0.75).translate([-holeX, 0]);

  return profile.cut(hole1).cut(hole2);
}

/**
 * Generate the inner edge profile for the recessed embossing surface.
 *
 * Port of Python _inner_edge(): smaller inner profile with curved
 * corner transitions (arc r=1.25) and filleted edges (r=0.4).
 * Drawn as full outline to avoid mirror issues.
 */
function innerEdge(widthMm: number, heightMm: number): Drawing {
  const straightWidth = widthMm - 1.9 * 2;
  const hw = straightWidth / 2;
  const innerHH = (heightMm - 1) / 2;
  const arcR = 1.25;
  const r = 0.4; // fillet radius
  const cornerR = 1.0; // fillet between arc and line

  // The inner profile has an arc transition at each corner instead of the
  // L-shaped step. CenterArc center at (±(hw+0.4), 0) with radius 1.25.
  // Arc goes from (center+1.25, 0) to (center, 1.25) — a 90° arc.
  // Sagitta for 90° arc: r * (1 - cos(45°))
  const sagitta = arcR * (1 - Math.SQRT2 / 2);
  const cx = hw + 0.4; // arc center X (positive side)

  // Start at left-top corner. The fillet at this start point is
  // applied by closeWithCustomCorner at the end.
  // The arc extends INWARD (toward center) to (-cx+arcR, 0), creating
  // the raised boss around each mounting hole.
  return draw([-cx, innerHH])
    // Left side: line down to arc start, then arc curving inward
    .lineTo([-cx, arcR])
    .customCorner(cornerR)
    .sagittaArcTo([-cx + arcR, 0], sagitta)
    .sagittaArcTo([-cx, -arcR], sagitta)
    .customCorner(cornerR)
    .lineTo([-cx, -innerHH])
    .customCorner(r)
    // Bottom edge
    .lineTo([cx, -innerHH])
    .customCorner(r)
    // Right side: line up to arc start, then arc curving inward
    .lineTo([cx, -arcR])
    .customCorner(cornerR)
    .sagittaArcTo([cx - arcR, 0], sagitta)
    .sagittaArcTo([cx, arcR], sagitta)
    .customCorner(cornerR)
    .lineTo([cx, innerHH])
    .customCorner(r)
    // Top edge back to start, filleting at start point
    .closeWithCustomCorner(r);
}

/**
 * Build a pred label base.
 *
 * The base is built with label surface at z=0:
 * - Outer edge extruded ±0.4mm (0.8mm total thickness)
 * - Optional inner recess subtracted for embossed labels
 * - Top and bottom edges filleted at r=0.2mm
 */
export function buildPredBase(config: BaseConfig): LabelBaseResult {
  const widthMm = predWidthMm(config.width);
  const heightMm = config.height ?? 11.5;
  const depth = config.depth ?? 0.4;

  const recessed = config.style === LabelStyle.EMBOSSED;

  // Build outer profile and extrude both directions (±depth)
  const outerProfile = outerEdge(widthMm, heightMm);
  let solid = outerProfile.sketchOnPlane("XY").extrude(depth) as Solid;
  const solidBottom = outerProfile.sketchOnPlane("XY").extrude(-depth) as Solid;
  solid = solid.fuse(solidBottom);

  if (recessed) {
    // Cut the inner recess from the top face
    const innerProfile = innerEdge(widthMm, heightMm);
    const recess = innerProfile.sketchOnPlane("XY").extrude(depth) as Solid;
    solid = solid.cut(recess);
  }

  // Fillet top and bottom edges (r=0.2mm)
  try {
    solid = solid.fillet(0.2, (e) =>
      e.inPlane("XY", depth),
    ) as unknown as Solid;
  } catch {
    // Fillet may fail on complex edge topology after recess cut
  }
  try {
    solid = solid.fillet(0.2, (e) =>
      e.inPlane("XY", -depth),
    ) as unknown as Solid;
  } catch {
    // Fillet may fail on complex edge topology
  }

  if (recessed) {
    // For embossed: label surface is at z=0 (top of recess)
    // Part is already positioned correctly
  } else {
    // For flat/debossed: shift down so sketch surface is at z=0
    solid = solid.translate([0, 0, -depth]) as unknown as Solid;
  }

  const area: Vec2 = {
    x: widthMm - 5.5,
    y: heightMm - 1,
  };

  return { solid, area };
}
