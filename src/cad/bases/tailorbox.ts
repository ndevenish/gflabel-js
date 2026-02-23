/**
 * Tailorbox label base — port of bases/tailorbox.py.
 *
 * Same shape as predbox (rounded rectangle + chamfer) but different dimensions.
 * Only supports 5u width (96.75mm).
 */

import type { BaseConfig, LabelBaseResult } from "./base.js";
import { buildChamferedRoundedRectBase } from "./predbox.js";

const TAILORBOX_WIDTH_MM = 96.75;

export function buildTailorboxBase(config: BaseConfig): LabelBaseResult {
  if (config.width !== 5) {
    throw new Error(`Tailorbox base only supports width 5u, got ${config.width}u`);
  }
  const heightMm = config.height ?? 24.8;

  return buildChamferedRoundedRectBase(TAILORBOX_WIDTH_MM, heightMm, 1.25, 3.5, 0.2);
}
