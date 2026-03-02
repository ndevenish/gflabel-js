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
type Ring = [number, number][];
type Polygon = Ring[]; // [outer, ...holes]
type MultiPolygon = Polygon[];

interface BB { minX: number; maxX: number; minY: number; maxY: number }

function bbox(pts: Ring): BB {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

function bbContains(outer: BB, inner: BB): boolean {
  return outer.minX <= inner.minX && outer.maxX >= inner.maxX &&
         outer.minY <= inner.minY && outer.maxY >= inner.maxY;
}

/** Ensure a ring is closed (first point == last point) for polygon-clipping. */
function closeRing(pts: Ring): Ring {
  if (pts.length === 0) return pts;
  const [fx, fy] = pts[0]!;
  const [lx, ly] = pts[pts.length - 1]!;
  if (Math.abs(fx - lx) > 1e-9 || Math.abs(fy - ly) > 1e-9) {
    return [...pts, [fx, fy]];
  }
  return pts;
}

/** Remove closing duplicate point for contourToDrawing. */
function openRing(pts: Ring): Ring {
  if (pts.length < 2) return pts;
  const [fx, fy] = pts[0]!;
  const [lx, ly] = pts[pts.length - 1]!;
  if (Math.abs(fx - lx) < 1e-9 && Math.abs(fy - ly) < 1e-9) {
    return pts.slice(0, -1);
  }
  return pts;
}

/**
 * Convert contours from a single SVG path into polygons (for polygon-clipping).
 *
 * Classifies contours as outers vs holes by winding direction, then pairs
 * each hole with its smallest containing outer via bounding-box containment.
 * Returns an array of polygons, each being [outerRing, ...holeRings].
 */
function contoursToPolygons(contours: Contour[], fillRule: "nonzero" | "evenodd" = "nonzero"): MultiPolygon {
  if (contours.length === 0) return [];

  // Single contour — just an outer
  if (contours.length === 1) {
    return [[closeRing(contours[0]!.points)]];
  }

  if (fillRule === "evenodd") {
    return contoursToPolygonsEvenOdd(contours);
  }

  const areas = contours.map((c) => signedArea(c.points));

  // Largest contour by absolute area defines the outer winding direction
  let largestIdx = 0;
  for (let i = 1; i < areas.length; i++) {
    if (Math.abs(areas[i]!) > Math.abs(areas[largestIdx]!)) {
      largestIdx = i;
    }
  }
  const outerSign = Math.sign(areas[largestIdx]!);

  interface RingInfo { ring: Ring; area: number; bb: BB; holes: Ring[] }

  const outers: RingInfo[] = [];
  const holes: { ring: Ring; area: number; bb: BB }[] = [];

  for (let i = 0; i < contours.length; i++) {
    const pts = contours[i]!.points;
    const info = { ring: closeRing(pts), area: areas[i]!, bb: bbox(pts) };
    if (outerSign !== 0 && Math.sign(areas[i]!) !== outerSign) {
      holes.push(info);
    } else {
      outers.push({ ...info, holes: [] });
    }
  }

  // Pair each hole with its smallest containing outer via bounding box
  for (const hole of holes) {
    let bestIdx = -1;
    let bestArea = Infinity;
    for (let i = 0; i < outers.length; i++) {
      if (bbContains(outers[i]!.bb, hole.bb)) {
        const absArea = Math.abs(outers[i]!.area);
        if (absArea < bestArea) {
          bestArea = absArea;
          bestIdx = i;
        }
      }
    }
    if (bestIdx >= 0) {
      outers[bestIdx]!.holes.push(hole.ring);
    }
  }

  return outers.map((o) => [o.ring, ...o.holes]);
}

/**
 * Evenodd classification: contours are outers or holes based on nesting depth.
 * Depth 0 = outer, depth 1 = hole, depth 2 = outer, etc.
 * Nesting is determined by bounding-box containment, sorted by area (largest first).
 */
function contoursToPolygonsEvenOdd(contours: Contour[]): MultiPolygon {
  const areas = contours.map((c) => Math.abs(signedArea(c.points)));
  const bbs = contours.map((c) => bbox(c.points));
  const rings = contours.map((c) => closeRing(c.points));

  // Sort by area descending (largest first) so parents come before children
  const indices = contours.map((_, i) => i);
  indices.sort((a, b) => areas[b]! - areas[a]!);

  // Compute nesting depth for each contour
  const depth = new Array<number>(contours.length).fill(0);
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k]!;
    let d = 0;
    // Count how many earlier (larger) contours contain this one
    for (let j = 0; j < k; j++) {
      const pi = indices[j]!;
      if (bbContains(bbs[pi]!, bbs[i]!)) {
        d++;
      }
    }
    depth[i] = d;
  }

  // Even depth = outer, odd depth = hole
  interface RingInfo { ring: Ring; area: number; bb: BB; holes: Ring[] }
  const outers: RingInfo[] = [];
  const holes: { ring: Ring; bb: BB }[] = [];

  for (let i = 0; i < contours.length; i++) {
    if (depth[i]! % 2 === 0) {
      outers.push({ ring: rings[i]!, area: areas[i]!, bb: bbs[i]!, holes: [] });
    } else {
      holes.push({ ring: rings[i]!, bb: bbs[i]! });
    }
  }

  // Pair each hole with its smallest containing outer
  for (const hole of holes) {
    let bestIdx = -1;
    let bestArea = Infinity;
    for (let i = 0; i < outers.length; i++) {
      if (bbContains(outers[i]!.bb, hole.bb)) {
        if (outers[i]!.area < bestArea) {
          bestArea = outers[i]!.area;
          bestIdx = i;
        }
      }
    }
    if (bestIdx >= 0) {
      outers[bestIdx]!.holes.push(hole.ring);
    }
  }

  return outers.map((o) => [o.ring, ...o.holes]);
}

