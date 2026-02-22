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

  const profile = drawRectangle(widthMm, heightMm);
  const solid = profile.sketchOnPlane("XY").extrude(-0.8) as Solid;

  const area: Vec2 = {
    x: widthMm,
    y: heightMm,
  };

  return { solid, area };
}
