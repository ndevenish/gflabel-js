/**
 * SVG path parser → replicad Drawing.
 *
 * Parses SVG <path d="..."> into closed contours, then converts to
 * replicad Drawings using the same contour→Drawing pattern as font.ts.
 *
 * Handles: M/m, L/l, H/h, V/v, C/c, A/a, Z/z commands.
 * SVG Y-down coordinates are flipped to replicad Y-up.
 */

import { draw, Drawing, drawRectangle } from "replicad";
import polygonClipping from "polygon-clipping";

// ── Contour types ──────────────────────────────────────────────

interface Contour {
  points: [number, number][];
}

// ── Bezier helpers ─────────────────────────────────────────────

function cubicBezierPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  segments = 12,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    pts.push([
      mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
      mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
    ]);
  }
  return pts;
}

// ── Arc conversion ─────────────────────────────────────────────

/**
 * Convert an SVG arc to line segments.
 * Based on the SVG spec arc parameterization → center parameterization.
 */
function arcToPoints(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  xAxisRotation: number,
  largeArcFlag: number,
  sweepFlag: number,
  x2: number,
  y2: number,
  segments = 24,
): [number, number][] {
  // Handle degenerate cases
  if (rx === 0 || ry === 0) return [[x2, y2]];
  rx = Math.abs(rx);
  ry = Math.abs(ry);

  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // Step 1: Compute (x1', y1')
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Step 2: Compute (cx', cy')
  let rxSq = rx * rx;
  let rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  // Ensure radii are large enough
  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  let num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  let den = rxSq * y1pSq + rySq * x1pSq;
  if (num < 0) num = 0;
  let sq = Math.sqrt(num / den);
  if (largeArcFlag === sweepFlag) sq = -sq;

  const cxp = sq * (rx * y1p) / ry;
  const cyp = sq * (-(ry * x1p) / rx);

  // Step 3: Compute (cx, cy)
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // Step 4: Compute θ1 and dθ
  function angle(ux: number, uy: number, vx: number, vy: number): number {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  }

  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dtheta = angle(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry,
  );

  if (sweepFlag === 0 && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweepFlag === 1 && dtheta < 0) dtheta += 2 * Math.PI;

  // Generate points
  const pts: [number, number][] = [];
  for (let i = 1; i <= segments; i++) {
    const t = theta1 + (i / segments) * dtheta;
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    pts.push([
      cosPhi * rx * cosT - sinPhi * ry * sinT + cx,
      sinPhi * rx * cosT + cosPhi * ry * sinT + cy,
    ]);
  }
  return pts;
}

// ── SVG path tokenizer ─────────────────────────────────────────

/** Tokenize an SVG path d-string into commands and numbers. */
function tokenize(d: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) tokens.push(m[1]);
    else if (m[2]) tokens.push(parseFloat(m[2]));
  }
  return tokens;
}

/** Read n numbers from tokens starting at index i. */
function readNumbers(
  tokens: (string | number)[],
  i: number,
  n: number,
): [number[], number] {
  const nums: number[] = [];
  while (nums.length < n && i < tokens.length) {
    const tok = tokens[i];
    if (typeof tok === "number") {
      nums.push(tok);
      i++;
    } else {
      break;
    }
  }
  if (nums.length < n) throw new Error(`Expected ${n} numbers, got ${nums.length}`);
  return [nums, i];
}

// ── SVG path → contours ────────────────────────────────────────

/**
 * Parse an SVG path d-string into contours.
 * Y coordinates are negated (SVG Y-down → replicad Y-up).
 */
