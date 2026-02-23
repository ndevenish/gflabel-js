/**
 * LabelBase interface — port of bases/__init__.py.
 */

import type { Solid } from "replicad";
import type { Vec2 } from "../label.js";
import type { LabelStyle } from "../options.js";

export type BaseType =
  | "pred"
  | "plain"
  | "none"
  | "predbox"
  | "tailorbox"
  | "cullenect"
  | "modern";

export interface BaseConfig {
  baseType: BaseType;
  /** Width in gridfinity units (for unit-based) or mm (for mm-based) */
  width: number;
  /** Height in mm (optional override) */
  height?: number;
  depth?: number;
  /** Label style — affects base geometry (e.g. recessed for embossed) */
  style?: LabelStyle;
}

export interface LabelBaseResult {
  /** The 3D solid of the base (null for 2D-only / "none" base) */
  solid: Solid | null;
  /** The usable label area in mm [width, height] */
  area: Vec2;
}

export const DEFAULT_MARGINS: Record<string, number> = {
  pred: 0.4,
  plain: 0.2,
  none: 0.2,
  predbox: 3.0,
  tailorbox: 3.0,
  cullenect: 0.0,
  modern: 0.2,
};
