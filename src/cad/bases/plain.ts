/**
 * Plain rectangular base — port of bases/plain.py.
 */

import { drawRectangle, type Solid } from "replicad";
import type { BaseConfig, LabelBaseResult } from "./base.js";
import type { Vec2 } from "../label.js";

/**
 * Build a plain rectangular label base.
 */
export function buildPlainBase(config: BaseConfig): LabelBaseResult {
  const widthMm = config.width;
  const heightMm = config.height ?? 15;
  const thickness = 0.8;

  const profile = drawRectangle(widthMm, heightMm);
  let solid = profile.sketchOnPlane("XY").extrude(-thickness) as Solid;

  // Add fillets to the top edges
  try {
    solid = solid.fillet(0.2, (e) => e.inPlane("XY", 0)) as Solid;
  } catch {
    // Fillet may fail on very small geometry — continue without
  }

  const area: Vec2 = {
    x: widthMm,
    y: heightMm,
  };

  return { solid, area };
}
