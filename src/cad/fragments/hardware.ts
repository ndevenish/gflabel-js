/**
 * Hardware fragments: nuts, washers, bolts, heads, etc.
 * Port of the hardware-related fragments from fragments.py.
 */

import {
  draw,
  drawCircle,
  drawRectangle,
  Drawing,
  drawPolysides,
} from "replicad";
import type { RenderOptions } from "../options.js";
import { Fragment, registerFragment } from "./base.js";
import type { FragmentRenderResult } from "./base.js";

// ── Drive System ──────────────────────────────────────────────

const DRIVE_ALIASES: Record<string, string> = {
  "+": "phillips",
  posidrive: "pozidrive",
  posi: "pozidrive",
  pozi: "pozidrive",
  "-": "slot",
  tri: "triangle",
  robertson: "square",
};

// Valid drive types (used for validation in parseBoltFeatures)
// "phillips", "pozidrive", "slot", "hex", "cross", "square",
// "triangle", "torx", "security", "phillipsslot"

function resolveDrive(name: string): string {
  const lower = name.toLowerCase();
  return DRIVE_ALIASES[lower] ?? lower;
}

interface DriveResult {
  drawing: Drawing;
  positive: boolean;
}

function driveShape(
  shape: string,
  radius: number = 1,
  outerRadius: number = 1,
): DriveResult {
  let positive = false;
  const lower = shape.toLowerCase();
  const cutRadius = Math.max(radius, outerRadius) / radius;

  let drawing: Drawing;

  if (lower === "phillips" || lower === "+") {
    drawing = drawRectangle(1, 0.2)
      .fuse(drawRectangle(0.2, 1))
      .fuse(drawRectangle(0.4, 0.4).rotate(45));
  } else if (
    lower === "pozidrive" ||
    lower === "posidrive" ||
    lower === "posi" ||
    lower === "pozi"
  ) {
    drawing = drawRectangle(1, 0.2)
      .fuse(drawRectangle(0.2, 1))
      .fuse(drawRectangle(0.4, 0.4).rotate(45))
      .fuse(drawRectangle(1, 0.1).rotate(45))
      .fuse(drawRectangle(1, 0.1).rotate(-45));
  } else if (lower === "slot" || lower === "-") {
    drawing = drawRectangle(cutRadius, 0.2);
  } else if (lower === "hex") {
    drawing = drawPolysides(0.5, 6);
  } else if (lower === "cross") {
    drawing = drawRectangle(1, 0.2).fuse(drawRectangle(0.2, 1));
  } else if (lower === "phillipsslot") {
    drawing = drawRectangle(1, 0.2)
      .fuse(drawRectangle(0.2, 1))
      .fuse(drawRectangle(0.4, 0.4).rotate(45))
      .fuse(drawRectangle(cutRadius, 0.2));
  } else if (lower === "square") {
    drawing = drawRectangle(0.6, 0.6).rotate(45);
  } else if (lower === "triangle") {
    // Equilateral triangle, centroid-centered at origin
    const s = 0.95;
    const h = (s * Math.sqrt(3)) / 2;
    drawing = draw([0, (2 * h) / 3])
      .lineTo([-s / 2, -h / 3])
      .lineTo([s / 2, -h / 3])
      .close();
  } else if (lower === "torx") {
    // Torx: central circle + 3 stadium-shaped lobes, minus 6 circular cuts
    drawing = drawCircle(0.74 / 2);
    // Add 3 radial slots (stadium shapes) at 120° intervals
    // SlotCenterToCenter(0.82, 0.19) = 0.82 center-to-center, 0.19 diameter ends
    const slotLen = 0.82;
    const slotR = 0.19 / 2;
    for (let i = 0; i < 3; i++) {
      const angle = (i * 120) * (Math.PI / 180);
      // Build a stadium (rectangle + two semicircle end caps)
      const halfLen = slotLen / 2;
      let slot: Drawing = drawRectangle(slotLen, slotR * 2);
      slot = slot
        .fuse(drawCircle(slotR).translate([halfLen, 0]))
        .fuse(drawCircle(slotR).translate([-halfLen, 0]));
      // Rotate to the correct angle
      if (angle !== 0) slot = slot.rotate(i * 120);
      drawing = drawing.fuse(slot);
    }
    // Cut 6 circular lobes at 30° offset
    for (let i = 0; i < 6; i++) {
      const angle = (i * 60 + 30) * (Math.PI / 180);
      const cx = 0.41 * Math.cos(angle);
      const cy = 0.41 * Math.sin(angle);
      drawing = drawing.cut(drawCircle(0.11).translate([cx, cy]));
    }
  } else if (lower === "security") {
    drawing = drawCircle(0.1);
    positive = true;
  } else {
    throw new Error(`Unknown head type: ${shape}`);
  }

  // Scale to 2 * radius (explicitly scale around origin to preserve centering)
  drawing = drawing.scale(2 * radius, [0, 0]);

  return { drawing, positive };
}

