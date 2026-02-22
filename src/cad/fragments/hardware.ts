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
  drawRoundedRectangle,
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
    // Equilateral triangle approximation
    const s = 0.95;
    const h = (s * Math.sqrt(3)) / 2;
    drawing = draw([0, (2 / 3) * h])
      .lineTo([-s / 2, -(1 / 3) * h])
      .lineTo([s / 2, -(1 / 3) * h])
      .close();
  } else if (lower === "torx") {
    // Simplified torx: circle with 6 lobes cut
    drawing = drawCircle(0.74 / 2);
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

  // Scale to 2 * radius
  drawing = drawing.scale(2 * radius);

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

// ── Hexnut Fragment ──────────────────────────────────────────

registerFragment(["hexnut", "nut"], () => {
  return new (class extends Fragment {
    render(
      height: number,
      _maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      const outer = drawPolysides(height / 2, 6);
      const inner = drawCircle(height / 2 * 0.4);
      const drawing = outer.cut(inner);
      return {
        drawing,
        width: drawingWidth(drawing),
      };
    }
  })();
});

// ── Hexhead Fragment ──────────────────────────────────────────

registerFragment(["hexhead"], (...drives: string[]) => {
  return new (class extends Fragment {
    render(
      height: number,
      _maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      let drawing: Drawing = drawPolysides(height / 2, 6);
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

// ── Washer Fragment ──────────────────────────────────────────

registerFragment(["washer"], () => {
  return new (class extends Fragment {
    render(
      height: number,
      _maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      const innerRadius = 0.55;
      const drawing = drawCircle(height / 2).cut(
        drawCircle((height / 2) * innerRadius),
      );
      return {
        drawing,
        width: drawingWidth(drawing),
      };
    }
  })();
});

// ── Lockwasher Fragment ──────────────────────────────────────

registerFragment(["lockwasher"], () => {
  return new (class extends Fragment {
    render(
      height: number,
      _maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      const innerRadius = 0.55;
      let drawing = drawCircle(height / 2).cut(
        drawCircle((height / 2) * innerRadius),
      );
      // Simplified lockwasher cutout — a rotated rectangle
      const yCutout = ((height / 2) * (innerRadius + 1)) / 2;
      const cutRect = drawRectangle(
        (height / 2) * innerRadius * 0.5,
        yCutout * 2,
      )
        .translate([height * 0.1, yCutout])
        .rotate(45);
      drawing = drawing.cut(cutRect);
      return {
        drawing,
        width: drawingWidth(drawing),
      };
    }
  })();
});

// ── Circle Fragment ──────────────────────────────────────────

registerFragment(["circle"], () => {
  return new (class extends Fragment {
    render(
      height: number,
      _maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      const drawing = drawCircle(height / 2);
      return {
        drawing,
        width: drawingWidth(drawing),
      };
    }
  })();
});

// ── T-Nut Fragment ──────────────────────────────────────────

registerFragment(["tnut"], () => {
  return new (class extends Fragment {
    render(
      height: number,
      _maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      const drawing = drawRoundedRectangle(height * 0.6, height, height / 7).cut(
        drawCircle((height * 0.4) / 2),
      );
      return {
        drawing,
        width: drawingWidth(drawing),
      };
    }
  })();
});

// ── Nut Profile Fragment ──────────────────────────────────────

registerFragment(["nut_profile"], () => {
  return new (class extends Fragment {
    render(
      height: number,
      _maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      const width = height / 2.25;
      const cutoutHeight = (1 / 10) * height;
      const cutoutY = (1 / 4) * height;

      let drawing = drawRectangle(width, height);
      const cutout = drawRectangle(width, cutoutHeight);
      drawing = drawing
        .cut(cutout.translate([0, cutoutY]))
        .cut(cutout.translate([0, -cutoutY]));

      return {
        drawing,
        width: drawingWidth(drawing),
      };
    }
  })();
});

// ── Lock Nut Profile Fragment ──────────────────────────────────

registerFragment(["locknut_profile"], () => {
  return new (class extends Fragment {
    render(
      height: number,
      _maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      const width = (height / 2.25) * (3 / 2);
      const cutoutHeight = (1 / 10) * height;
      const cutoutY = (1 / 4) * height;
      const circleY = height * 0.2;

      let drawing = drawRectangle((width * 2) / 3, height);
      const c2 = drawCircle((width * 1) / 3);
      drawing = drawing
        .fuse(c2.translate([(-1 * width) / 3, circleY]))
        .fuse(c2.translate([(-1 * width) / 3, -circleY]));

      const r3 = drawRectangle((width * 1) / 3, 2 * circleY);
      drawing = drawing.fuse(r3.translate([(-1 * width) / 2, 0]));

      const cutout = drawRectangle((width * 2) / 3, cutoutHeight);
      drawing = drawing
        .cut(cutout.translate([0, cutoutY]))
        .cut(cutout.translate([0, -cutoutY]));

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

      // Build the head profile points
      const headTopX = -hw + lw;
      const headBottomX = -hw + lw;

      // Build the main body polygon
      let bodyPoints: [number, number][];

      if (!splitBolt) {
        bodyPoints = [
          [-hw, headH],
          [-hw, -headH],
          [headBottomX, -headH],
          [headBottomX, -lw / 2],
          ...boltBottomPts.slice().reverse(),
          [headTopX, lw / 2],
          [headTopX, headH],
        ];
      } else {
        const xMid = lw + (maxSize - lw) / 2 - hw;
        bodyPoints = [
          [-hw, headH],
          [-hw, -headH],
          [headBottomX, -headH],
          [headBottomX, -lw / 2],
          [xMid - lw / 2 - halfSplit, -lw / 2],
          [xMid + lw / 2 - halfSplit, lw / 2],
          [headTopX, lw / 2],
          [headTopX, headH],
        ];
      }

      // Draw the body
      let pen = draw(bodyPoints[0]!);
      for (let i = 1; i < bodyPoints.length; i++) {
        pen = pen.lineTo(bodyPoints[i]!);
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

        // Build the head connection point
        let headConnectorY: number;
        if (headshape === "pan") {
          headConnectorY = h / 2;
        } else if (headshape === "countersunk") {
          headConnectorY = h / 2;
        } else if (headshape === "socket") {
          headConnectorY = h / 2;
        } else {
          headConnectorY = h / 2;
        }

        // Build the top profile: threads → head connection → head top → head front → center line
        const topProfile: [number, number][] = [
          ...threadLines,
          [xHead, threadTipHeight - threadDepth],
          [xHead, headConnectorY],
        ];

        // Add head shape
        if (headshape === "pan") {
          const headRadius = 2;
          topProfile.push(
            [width / 2 - headRadius, h / 2],
            [width / 2, h / 2 - headRadius],
          );
          topProfile.push([width / 2, 0]);
        } else if (headshape === "countersunk") {
          topProfile.push([width / 2, h / 2], [width / 2, 0]);
        } else if (headshape === "socket") {
          topProfile.push(
            [width / 2, h / 2],
            [width / 2, 0],
          );
        } else {
          topProfile.push([width / 2, h / 2], [width / 2, 0]);
        }

        // Mirror for bottom half
        const bottomProfile = topProfile
          .slice()
          .reverse()
          .map(([x, y]): [number, number] => [x, -y]);

        const allPoints = [...topProfile, ...bottomProfile.slice(1)];

        let pen2 = draw(allPoints[0]!);
        for (let i = 1; i < allPoints.length; i++) {
          pen2 = pen2.lineTo(allPoints[i]!);
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

// ── Magnet Fragment ──────────────────────────────────────────

registerFragment(["magnet"], () => {
  return new (class extends Fragment {
    render(
      height: number,
      _maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      const scale = (height * 2) / 3;
      const thickness = 0.2;
      const armLen = 1.8;

      // Horseshoe magnet: outer circle - inner circle - right side cutout + arms
      let drawing = drawCircle(scale / 2).cut(
        drawCircle((scale / 2) * (1 - thickness * 2)),
      );

      // Cut the right side
      const cutout = drawRectangle(scale * armLen, scale).translate([
        (scale * armLen) / 2,
        0,
      ]);
      drawing = drawing.cut(cutout);

      // Add arms
      const armW = scale / 2;
      const armH = scale * thickness;
      const topArm = drawRectangle(armW, armH).translate([
        armW / 2,
        scale / 2 - armH / 2,
      ]);
      const bottomArm = drawRectangle(armW, armH).translate([
        armW / 2,
        -(scale / 2 - armH / 2),
      ]);
      drawing = drawing.fuse(topArm).fuse(bottomArm);

      // Rotate 45 degrees
      drawing = drawing.rotate(45);

      const bb = drawing.boundingBox;
      return { drawing, width: bb.width };
    }
  })();
});

// ── Threaded Insert Fragment ──────────────────────────────────

registerFragment(["threaded_insert"], () => {
  return new (class extends Fragment {
    render(
      height: number,
      _maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      // Simplified version of the insert shape
      const s = height / 10;

      // Main body: T-shaped profile
      const topRect = drawRectangle(8 * s, 2.5 * s);
      const bottomRect = drawRectangle(6 * s, 5 * s).translate([0, 1.26 * s]);
      let drawing = topRect
        .fuse(bottomRect)
        .translate([0, -1.25 * s]);

      // Bottom protrusion
      const base = drawRectangle(6 * s, 2.5 * s).translate([0, -3.76 * s - 1.25 * s]);
      drawing = drawing.fuse(base);

      // Trapezoid cutouts (simplified as rectangles)
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) {
          const cx = (col - 1.5) * 1.625 * s;
          const cy = (row === 0 ? 1 : -1) * 2.5 * s + (-1.25 * s);
          const trap = drawRectangle(1.0 * s, 1.0 * s).translate([cx, cy]);
          drawing = drawing.cut(trap);
        }
      }

      // Offset to center
      drawing = drawing.translate([0, 2.5 * s / 2]);

      const bb = drawing.boundingBox;
      return { drawing, width: bb.width };
    }
  })();
});

// Export drive helpers for use elsewhere
export { compoundDriveShape, driveShape, parseBoltFeatures };
