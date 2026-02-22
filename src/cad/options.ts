/**
 * Port of options.py — rendering configuration types.
 */

export enum LabelStyle {
  EMBOSSED = "embossed",
  DEBOSSED = "debossed",
  EMBEDDED = "embedded",
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
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  lineSpacingMm: 0.1,
  marginMm: 0.4,
  font: DEFAULT_FONT_OPTIONS,
  allowOverheight: true,
  columnGap: 0.4,
};
