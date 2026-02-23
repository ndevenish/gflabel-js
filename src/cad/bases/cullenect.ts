/**
 * Cullenect (Webb-style) label base — port of bases/cullenect.py v2.0.0.
 *
 * Rounded rectangle body with inset border detail and optional T-shaped ribs (1u only).
 */

import {
  draw,
  drawRoundedRectangle,
  type Drawing,
  type Solid,
} from "replicad";
import type { BaseConfig, LabelBaseResult } from "./base.js";
import type { Vec2 } from "../label.js";

/** Convert gridfinity units to mm for cullenect: u * 42 - 6 */
function cullenectWidthMm(widthU: number): number {
  return widthU * 42 - 6;
}

/**
 * Build the inset border (annular ring) subtracted from the body.
 * Outer rounded rect (r=0.5) minus inner rounded rect (r=0.3),
 * with 0.4mm gap on each side.
 */
function insetBorder(widthMm: number, heightMm: number): Drawing {
  const gap = 0.4;
  const outer = drawRoundedRectangle(widthMm, heightMm, 0.5);
  const inner = drawRoundedRectangle(widthMm - gap * 2, heightMm - gap * 2, 0.3);
  return outer.cut(inner);
}

/**
 * Build T-shaped rib profile on XZ plane at a given X position.
 * Stem: 1mm wide, crossbar: 2mm wide.
 */
function ribProfile(x: number, depth: number): Drawing {
  return draw([x - 0.5, -depth])
    .lineTo([x - 0.5, -depth + 0.2])
    .lineTo([x - 1, -depth + 0.2])
    .lineTo([x - 1, -depth + 0.8])
    .lineTo([x + 1, -depth + 0.8])
    .lineTo([x + 1, -depth + 0.2])
    .lineTo([x + 0.5, -depth + 0.2])
    .lineTo([x + 0.5, -depth])
    .close();
}

export function buildCullenectBase(config: BaseConfig): LabelBaseResult {
  const widthMm = cullenectWidthMm(config.width);
  const heightMm = config.height ?? 11;
  const depth = 1.2;

  // Main body
  const bodyProfile = drawRoundedRectangle(widthMm, heightMm, 0.5);
  let solid = bodyProfile.sketchOnPlane("XY").extrude(-depth) as Solid;

  // Inset border: subtracted at z=-0.4, extruded -(depth - 0.6)
  const border = insetBorder(widthMm, heightMm);
  const borderSolid = border.sketchOnPlane("XY", -0.4).extrude(-(depth - 0.6)) as Solid;
  solid = solid.cut(borderSolid);

  // Ribs (1u only): T-shaped profiles on XZ plane
  if (config.width === 1) {
    const ribXPositions = [-12.133, 0, 12.133];
    for (const rx of ribXPositions) {
      const rib = ribProfile(rx, depth);
      // Sketch on XZ plane, extrude ±heightMm/2 along Y
      let ribSolid = rib.sketchOnPlane("XZ").extrude(heightMm / 2) as Solid;
      const ribSolid2 = rib.sketchOnPlane("XZ").extrude(-heightMm / 2) as Solid;
      ribSolid = ribSolid.fuse(ribSolid2);

      solid = solid.cut(ribSolid);
    }

    // Fillet the Z-axis edges left by the rib cuts.
    // Filter to short Z-axis edges near rib X positions (the cut creates
    // Z-parallel edges with length < depth at each rib slot).
    try {
      solid = solid.fillet(0.5, (e) =>
        e.inDirection("Z").ofLength((l) => l < depth),
      ) as unknown as Solid;
    } catch {
      // Fillet may fail on complex topology
    }
  }

  const area: Vec2 = { x: widthMm, y: heightMm };
  return { solid, area };
}
