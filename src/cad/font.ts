/**
 * Font loading and text-to-Drawing conversion via opentype.js.
 *
 * Port of the text rendering pipeline — replaces build123d's native Text().
 * Uses opentype.js to get glyph outlines, then converts to replicad Drawings.
 */

import opentype from "opentype.js";
import {
  draw,
  drawCircle,
  Drawing,
  drawRectangle,
} from "replicad";

const _fonts = new Map<string, opentype.Font>();
let _activeFont = "open-sans";

export async function loadFont(fontData: ArrayBuffer): Promise<void> {
  _fonts.set("open-sans", opentype.parse(fontData));
}

export async function loadFontNamed(name: string, fontData: ArrayBuffer): Promise<void> {
  _fonts.set(name, opentype.parse(fontData));
}

export function setActiveFont(name: string): void {
  if (!_fonts.has(name)) throw new Error(`Font not loaded: ${name}`);
  _activeFont = name;
}

export function getFont(): opentype.Font {
  const font = _fonts.get(_activeFont);
  if (!font) throw new Error("Font not loaded — call loadFont() first");
  return font;
}

/**
 * Measure the width of text at a given size in mm.
 */
export function measureText(text: string, sizeMm: number): number {
  const font = getFont();
  const scale = sizeMm / font.unitsPerEm;
  return font.getAdvanceWidth(text, font.unitsPerEm) * scale;
}

/**
 * Measure the width of whitespace characters by computing
 * width("a{ws}a") - width("aa"), matching the Python approach.
 */
export function measureWhitespace(ws: string, sizeMm: number): number {
  const w2 = measureText(`a${ws}a`, sizeMm);
  const wn = measureText("aa", sizeMm);
  return w2 - wn;
}

/**
 * Approximate a cubic bezier curve with line segments.
 */
function cubicBezierPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  segments: number = 12,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const x =
      mt * mt * mt * x0 +
      3 * mt * mt * t * x1 +
      3 * mt * t * t * x2 +
      t * t * t * x3;
    const y =
      mt * mt * mt * y0 +
      3 * mt * mt * t * y1 +
      3 * mt * t * t * y2 +
      t * t * t * y3;
    pts.push([x, y]);
  }
  return pts;
}

/**
 * Approximate a quadratic bezier curve with line segments.
 */
function quadBezierPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  segments: number = 12,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const x = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2;
    const y = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2;
    pts.push([x, y]);
  }
  return pts;
}

interface Contour {
  points: [number, number][];
}

/**
 * Convert opentype path commands to a list of closed contours.
 */
function pathToContours(
  commands: opentype.PathCommand[],
  scale: number,
): Contour[] {
  const contours: Contour[] = [];
  let current: [number, number][] = [];
  let cx = 0,
    cy = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case "M":
        if (current.length > 0) {
          contours.push({ points: current });
          current = [];
        }
        cx = cmd.x * scale;
        cy = -cmd.y * scale;
        current.push([cx, cy]);
        break;
      case "L":
        cx = cmd.x * scale;
        cy = -cmd.y * scale;
        current.push([cx, cy]);
        break;
      case "C": {
        const pts = cubicBezierPoints(
          cx,
          cy,
          cmd.x1 * scale,
          -cmd.y1 * scale,
          cmd.x2 * scale,
          -cmd.y2 * scale,
          cmd.x * scale,
          -cmd.y * scale,
        );
        current.push(...pts);
        cx = cmd.x * scale;
        cy = -cmd.y * scale;
        break;
      }
      case "Q": {
        const pts = quadBezierPoints(
          cx,
          cy,
          cmd.x1 * scale,
          -cmd.y1 * scale,
          cmd.x * scale,
          -cmd.y * scale,
        );
        current.push(...pts);
        cx = cmd.x * scale;
        cy = -cmd.y * scale;
        break;
      }
      case "Z":
        if (current.length > 0) {
          contours.push({ points: current });
          current = [];
        }
        break;
    }
  }
  if (current.length > 0) {
    contours.push({ points: current });
  }
  return contours;
}

/**
 * Compute the signed area of a polygon (positive = CCW = outer, negative = CW = hole).
 */
function signedArea(points: [number, number][]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    area += xi * yj - xj * yi;
  }
  return area / 2;
}

/**
 * Convert a contour (list of points) to a replicad Drawing.
 */
function contourToDrawing(points: [number, number][]): Drawing {
  // Deduplicate consecutive near-coincident points
  const EPS = 1e-6;
  const filtered: [number, number][] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const [px, py] = filtered[filtered.length - 1]!;
    const [cx, cy] = points[i]!;
    if (Math.abs(cx - px) > EPS || Math.abs(cy - py) > EPS) {
      filtered.push([cx, cy]);
    }
  }
  // Also check last vs first
  if (filtered.length > 1) {
    const [fx, fy] = filtered[0]!;
    const [lx, ly] = filtered[filtered.length - 1]!;
    if (Math.abs(lx - fx) < EPS && Math.abs(ly - fy) < EPS) {
      filtered.pop();
    }
  }

  if (filtered.length < 3) {
    return drawRectangle(0.001, 0.001);
  }
  const [startX, startY] = filtered[0]!;
  let pen = draw([startX, startY]);
  for (let i = 1; i < filtered.length; i++) {
    const [x, y] = filtered[i]!;
    pen = pen.lineTo([x, y]);
  }
  return pen.close();
}

