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

let _font: opentype.Font | null = null;

export async function loadFont(fontData: ArrayBuffer): Promise<void> {
  _font = opentype.parse(fontData);
}

export function getFont(): opentype.Font {
  if (!_font) throw new Error("Font not loaded — call loadFont() first");
  return _font;
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
        cy = cmd.y * scale;
        current.push([cx, cy]);
        break;
      case "L":
        cx = cmd.x * scale;
        cy = cmd.y * scale;
        current.push([cx, cy]);
        break;
      case "C": {
        const pts = cubicBezierPoints(
          cx,
          cy,
          cmd.x1 * scale,
          cmd.y1 * scale,
          cmd.x2 * scale,
          cmd.y2 * scale,
          cmd.x * scale,
          cmd.y * scale,
        );
        current.push(...pts);
        cx = cmd.x * scale;
        cy = cmd.y * scale;
        break;
      }
      case "Q": {
        const pts = quadBezierPoints(
          cx,
          cy,
          cmd.x1 * scale,
          cmd.y1 * scale,
          cmd.x * scale,
          cmd.y * scale,
        );
        current.push(...pts);
        cx = cmd.x * scale;
        cy = cmd.y * scale;
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
  if (points.length < 3) {
    // Degenerate contour, return a tiny rectangle as placeholder
    return drawRectangle(0.001, 0.001);
  }
  const [startX, startY] = points[0]!;
  let pen = draw([startX, startY]);
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]!;
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
export function textToDrawing(text: string, sizeMm: number): Drawing {
  const font = getFont();
  const scale = sizeMm / font.unitsPerEm;
  const path = font.getPath(text, 0, 0, font.unitsPerEm);
  const contours = pathToContours(path.commands, scale);

  if (contours.length === 0) {
    return drawRectangle(0.001, 0.001);
  }

  // Separate outer contours from holes via winding direction.
  // opentype.js uses top-left origin (Y down), so after our scale:
  // - Positive signed area = outer contour
  // - Negative signed area = hole
  const outers: Drawing[] = [];
  const holes: Drawing[] = [];

  for (const contour of contours) {
    const area = signedArea(contour.points);
    const drawing = contourToDrawing(contour.points);
    if (area > 0) {
      outers.push(drawing);
    } else {
      holes.push(drawing);
    }
  }

  // Fuse all outer contours
  let result: Drawing | null = null;
  for (const outer of outers) {
    result = result ? result.fuse(outer) : outer;
  }

  if (!result) {
    return drawRectangle(0.001, 0.001);
  }

  // Cut all holes
  for (const hole of holes) {
    result = result.cut(hole);
  }

  // Center at origin — text is rendered at baseline y=0, so we need to center it
  const bb = result.boundingBox;
  const cx = (bb.center[0]);
  const cy = (bb.center[1]);
  return result.translate([-cx, -cy]);
}

// Re-export Drawing-related helpers that fragments may use
export { draw, drawCircle, drawRectangle };