export function parseSvgPathD(d: string): Contour[] {
  const tokens = tokenize(d);
  const contours: Contour[] = [];
  let current: [number, number][] = [];
  let cx = 0,
    cy = 0;
  let startX = 0,
    startY = 0;
  let lastCx2: number | undefined, lastCy2: number | undefined; // for smooth curves

  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i];
    if (typeof cmd !== "string") {
      i++;
      continue;
    }
    i++;

    const isRelative = cmd === cmd.toLowerCase();
    const CMD = cmd.toUpperCase();

    if (CMD === "Z") {
      if (current.length > 0) {
        contours.push({ points: current });
        current = [];
      }
      cx = startX;
      cy = startY;
      lastCx2 = lastCy2 = undefined;
      continue;
    }

    // Process repeated parameter groups for the command.
    // SVG spec: implicit repeats after M/m are treated as L/l.
    let first = true;
    let implicitCmd = CMD;
    while (i <= tokens.length) {
      // Check if next token is a number (implicit repeat) or a command
      if (!first && (i >= tokens.length || typeof tokens[i] === "string")) break;
      first = false;

      if (implicitCmd === "M") {
        const [nums, ni] = readNumbers(tokens, i, 2);
        i = ni;
        if (current.length > 0) {
          contours.push({ points: current });
          current = [];
        }
        cx = isRelative ? cx + nums[0]! : nums[0]!;
        cy = isRelative ? cy + nums[1]! : nums[1]!;
        startX = cx;
        startY = cy;
        current.push([cx, -cy]);
        lastCx2 = lastCy2 = undefined;
        // After first M pair, implicit repeats become L
        implicitCmd = "L";
      } else if (implicitCmd === "L") {
        const [nums, ni] = readNumbers(tokens, i, 2);
        i = ni;
        cx = isRelative ? cx + nums[0]! : nums[0]!;
        cy = isRelative ? cy + nums[1]! : nums[1]!;
        current.push([cx, -cy]);
        lastCx2 = lastCy2 = undefined;
      } else if (implicitCmd === "H") {
        const [nums, ni] = readNumbers(tokens, i, 1);
        i = ni;
        cx = isRelative ? cx + nums[0]! : nums[0]!;
        current.push([cx, -cy]);
        lastCx2 = lastCy2 = undefined;
      } else if (implicitCmd === "V") {
        const [nums, ni] = readNumbers(tokens, i, 1);
        i = ni;
        cy = isRelative ? cy + nums[0]! : nums[0]!;
        current.push([cx, -cy]);
        lastCx2 = lastCy2 = undefined;
      } else if (implicitCmd === "C") {
        const [nums, ni] = readNumbers(tokens, i, 6);
        i = ni;
        const x1 = isRelative ? cx + nums[0]! : nums[0]!;
        const y1 = isRelative ? cy + nums[1]! : nums[1]!;
        const x2 = isRelative ? cx + nums[2]! : nums[2]!;
        const y2 = isRelative ? cy + nums[3]! : nums[3]!;
        const x = isRelative ? cx + nums[4]! : nums[4]!;
        const y = isRelative ? cy + nums[5]! : nums[5]!;
        const pts = cubicBezierPoints(cx, -cy, x1, -y1, x2, -y2, x, -y);
        current.push(...pts);
        lastCx2 = x2;
        lastCy2 = y2;
        cx = x;
        cy = y;
      } else if (implicitCmd === "S") {
        // Smooth cubic: reflect last control point
        const [nums, ni] = readNumbers(tokens, i, 4);
        i = ni;
        const rx1 = lastCx2 !== undefined ? 2 * cx - lastCx2 : cx;
        const ry1 = lastCy2 !== undefined ? 2 * cy - lastCy2 : cy;
        const x2 = isRelative ? cx + nums[0]! : nums[0]!;
        const y2 = isRelative ? cy + nums[1]! : nums[1]!;
        const x = isRelative ? cx + nums[2]! : nums[2]!;
        const y = isRelative ? cy + nums[3]! : nums[3]!;
        const pts = cubicBezierPoints(cx, -cy, rx1, -ry1, x2, -y2, x, -y);
        current.push(...pts);
        lastCx2 = x2;
        lastCy2 = y2;
        cx = x;
        cy = y;
      } else if (implicitCmd === "Q") {
        const [nums, ni] = readNumbers(tokens, i, 4);
        i = ni;
        const x1 = isRelative ? cx + nums[0]! : nums[0]!;
        const y1 = isRelative ? cy + nums[1]! : nums[1]!;
        const x = isRelative ? cx + nums[2]! : nums[2]!;
        const y = isRelative ? cy + nums[3]! : nums[3]!;
        // Convert quadratic to cubic
        const cp1x = cx + (2 / 3) * (x1 - cx);
        const cp1y = cy + (2 / 3) * (y1 - cy);
        const cp2x = x + (2 / 3) * (x1 - x);
        const cp2y = y + (2 / 3) * (y1 - y);
        const pts = cubicBezierPoints(cx, -cy, cp1x, -cp1y, cp2x, -cp2y, x, -y);
        current.push(...pts);
        lastCx2 = undefined;
        lastCy2 = undefined;
        cx = x;
        cy = y;
      } else if (implicitCmd === "T") {
        // Smooth quadratic - not common in these SVGs but handle anyway
        const [nums, ni] = readNumbers(tokens, i, 2);
        i = ni;
        const x = isRelative ? cx + nums[0]! : nums[0]!;
        const y = isRelative ? cy + nums[1]! : nums[1]!;
        current.push([x, -y]);
        cx = x;
        cy = y;
        lastCx2 = lastCy2 = undefined;
      } else if (implicitCmd === "A") {
        const [nums, ni] = readNumbers(tokens, i, 7);
        i = ni;
        const arx = nums[0]!;
        const ary = nums[1]!;
        const rotation = nums[2]!;
        const largeArc = nums[3]!;
        const sweep = nums[4]!;
        const x = isRelative ? cx + nums[5]! : nums[5]!;
        const y = isRelative ? cy + nums[6]! : nums[6]!;
        // Convert arc in SVG coords, then negate Y in result
        const pts = arcToPoints(cx, cy, arx, ary, rotation, largeArc, sweep, x, y);
        for (const [px, py] of pts) {
          current.push([px, -py]);
        }
        cx = x;
        cy = y;
        lastCx2 = lastCy2 = undefined;
      } else {
        // Unknown command, skip
        break;
      }
    }
  }

  if (current.length > 0) {
    contours.push({ points: current });
  }

  return contours;
}

// ── Contour → Drawing (shared logic with font.ts) ─────────────

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

