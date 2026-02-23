/**
 * Modern Gridfinity Case label base — port of bases/modern.py.
 *
 * Tapered extrusion simulated via loft between inner and outer profiles.
 * The 45° taper means walls grow by depth/2 from inner to outer.
 */

import {
  draw,
  drawRectangle,
  type Sketch,
  type Solid,
} from "replicad";
import type { BaseConfig, LabelBaseResult } from "./base.js";
import type { Vec2 } from "../label.js";

/** Discrete width mapping (u → mm). */
const MODERN_WIDTH_MAP: Record<number, number> = {
  3: 31.8,
  4: 50.8,
  5: 75.8,
  6: 115.8,
  7: 140.8,
  8: 140.8,
};

const EXTRA_WIDTH_TOL = 0.317; // mm subtracted from width
const BODY_WIDTH_TOL = 0.083;
const CORNER_OFF = 1.8; // corner chamfer length

/**
 * Draw a rectangle with chamfered top-left and top-right corners.
 * "Top" means positive Y in the profile (the label top edge).
 */
function chamferedRect(w: number, h: number, cornerOff: number) {
  const hw = w / 2;
  const hh = h / 2;
  // Start bottom-left, go clockwise
  return draw([-hw, -hh])
    .lineTo([hw, -hh])
    .lineTo([hw, hh - cornerOff])
    .lineTo([hw - cornerOff, hh])
    .lineTo([-hw + cornerOff, hh])
    .lineTo([-hw, hh - cornerOff])
    .close();
}

export function buildModernBase(config: BaseConfig): LabelBaseResult {
  const rawWidth = MODERN_WIDTH_MAP[config.width];
  if (rawWidth === undefined) {
    throw new Error(
      `Modern base only supports widths 3-8u, got ${config.width}u`,
    );
  }
  const wMm = rawWidth - EXTRA_WIDTH_TOL;
  const hMm = config.height ?? 22.117157;
  const depth = config.depth ?? 2.2;

  // Inner profile dimensions (at mid-depth)
  const wInner = wMm - depth - BODY_WIDTH_TOL;
  const hInner = hMm - depth;

  // Outer profile: expanded by depth/2 in each direction
  const wOuter = wInner + depth;
  const hOuter = hInner + depth;

  // Corner chamfer offset (same proportion for both)
  const innerCorner = CORNER_OFF * Math.SQRT1_2; // sin(45°)
  const outerCorner = innerCorner + depth / 2;

  // Create sketches at three Z planes
  const innerProfile = chamferedRect(wInner, hInner, innerCorner);
  const outerTopProfile = chamferedRect(wOuter, hOuter, outerCorner);
  const outerBottomProfile = chamferedRect(wOuter, hOuter, outerCorner);

  const topSketch = outerTopProfile.sketchOnPlane("XY", 0) as Sketch;
  const bottomSketch = outerBottomProfile.sketchOnPlane("XY", -depth) as Sketch;

  // Loft inner → top and inner → bottom, then fuse
  // Note: loftWith consumes the sketch, so we create two separate inner sketches
  const innerSketchTop = innerProfile.sketchOnPlane("XY", -depth / 2) as Sketch;
  let topHalf = innerSketchTop.loftWith(topSketch, { ruled: true }) as unknown as Solid;
  const innerSketchBottom = chamferedRect(wInner, hInner, innerCorner).sketchOnPlane("XY", -depth / 2) as Sketch;
  const bottomHalf = innerSketchBottom.loftWith(bottomSketch, { ruled: true }) as unknown as Solid;
  let solid = topHalf.fuse(bottomHalf);

  // Flat base box at bottom edge: W_mm × depth(Y) × depth(Z)
  // Python: Box(W_mm, depth, depth) centered at (0, -H_mm/2, -depth/2)
  // → spans Y: [-hMm/2 - depth/2, -hMm/2 + depth/2], Z: [-depth, 0]
  // We draw on XY (W_mm × depth), sketch at z=-depth/2, extrude ±depth/2
  const baseBox = drawRectangle(wMm, depth)
    .sketchOnPlane("XY", -depth / 2)
    .extrude(depth / 2) as Solid;
  const baseBox2 = drawRectangle(wMm, depth)
    .sketchOnPlane("XY", -depth / 2)
    .extrude(-depth / 2) as Solid;
  let baseBoxSolid = baseBox.fuse(baseBox2);
  // Translate so Y-center is at -hMm/2
  baseBoxSolid = baseBoxSolid.translate([0, -hMm / 2, 0]) as unknown as Solid;

  // Chamfer the top Z-axis edges of the base box (at z=0)
  try {
    baseBoxSolid = baseBoxSolid.chamfer(1.2, (e) =>
      e.inPlane("XY", 0),
    ) as unknown as Solid;
  } catch {
    // Chamfer may fail
  }
  solid = solid.fuse(baseBoxSolid);

  // Indent slot cut
  const indentW = wMm - 15.8 + 0.3;
  const indentH = 13;
  const indentDepth = 0.6;
  const indentY = -hMm / 2 + 4.7; // 4.7mm from bottom edge

  const indentSolid = drawRectangle(indentW, indentH)
    .sketchOnPlane("XY", -depth)
    .extrude(-indentDepth) as Solid;
  const indentPositioned = indentSolid.translate([0, indentY + indentH / 2, 0]) as unknown as Solid;

  try {
    solid = solid.cut(indentPositioned);
  } catch {
    // Cut may fail on complex topology
  }

  const area: Vec2 = { x: wMm, y: hMm };
  return { solid, area };
}
