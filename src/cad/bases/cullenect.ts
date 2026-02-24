/**
 * Cullenect (Webb-style) label base — port of bases/cullenect.py.
 *
 * Supports three geometry versions:
 *   v1.1   — fixed 1u width (36.4mm), depth 1.0, ribs + fillets/chamfers
 *   v2.0.0 — multi-width (u*42-6), depth 1.2, inset border, ribs on 1u
 *   v2+    — same as v2.0.0 but ribs disabled
 */

import {
  draw,
  drawRoundedRectangle,
  type Drawing,
  type Solid,
} from "replicad";
import type { BaseConfig, LabelBaseResult } from "./base.js";
import type { Vec2 } from "../label.js";

export type CullenectVersion = "v1.1" | "v2.0.0" | "v2+";

export const CULLENECT_VERSIONS: { id: CullenectVersion; label: string }[] = [
  { id: "v2.0.0", label: "v2.0.0 (latest)" },
  { id: "v2+", label: "v2+ (no ribs)" },
  { id: "v1.1", label: "v1.1" },
];

/** Convert gridfinity units to mm for cullenect v2: u * 42 - 6 */
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

/** Cut T-shaped ribs and fillet the Z-axis edges they create. */
function cutRibs(solid: Solid, heightMm: number, depth: number): Solid {
  const ribXPositions = [-12.133, 0, 12.133];
  for (const rx of ribXPositions) {
    const rib = ribProfile(rx, depth);
    let ribSolid = rib.sketchOnPlane("XZ").extrude(heightMm / 2) as Solid;
    const ribSolid2 = rib.sketchOnPlane("XZ").extrude(-heightMm / 2) as Solid;
    ribSolid = ribSolid.fuse(ribSolid2);
    solid = solid.cut(ribSolid);
  }

  try {
    solid = solid.fillet(0.5, (e) =>
      e.inDirection("Z").ofLength((l) => l < depth),
    ) as unknown as Solid;
  } catch {
    // Fillet may fail on complex topology
  }

  return solid;
}

/** v1.1: fixed 36.4mm width, depth 1.0, ribs + fillets. */
function buildV11(heightMm: number): LabelBaseResult {
  const widthMm = 36.4;
  const depth = 1.0;

  const bodyProfile = drawRoundedRectangle(widthMm, heightMm, 0.5);
  let solid = bodyProfile.sketchOnPlane("XY").extrude(-depth) as Solid;

  solid = cutRibs(solid, heightMm, depth);

  const area: Vec2 = { x: widthMm, y: heightMm };
  return { solid, area };
}

/** v2.0.0 / v2+: multi-width, depth 1.2, inset border, optional ribs. */
function buildV200(config: BaseConfig, ribs: boolean): LabelBaseResult {
  const widthMm = cullenectWidthMm(config.width);
  const heightMm = config.height ?? 11;
  const depth = 1.2;

  const bodyProfile = drawRoundedRectangle(widthMm, heightMm, 0.5);
  let solid = bodyProfile.sketchOnPlane("XY").extrude(-depth) as Solid;

  // Inset border: subtracted at z=-0.4, extruded -(depth - 0.6)
  const border = insetBorder(widthMm, heightMm);
  const borderSolid = border.sketchOnPlane("XY", -0.4).extrude(-(depth - 0.6)) as Solid;
  solid = solid.cut(borderSolid);

  // Ribs (1u only)
  if (config.width === 1 && ribs) {
    solid = cutRibs(solid, heightMm, depth);
  }

  const area: Vec2 = { x: widthMm, y: heightMm };
  return { solid, area };
}

export function buildCullenectBase(config: BaseConfig): LabelBaseResult {
  const version = (config.version ?? "v2.0.0") as CullenectVersion;

  if (version === "v1.1") {
    return buildV11(config.height ?? 11);
  }

  return buildV200(config, version !== "v2+");
}
