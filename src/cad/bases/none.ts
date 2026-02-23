/**
 * "None" base — no 3D geometry, just defines the label area.
 */

import type { BaseConfig, LabelBaseResult } from "./base.js";
import type { Vec2 } from "../label.js";

export function buildNoneBase(config: BaseConfig): LabelBaseResult {
  const widthMm = config.width;
  const heightMm = config.height ?? 15;

  const area: Vec2 = { x: widthMm, y: heightMm };
  return { solid: null, area };
}