function compoundDriveShape(
  shapes: string[],
  radius: number = 1,
  outerRadius: number = 1,
): Drawing {
  if (shapes.length === 0) throw new Error("No drive shapes requested");

  const plus: Drawing[] = [];
  const minus: Drawing[] = [];

  for (const shape of shapes) {
    const { drawing, positive } = driveShape(shape, radius, outerRadius);
    if (positive) {
      minus.push(drawing);
    } else {
      plus.push(drawing);
    }
  }

  let result: Drawing | null = null;
  for (const d of plus) {
    result = result ? result.fuse(d) : d;
  }
  if (!result) {
    result = plus[0] ?? drawCircle(0.001);
  }
  for (const d of minus) {
    result = result.cut(d);
  }
  return result;
}

// ── Helper to get bounding box dimensions from a Drawing ──────

function drawingWidth(d: Drawing): number {
  return d.boundingBox.width;
}

// ── Hexhead Fragment ──────────────────────────────────────────

registerFragment(["hexhead"], (...drives: string[]) => {
  return new (class extends Fragment {
    render(
      height: number,
      _maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      let drawing: Drawing = drawPolysides(height / 2, 6).rotate(30);
      if (drives.length > 0) {
        const driveDrawing = compoundDriveShape(
          drives,
          0.6 * (height / 2),
          height / 2,
        );
        drawing = drawing.cut(driveDrawing);
      }
      return {
        drawing,
        width: drawingWidth(drawing),
      };
    }
  })();
});

// ── Head Fragment ──────────────────────────────────────────────

registerFragment(["head"], (...headshapes: string[]) => {
  return new (class extends Fragment {
    render(
      height: number,
      _maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      let drawing: Drawing = drawCircle(height / 2);
      if (headshapes.length > 0) {
        const driveDrawing = compoundDriveShape(
          headshapes,
          (height / 2) * 0.7,
          height / 2,
        );
        drawing = drawing.cut(driveDrawing);
      }
      return {
        drawing,
        width: drawingWidth(drawing),
      };
    }
  })();
});

// ── Box Fragment ──────────────────────────────────────────────

registerFragment(["box"], (inWidth: string, inHeight?: string) => {
  return new (class extends Fragment {
    render(
      height: number,
      _maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      const w = parseFloat(inWidth);
      const h = inHeight ? parseFloat(inHeight) : height;
      const drawing = drawRectangle(w, h);
      return { drawing, width: w };
    }
  })();
});

// ── Bolt Fragment ──────────────────────────────────────────────

const HEAD_SHAPES = new Set(["countersunk", "pan", "round", "socket"]);
const MODIFIERS = new Set(["tapping", "flip", "partial"]);
const FEATURE_ALIAS: Record<string, string> = {
  countersink: "countersunk",
  tap: "tapping",
  tapped: "tapping",
  flipped: "flip",
  square: "socket",
};

