/**
 * Web Worker for CAD operations.
 *
 * Initializes OpenCascade WASM, then handles RENDER and EXPORT messages.
 */

import { setOC } from "replicad";
import type { Solid } from "replicad";
import opencascade from "replicad-opencascadejs/src/replicad_single.js";
import wasmUrl from "replicad-opencascadejs/src/replicad_single.wasm?url";

import fontUrl from "../assets/OpenSans-Regular.ttf?url";
import { loadFont } from "./font.js";
import { LabelRenderer, renderDividedLabel } from "./label.js";
import { buildBase, extrudeLabel } from "./bases/index.js";
import type { BaseConfig } from "./bases/index.js";
import type { LabelStyle, RenderOptions } from "./options.js";
import { DEFAULT_RENDER_OPTIONS } from "./options.js";

// Import fragment index to trigger registrations
import "./fragments/index.js";

// ── Types ──────────────────────────────────────────────────────

interface RenderRequest {
  id: string;
  type: "RENDER";
  spec: string;
  base: BaseConfig;
  style: LabelStyle;
  options?: Partial<RenderOptions>;
  divisions?: number;
}

interface ExportRequest {
  id: string;
  type: "EXPORT";
  format: "stl" | "step" | "svg";
}

type WorkerRequest = RenderRequest | ExportRequest;

interface ReadyResponse {
  type: "READY";
}

interface MeshResponse {
  id: string;
  type: "MESH";
  faces: Float32Array;
  normals: Float32Array;
}

interface FileResponse {
  id: string;
  type: "FILE";
  buffer: ArrayBuffer;
  mimeType: string;
  filename: string;
}

interface ErrorResponse {
  id: string;
  type: "ERROR";
  message: string;
}

// Union of all worker responses (for documentation)
// type WorkerResponse = ReadyResponse | MeshResponse | FileResponse | ErrorResponse;

// ── State ──────────────────────────────────────────────────────

let lastSolid: Solid | null = null;
let lastDrawing: import("replicad").Drawing | null = null;

// ── Init ──────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Load OpenCascade
  const OC = await opencascade({
    locateFile: () => wasmUrl,
  });
  setOC(OC);

  // Load font
  const fontResponse = await fetch(fontUrl);
  const fontData = await fontResponse.arrayBuffer();
  await loadFont(fontData);

  const msg: ReadyResponse = { type: "READY" };
  self.postMessage(msg);
}

// ── Message Handler ──────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  try {
    if (req.type === "RENDER") {
      const options: RenderOptions = {
        ...DEFAULT_RENDER_OPTIONS,
        ...req.options,
      };

      // Build the base (pass style so pred base can create recess for embossed)
      const baseResult = buildBase({ ...req.base, style: req.style });

      // Render the label
      const renderer = new LabelRenderer(options);
      const specs = req.spec.split("\0"); // Allow multiple labels separated by NUL
      let labelDrawing;

      if (specs.length > 1 || (req.divisions && req.divisions > 1)) {
        labelDrawing = renderDividedLabel(
          specs,
          baseResult.area,
          req.divisions ?? specs.length,
          options,
        );
      } else {
        const adjustedArea = {
          x: baseResult.area.x - options.marginMm * 2,
          y: baseResult.area.y - options.marginMm * 2,
        };
        labelDrawing = renderer.render(specs[0]!, adjustedArea);
      }

      lastDrawing = labelDrawing;

      // Extrude label onto base
      const solid = extrudeLabel(
        baseResult,
        labelDrawing,
        req.style,
        req.base.depth ?? 0.4,
      );
      lastSolid = solid;

      // Generate mesh for preview
      const mesh = solid.mesh({ tolerance: 0.1, angularTolerance: 15 });
      const faces = new Float32Array(mesh.vertices);
      const normals = new Float32Array(mesh.normals);

      const msg: MeshResponse = {
        id: req.id,
        type: "MESH",
        faces,
        normals,
      };
      self.postMessage(msg, { transfer: [faces.buffer, normals.buffer] });
    } else if (req.type === "EXPORT") {
      if (!lastSolid) {
        throw new Error("No solid to export — render first");
      }

      let buffer: ArrayBuffer;
      let mimeType: string;
      let filename: string;

      if (req.format === "stl") {
        const blob = lastSolid.blobSTL();
        buffer = await blob.arrayBuffer();
        mimeType = "model/stl";
        filename = "label.stl";
      } else if (req.format === "step") {
        const blob = lastSolid.blobSTEP();
        buffer = await blob.arrayBuffer();
        mimeType = "model/step";
        filename = "label.step";
      } else if (req.format === "svg") {
        if (!lastDrawing) {
          throw new Error("No drawing to export — render first");
        }
        const { drawingToFilledSVG } = await import("./font.js");
        const svgString = drawingToFilledSVG(lastDrawing);
        buffer = new TextEncoder().encode(svgString).buffer;
        mimeType = "image/svg+xml";
        filename = "label.svg";
      } else {
        throw new Error(`Unknown export format: ${req.format}`);
      }

      const msg: FileResponse = {
        id: req.id,
        type: "FILE",
        buffer,
        mimeType,
        filename,
      };
      self.postMessage(msg, { transfer: [buffer] });
    }
  } catch (err) {
    const msg: ErrorResponse = {
      id: req.id,
      type: "ERROR",
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(msg);
  }
};

// Start initialization
init().catch((err) => {
  console.error("Worker init failed:", err);
  self.postMessage({
    type: "ERROR",
    id: "__init__",
    message: `Init failed: ${err instanceof Error ? err.message : String(err)}`,
  });
});