/**
 * Render text string as a replicad Drawing, centered at origin.
 *
 * @param text - The text string to render
 * @param sizeMm - Font size in mm
 * @returns A Drawing representing the text
 */
export function glyphsToDrawing(text: string, sizeMm: number): Drawing {
  const font = getFont();
  const scale = sizeMm / font.unitsPerEm;
  const path = font.getPath(text, 0, 0, font.unitsPerEm);
  const contours = pathToContours(path.commands, scale);

  if (contours.length === 0) {
    return drawRectangle(0.001, 0.001);
  }

  // Separate outer contours from holes via winding direction.
  // opentype.js Y-down outer contours have positive signedArea; after negating
  // all Y coordinates the sign flips, so outer contours now have negative area.
  // - Negative signed area = outer contour
  // - Positive signed area = hole
  interface ContourInfo {
    points: [number, number][];
    drawing: Drawing;
    area: number;
  }
  const outers: ContourInfo[] = [];
  const holes: ContourInfo[] = [];

  for (const contour of contours) {
    const area = signedArea(contour.points);
    const drawing = contourToDrawing(contour.points);
    if (area < 0) {
      outers.push({ points: contour.points, drawing, area });
    } else {
      holes.push({ points: contour.points, drawing, area });
    }
  }

  // Cut holes from their containing outer contour before fusing.
  // OpenCascade's 2D boolean cut on compound drawings with disjoint faces
  // can incorrectly remove unrelated faces, so we pair each hole with
  // its containing outer and apply the cut individually.
  function boundingBox(pts: [number, number][]): { minX: number; maxX: number; minY: number; maxY: number } {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX, maxX, minY, maxY };
  }

  for (const hole of holes) {
    const hbb = boundingBox(hole.points);
    // Find the smallest outer contour that contains this hole's bounding box
    let bestIdx = -1;
    let bestArea = -Infinity;
    for (let i = 0; i < outers.length; i++) {
      const obb = boundingBox(outers[i]!.points);
      if (obb.minX <= hbb.minX && obb.maxX >= hbb.maxX &&
          obb.minY <= hbb.minY && obb.maxY >= hbb.maxY) {
        // This outer contains the hole; pick the smallest (least negative area)
        if (outers[i]!.area > bestArea) {
          bestArea = outers[i]!.area;
          bestIdx = i;
        }
      }
    }
    if (bestIdx >= 0) {
      outers[bestIdx]!.drawing = outers[bestIdx]!.drawing.cut(hole.drawing);
    }
  }

  // Fuse all outer contours (holes already cut)
  let result: Drawing | null = null;
  for (const outer of outers) {
    result = result ? result.fuse(outer.drawing) : outer.drawing;
  }

  if (!result) {
    return drawRectangle(0.001, 0.001);
  }

  // Center at origin — text is rendered at baseline y=0, so we need to center it
  const bb = result.boundingBox;
  const cx = (bb.center[0]);
  const cy = (bb.center[1]);
  return result.translate([-cx, -cy]);
}

/** Round numeric values in an SVG string to `dp` decimal places. */
function roundSvgNumbers(svg: string, dp: number): string {
  return svg.replace(/-?\d+\.\d+/g, (m) => {
    const n = parseFloat(m);
    const r = n.toFixed(dp);
    // Strip trailing zeros: "1.50" → "1.5", "2.00" → "2"
    return r.replace(/\.?0+$/, "");
  });
}

/**
 * Export a Drawing as a filled SVG string, matching Python's output style.
 * Coordinates are rounded to `precision` decimal places (default 3 ≈ 0.001mm).
 */
export function drawingToFilledSVG(
  drawing: Drawing,
  precision = 3,
  meta?: Record<string, string>,
): string {
  const vb = drawing.toSVGViewBox();
  const paths = drawing.toSVGPaths();
  // toSVGPaths returns string[][] — groups of path d-strings per face.
  // Flatten all d-strings into a single <path> with fill-rule="evenodd"
  // so that contained sub-faces render as holes (e.g. fuse-ieee symbol
  // where boolean cuts fail due to shared edges).
  const allD: string[] = [];
  for (const entry of paths) {
    const group = Array.isArray(entry) ? entry : [entry];
    allD.push(...group);
  }
  const pathEl =
    allD.length === 1
      ? `<path d="${allD[0]}" />`
      : `<path fill-rule="evenodd" d="${allD.join(" ")}" />`;
  const dataAttrs = meta
    ? " " + Object.entries(meta).map(([k, v]) => `data-${k}="${v}"`).join(" ")
    : "";
  const raw = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="black" stroke="none"${dataAttrs}>${pathEl}</svg>`;
  return roundSvgNumbers(raw, precision);
}

// Re-export Drawing-related helpers that fragments may use
export { draw, drawCircle, drawRectangle };