function parseBoltFeatures(reqFeatures: string[]): {
  headshape: string;
  modifiers: Set<string>;
  drives: string[];
  slotted: boolean;
  flanged: boolean;
} {
  const rawFeatures = new Set(
    reqFeatures.map((x) => {
      const lower = x.toLowerCase();
      return FEATURE_ALIAS[lower] ?? lower;
    }),
  );

  const slotted = rawFeatures.has("slotted") || rawFeatures.has("slot");
  const flanged = rawFeatures.has("flanged") || rawFeatures.has("flange");
  rawFeatures.delete("slotted");
  rawFeatures.delete("slot");
  rawFeatures.delete("flanged");
  rawFeatures.delete("flange");

  const requestedHeadShapes = [...rawFeatures].filter((x) =>
    HEAD_SHAPES.has(x),
  );
  if (requestedHeadShapes.length > 1)
    throw new Error("More than one head shape specified");
  const headshape = requestedHeadShapes[0] ?? "pan";
  rawFeatures.delete(headshape);

  const modifiers = new Set([...rawFeatures].filter((x) => MODIFIERS.has(x)));
  for (const m of modifiers) rawFeatures.delete(m);

  const drives = [...rawFeatures].map((x) => resolveDrive(x));

  return { headshape, modifiers, drives, slotted, flanged };
}

