export type RGB = [number, number, number];

/** Parse a #RRGGBB hex string to an [r,g,b] triple (0-255). Falls back to mid-grey. */
export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** RGB colours (0-255) for the base and the label text — used by 3MF export. */
export interface PartColors {
  base: RGB;
  label: RGB;
}

/** Preview / export colours as hex strings (for `<input type="color">`). */
export interface PreviewColors {
  base: string;
  label: string;
}

/** Colours matching the historical 3D preview look (gridfinity yellow + dark grey). */
export const DEFAULT_PREVIEW_COLORS: PreviewColors = {
  base: "#fdf26f",
  label: "#606060",
};

/** Convert hex preview colours to the RGB triples the 3MF exporter expects. */
export function toPartColors(c: PreviewColors): PartColors {
  return { base: hexToRgb(c.base), label: hexToRgb(c.label) };
}
