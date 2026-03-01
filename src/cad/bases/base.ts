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

export const BASE_TYPES: BaseType[] = [
  "pred", "plain", "none", "predbox", "tailorbox", "cullenect", "modern",
];

export interface BaseConfig {
  baseType: BaseType;
  /** Width in gridfinity units (for unit-based) or mm (for mm-based) */
  width: number;
  /** Height in mm (optional override) */
  height?: number;
  /** Base depth in mm (affects base structure height) */
  depth?: number;
  /** Label text extrusion/cut depth in mm (affects text relief height) */
  labelDepth?: number;
  /** Label style — affects base geometry (e.g. recessed for embossed) */
  style?: LabelStyle;
  /** Geometry version (base-specific, e.g. cullenect "v1.1" / "v2.0.0" / "v2+") */
  version?: string;
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

/** Default depth values per base type (only for adjustable bases) */
export const DEFAULT_DEPTHS: Partial<Record<BaseType, number>> = {
  pred: 0.4,
  plain: 0.8,
  modern: 2.2,
};

/** Check if a base type supports adjustable depth */
export function hasAdjustableDepth(baseType: BaseType): boolean {
  return baseType === "pred" || baseType === "plain" || baseType === "modern";
}

/** Maximum label depth (extrusion/cut depth) per base type in mm */
export function getMaxLabelDepth(baseType: BaseType): number {
  switch (baseType) {
    case "cullenect":
      return 0.2; // Limited by inset border depth
    case "pred":
    case "modern":
    case "plain":
    case "predbox":
    case "tailorbox":
    case "none":
    default:
      return 5.0; // General max for other bases
  }
}