registerFragment(["bolt"], (lengthStr: string, ...features: string[]) => {
  const boltLength = parseFloat(lengthStr);
  const { headshape, modifiers, slotted, flanged } =
    parseBoltFeatures(features);

  return new (class extends Fragment {
    variableWidth = true;

    minWidth(height: number): number {
      return height;
    }

    render(
      height: number,
      maxSize: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      let length = boltLength;
      const lw = height / 2.25;
      const halfSplit = 0.75;

      if (headshape === "countersunk") length -= lw;

      maxSize = Math.max(maxSize, lw * 2 + halfSplit * 2 + 0.1);
      const splitBolt = length + lw > maxSize;
      const hw = splitBolt ? maxSize / 2 : (length + lw) / 2;

      let headH = height / 2;
      if (flanged) headH -= lw / 3;

      // Build bolt outline as a polygon
      const boltBottomPts: [number, number][] = modifiers.has("tapping")
        ? [
            [hw - lw / 2, lw / 2],
            [hw, 0],
            [hw - lw / 2, -lw / 2],
          ]
        : [
            [hw, lw / 2],
            [hw, -lw / 2],
          ];

      // Build the main body outline with head-shape-specific profile
      const headX = -hw + lw; // x where head meets body

      // Body/thread points (right side of bolt)
      let bodyRightPts: [number, number][];
      if (!splitBolt) {
        bodyRightPts = [...boltBottomPts.slice().reverse()];
      } else {
        const xMid = lw + (maxSize - lw) / 2 - hw;
        bodyRightPts = [
          [xMid - lw / 2 - halfSplit, -lw / 2],
          [xMid + lw / 2 - halfSplit, lw / 2],
        ];
      }

      // Draw using pen: start at head top-left, go CCW
      let pen: ReturnType<typeof draw>;

      if (headshape === "pan") {
        // Rounded corners at head top-left and bottom-left
        // Winding: CW — start top of head, go down left side
        const r = Math.min(2, lw / 2);
        pen = draw([-hw + r, headH]);
        // Top-left arc: from (-hw+r, headH) curving to (-hw, headH-r)
        pen = pen.threePointsArcTo(
          [-hw, headH - r],
          [-hw + r * (1 - Math.SQRT1_2), headH - r * (1 - Math.SQRT1_2)],
        );
        // Down the left side
        pen = pen.lineTo([-hw, -headH + r]);
        // Bottom-left arc: from (-hw, -headH+r) curving to (-hw+r, -headH)
        pen = pen.threePointsArcTo(
          [-hw + r, -headH],
          [-hw + r * (1 - Math.SQRT1_2), -headH + r * (1 - Math.SQRT1_2)],
        );
        pen = pen.lineTo([headX, -headH]);
        pen = pen.lineTo([headX, -lw / 2]);
        for (const pt of bodyRightPts) pen = pen.lineTo(pt);
        pen = pen.lineTo([headX, lw / 2]);
        pen = pen.lineTo([headX, headH]);
      } else if (headshape === "round") {
        // Dome: arc from (headX, headH) to (headX, -headH) bulging left through (-hw, 0)
        pen = draw([headX, headH]);
        pen = pen.threePointsArcTo([headX, -headH], [headX - lw, 0]);
        pen = pen.lineTo([headX, -lw / 2]);
        for (const pt of bodyRightPts) pen = pen.lineTo(pt);
        pen = pen.lineTo([headX, lw / 2]);
      } else if (headshape === "countersunk") {
        // Tapered: wide at head (left), narrows to shaft width at body
        pen = draw([-hw, headH]);
        pen = pen.lineTo([-hw, -headH]);
        pen = pen.lineTo([headX, -lw / 2]);
        for (const pt of bodyRightPts) pen = pen.lineTo(pt);
        pen = pen.lineTo([headX, lw / 2]);
      } else {
        // socket (default): straight rectangular head
        pen = draw([-hw, headH]);
        pen = pen.lineTo([-hw, -headH]);
        pen = pen.lineTo([headX, -headH]);
        pen = pen.lineTo([headX, -lw / 2]);
        for (const pt of bodyRightPts) pen = pen.lineTo(pt);
        pen = pen.lineTo([headX, lw / 2]);
        pen = pen.lineTo([headX, headH]);
      }

      let drawing: Drawing = pen.close();

      // If split, draw the second half
      if (splitBolt) {
        const xMid = lw + (maxSize - lw) / 2 - hw;
        const secondPts: [number, number][] = [
          [xMid + lw / 2 + halfSplit, lw / 2],
          ...boltBottomPts,
          [xMid - lw / 2 + halfSplit, -lw / 2],
        ];
        let pen2 = draw(secondPts[0]!);
        for (let i = 1; i < secondPts.length; i++) {
          pen2 = pen2.lineTo(secondPts[i]!);
        }
        drawing = drawing.fuse(pen2.close());
      }

      // Slotted cutout
      if (slotted) {
        const slotRect = drawRectangle(lw / 2, lw / 2).translate([
          -hw + lw / 4,
          0,
        ]);
        drawing = drawing.cut(slotRect);
      }

      // Flanged extension
      if (flanged) {
        const flangeRect = drawRectangle(lw / 4, height).translate([
          -hw + lw - lw / 8,
          0,
        ]);
        drawing = drawing.fuse(flangeRect);
      }

      // Flip if requested
      if (modifiers.has("flip")) {
        drawing = drawing.scale(-1);
      }

      const bb = drawing.boundingBox;
      return { drawing, width: bb.width };
    }
  })();
});

// ── CullenectBolt Fragment ──────────────────────────────────

