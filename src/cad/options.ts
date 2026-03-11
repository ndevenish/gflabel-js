/**
 * Port of options.py — rendering configuration types.
 */

import type { Drawing } from "replicad";

export interface ColoredDrawing {
  drawing: Drawing;
  color: string;
  /** Z-axis scale applied to the extrusion depth (default 1). */
  zScale?: number;
  /** Z-axis offset in mm applied to the extrusion plane origin (default 0). */
  zOffset?: number;
}

export enum LabelStyle {
  EMBOSSED = "embossed",
  DEBOSSED = "debossed",
  EMBEDDED = "embedded",
}

export enum SvgMono {
  NONE = "none",
  IMPORT = "import",
  EXPORT = "export",
  BOTH = "both",
}

export enum SvgBase {
  NONE = "none",
  OUTLINE = "outline",
  SOLID = "solid",
}

export function parseLabelStyle(value: string): LabelStyle {
  const lower = value.toLowerCase();
  for (const style of Object.values(LabelStyle)) {
    if (style === lower) return style;
  }
  throw new Error(`Unknown label style: ${value}`);
}

export enum FontStyle {
  REGULAR = "Regular",
  BOLD = "Bold",
  ITALIC = "Italic",
}

export interface FontOptions {
  font?: string;
  fontStyle: FontStyle;
  fontPath?: string;
  /** Font height in mm. If unset, scales to fill available height. */
  fontHeightMm?: number;
  /** If true, fontHeightMm is exact; if false, it's a maximum. */
  fontHeightExact: boolean;
}

export const DEFAULT_FONT_OPTIONS: FontOptions = {
  fontStyle: FontStyle.REGULAR,
  fontHeightExact: true,
};

export function getAllowedHeight(
  opts: FontOptions,
  requestedHeight: number,
): number {
  if (!requestedHeight) throw new Error("Requested zero height");
  if (opts.fontHeightExact) {
    return opts.fontHeightMm ?? requestedHeight;
  }
  return Math.min(opts.fontHeightMm ?? requestedHeight, requestedHeight);
}

export interface RenderOptions {
  lineSpacingMm: number;
  marginMm: number;
  font: FontOptions;
  allowOverheight: boolean;
  columnGap: number;
  /** Extrusion depth in mm (positive magnitude; style determines direction). */
  depth: number;
  /** Default label color (CSS color name or hex). Used for fragments with no explicit color. */
  defaultColor: string;
  /** When true, TextFragment renders each character as a separate part. */
  textAsParts: boolean;
  /** Controls mono/color treatment for SVG import/export. */
  svgMono: SvgMono;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  lineSpacingMm: 0.1,
  marginMm: 0.4,
  font: DEFAULT_FONT_OPTIONS,
  allowOverheight: true,
  columnGap: 0.4,
  depth: 0.4,
  defaultColor: "blue",
  textAsParts: false,
  svgMono: SvgMono.NONE,
};