function contourToDrawing(points: [number, number][]): Drawing {
  const EPS = 1e-6;
  const filtered: [number, number][] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const [px, py] = filtered[filtered.length - 1]!;
    const [cx, cy] = points[i]!;
    if (Math.abs(cx - px) > EPS || Math.abs(cy - py) > EPS) {
      filtered.push([cx, cy]);
    }
  }
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
  let pen = draw(filtered[0]!);
  for (let i = 1; i < filtered.length; i++) {
    pen = pen.lineTo(filtered[i]!);
  }
  return pen.close();
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Convert contours from a single SVG path `d` attribute into a Drawing.
 *
 * The largest contour (by absolute area) establishes the "outer" winding
 * direction. Contours with that same winding sign are outers (fused);
 * contours with the opposite sign are holes (cut from their containing
 * outer, matched by bounding-box containment).
 */
export function contoursToDrawing(contours: Contour[]): Drawing {
  if (contours.length === 0) return drawRectangle(0.001, 0.001);
  if (contours.length === 1) return contourToDrawing(contours[0]!.points);

  // Classify contours into outers vs holes by winding direction.
  // The largest contour (by absolute area) defines the outer winding.
  const areas = contours.map((c) => signedArea(c.points));
  let largestIdx = 0;
  for (let i = 1; i < areas.length; i++) {
    if (Math.abs(areas[i]!) > Math.abs(areas[largestIdx]!)) {
      largestIdx = i;
    }
  }
  const outerSign = Math.sign(areas[largestIdx]!);

  type Ring = [number, number][];
  const outerRings: Ring[] = [];
  const holeRings: Ring[] = [];

  for (let i = 0; i < contours.length; i++) {
    if (outerSign !== 0 && Math.sign(areas[i]!) !== outerSign) {
      holeRings.push(contours[i]!.points);
    } else {
      outerRings.push(contours[i]!.points);
    }
  }

  // Use polygon-clipping to compute the union of all outers, then
  // subtract holes.  This bypasses OpenCascade 2D booleans entirely,
  // avoiding crashes on near-tangent intersections.
  type PC = [number, number][][];
  let multiPoly: PC[] = outerRings.map((r) => [closeRing(r)]);
  if (multiPoly.length > 1) {
    multiPoly = polygonClipping.union(multiPoly[0]!, ...multiPoly.slice(1));
  }

  if (holeRings.length > 0) {
    // Pair each hole with its containing polygon via bounding box,
    // then subtract.
    const holePoly: PC[] = holeRings.map((r) => [closeRing(r)]);
    multiPoly = polygonClipping.difference(
      // Flatten into a single multipolygon for the subject
      multiPoly as Parameters<typeof polygonClipping.difference>[0],
      ...holePoly,
    );
  }

  // Convert the resulting multipolygon back to Drawings.
  // Each polygon in the result is an outer ring + optional hole rings.
  let result: Drawing | null = null;
  for (const polygon of multiPoly) {
    const outerPts = openRing(polygon[0]!);
    let drawing = contourToDrawing(outerPts);
    // Cut hole rings
    for (let h = 1; h < polygon.length; h++) {
      const holePts = openRing(polygon[h]!);
      drawing = drawing.cut(contourToDrawing(holePts));
    }
    result = result ? result.fuse(drawing) : drawing;
  }
  return result ?? drawRectangle(0.001, 0.001);
}

/** Ensure a ring is closed (first point == last point) for polygon-clipping. */
function closeRing(pts: [number, number][]): [number, number][] {
  if (pts.length === 0) return pts;
  const [fx, fy] = pts[0]!;
  const [lx, ly] = pts[pts.length - 1]!;
  if (Math.abs(fx - lx) > 1e-9 || Math.abs(fy - ly) > 1e-9) {
    return [...pts, [fx, fy]];
  }
  return pts;
}

/** Remove closing duplicate point for contourToDrawing. */
function openRing(pts: [number, number][]): [number, number][] {
  if (pts.length < 2) return pts;
  const [fx, fy] = pts[0]!;
  const [lx, ly] = pts[pts.length - 1]!;
  if (Math.abs(fx - lx) < 1e-9 && Math.abs(fy - ly) < 1e-9) {
    return pts.slice(0, -1);
  }
  return pts;
}

/**
 * Parse an SVG string and convert all <path> elements to a single Drawing.
 *
 * Each <path> element is processed independently through contoursToDrawing
 * (respecting per-path SVG fill semantics), then all per-path Drawings are
 * fused together. This prevents holes in one path from subtracting geometry
 * that belongs to a separate path (e.g. transistor body inside a circle ring).
 */
export function svgToDrawing(svgString: string): Drawing {
  const pathRe = /<path[^>]*\bd="([^"]+)"/g;
  let m: RegExpExecArray | null;

  let result: Drawing | null = null;
  while ((m = pathRe.exec(svgString)) !== null) {
    const contours = parseSvgPathD(m[1]!);
    if (contours.length === 0) continue;
    const drawing = contoursToDrawing(contours);
    result = result ? result.fuse(drawing) : drawing;
  }

  if (!result) return drawRectangle(0.001, 0.001);
  return result;
}