/** Convert a polygon-clipping MultiPolygon result into a single Drawing. */
function multiPolygonToDrawing(mp: MultiPolygon): Drawing {
  let result: Drawing | null = null;
  for (const polygon of mp) {
    const outerPts = openRing(polygon[0]!);
    let drawing = contourToDrawing(outerPts);
    for (let h = 1; h < polygon.length; h++) {
      const holePts = openRing(polygon[h]!);
      drawing = drawing.cut(contourToDrawing(holePts));
    }
    result = result ? result.fuse(drawing) : drawing;
  }
  return result ?? drawRectangle(0.001, 0.001);
}

/**
 * Convert contours from a single SVG path `d` attribute into a Drawing.
 */
export function contoursToDrawing(contours: Contour[]): Drawing {
  const polygons = contoursToPolygons(contours);
  if (polygons.length === 0) return drawRectangle(0.001, 0.001);
  return multiPolygonToDrawing(polygons);
}


/**
 * Parse an SVG string and convert all <path> elements to a single Drawing.
 *
 * Each <path> element is independently classified into polygons (outers with
 * paired holes via bounding-box containment), then all polygons are unioned
 * via polygon-clipping. Only the final result is converted to a replicad
 * Drawing, avoiding OpenCascade 2D boolean fragility on thin/near-tangent
 * geometry.
 */
export function svgToDrawing(svgString: string): Drawing {
  const pathRe = /<path\b([^>]*)>/g;
  let m: RegExpExecArray | null;

  // Collect polygons from all <path> elements
  let accumulated: MultiPolygon = [];
  while ((m = pathRe.exec(svgString)) !== null) {
    const attrs = m[1]!;
    const dMatch = /\bd="([^"]+)"/.exec(attrs);
    if (!dMatch) continue;
    const fillRule = /fill-rule="evenodd"/.test(attrs) ? "evenodd" as const : "nonzero" as const;
    const contours = parseSvgPathD(dMatch[1]!);
    if (contours.length === 0) continue;
    const polygons = contoursToPolygons(contours, fillRule);
    accumulated.push(...polygons);
  }

  if (accumulated.length === 0) return drawRectangle(0.001, 0.001);

  // Union all polygons in polygon-clipping (robust 2D booleans).
  // Process pairwise rather than spreading all at once: spreading hundreds of
  // polygons as arguments causes a call stack overflow in polygon-clipping's
  // internal sweep for complex inputs (e.g. QR codes with many modules).
  if (accumulated.length > 1) {
    let result: MultiPolygon = [accumulated[0]!];
    for (let i = 1; i < accumulated.length; i++) {
      result = polygonClipping.union(
        result as Parameters<typeof polygonClipping.union>[0],
        accumulated[i]!,
      );
    }
    accumulated = result;
  }

  return multiPolygonToDrawing(accumulated);
}
