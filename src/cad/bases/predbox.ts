/**
 * Predbox label base — port of bases/predbox.py.
 *
 * Rounded rectangle with chamfered top edge. Shares geometry helper
 * with tailorbox (identical shape, different dimensions).
 */

import { drawRoundedRectangle, type Solid } from "replicad";
import type { BaseConfig, LabelBaseResult } from "./base.js";
import type { Vec2 } from "../label.js";

/** Discrete width mapping for predbox (u → mm). */
const PREDBOX_WIDTH_MAP: Record<number, number> = {
  4: 25.5,
  5: 67.5,
  6: 82,
  7: 82,
};

/**
 * Build a chamfered rounded rectangle base.
 * Shared by predbox and tailorbox.
 */
export function buildChamferedRoundedRectBase(
  widthMm: number,
  heightMm: number,
  depth: number,
  cornerRadius: number,
  chamferRadius: number,
): { solid: Solid; area: Vec2 } {
  const profile = drawRoundedRectangle(widthMm, heightMm, cornerRadius);
  let solid = profile.sketchOnPlane("XY").extrude(-depth) as Solid;

  try {
    solid = solid.chamfer(chamferRadius, (e) => e.inPlane("XY", 0)) as unknown as Solid;
  } catch {
    // Chamfer may fail on small geometry
  }

  const area: Vec2 = {
    x: widthMm - 0.4,
    y: heightMm - 0.4,
  };

  return { solid, area };
}

export function buildPredboxBase(config: BaseConfig): LabelBaseResult {
  const widthMm = PREDBOX_WIDTH_MAP[config.width];
  if (widthMm === undefined) {
    throw new Error(
      `Predbox base only supports widths 4-7u, got ${config.width}u`,
    );
  }
  const heightMm = config.height ?? 24.5;

  return buildChamferedRoundedRectBase(widthMm, heightMm, 0.85, 3.5, 0.2);
}