registerFragment(
  ["webbolt", "cullbolt", "cullenectbolt"],
  (...reqFeatures: string[]) => {
    const { headshape, modifiers, drives } = parseBoltFeatures(reqFeatures);
    const partial = modifiers.has("partial");

    return new (class extends Fragment {
      overheight = 1.6;

      render(
        height: number,
        _maxWidth: number,
        _opts: RenderOptions,
      ): FragmentRenderResult {
        const h = height * 1.6;
        const width = 1.456 * h;
        const bodyW = 0.856 * h;
        let nThreads = 6;
        const threadDepth = 0.0707 * h;

        const headW = width - bodyW;
        const xHead = bodyW - width / 2;
        let x0 = -width / 2;

        const threadPitch = bodyW / 6; // always based on 6
        const threadTipHeight = h / 4 + threadDepth;
        const threadLines: [number, number][] = [[x0, 0]];

        if (modifiers.has("tapping")) {
          threadLines.push([
            x0 + threadPitch * 2 - 0.2,
            threadTipHeight - threadDepth,
          ]);
          nThreads -= 2;
          x0 += threadPitch * 2;
        }

        if (partial) nThreads = 3;

        for (let i = 0; i < nThreads; i++) {
          threadLines.push(
            [x0 + i * threadPitch, threadTipHeight - threadDepth],
            [x0 + (i + 0.5) * threadPitch, threadTipHeight],
          );
        }

        if (partial) {
          threadLines.push([
            x0 + nThreads * threadPitch,
            threadTipHeight - threadDepth,
          ]);
        }

        // Build the full outline with pen-based drawing for arc support.
        // Bottom half threads (Y negated)
        const bottomThreadLines: [number, number][] = threadLines
          .slice()
          .reverse()
          .map(([x, y]) => [x, -y]);

        // Start at first thread point (top), draw top threads → head → bottom threads
        let pen2 = draw(threadLines[0]!);
        for (let i = 1; i < threadLines.length; i++) {
          pen2 = pen2.lineTo(threadLines[i]!);
        }
        // Connect to head
        pen2 = pen2.lineTo([xHead, threadTipHeight - threadDepth]);
        pen2 = pen2.lineTo([xHead, h / 2]);

        // Head shape (top-right to center-right to bottom-right)
        if (headshape === "pan") {
          const r = 2;
          pen2 = pen2.lineTo([width / 2 - r, h / 2]);
          pen2 = pen2.threePointsArcTo(
            [width / 2, h / 2 - r],
            [
              width / 2 - r * (1 - Math.SQRT1_2),
              h / 2 - r * (1 - Math.SQRT1_2),
            ],
          );
          pen2 = pen2.lineTo([width / 2, -(h / 2 - r)]);
          pen2 = pen2.threePointsArcTo(
            [width / 2 - r, -h / 2],
            [
              width / 2 - r * (1 - Math.SQRT1_2),
              -(h / 2 - r * (1 - Math.SQRT1_2)),
            ],
          );
        } else if (headshape === "round") {
          const xRoundHead = width / 2 - h / 2;
          pen2 = pen2.lineTo([xRoundHead, h / 2]);
          pen2 = pen2.threePointsArcTo(
            [xRoundHead, -h / 2],
            [xRoundHead + h / 2, 0],
          );
        } else if (headshape === "countersunk") {
          pen2 = pen2.lineTo([width / 2, h / 2]);
          pen2 = pen2.lineTo([width / 2, -h / 2]);
        } else {
          // socket
          pen2 = pen2.lineTo([width / 2, h / 2]);
          pen2 = pen2.lineTo([width / 2, -h / 2]);
        }

        // Connect back to bottom threads
        pen2 = pen2.lineTo([xHead, -h / 2]);
        pen2 = pen2.lineTo([xHead, -(threadTipHeight - threadDepth)]);

        // Bottom half threads (reversed, Y negated)
        // bottomThreadLines[0] equals (xHead, -(thd-td)) for non-partial (skip it,
        // we're already there) but is the partial endpoint for partial (must include).
        const btStart = partial ? 0 : 1;
        for (let i = btStart; i < bottomThreadLines.length; i++) {
          pen2 = pen2.lineTo(bottomThreadLines[i]!);
        }

        let drawing: Drawing = pen2.close();

        // Add drive cutout
        if (drives.length > 0) {
          const fudge = threadDepth / 2;
          const driveDrawing = compoundDriveShape(
            drives,
            (headW * 0.9) / 2,
            headW / 2,
          ).translate([width / 2 - headW / 2 - fudge, 0]);
          drawing = drawing.cut(driveDrawing);
        }

        if (modifiers.has("flip")) {
          drawing = drawing.scale(-1);
        }

        const bb = drawing.boundingBox;
        return { drawing, width: bb.width };
      }
    })();
  },
);

// Export drive helpers for use elsewhere
export { compoundDriveShape, driveShape, parseBoltFeatures };
