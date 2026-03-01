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
import jostFontUrl from "../assets/Jost-500-Medium.ttf?url";
import jostSemiBoldUrl from "../assets/Jost-600-Semi.ttf?url";
import { loadFont, loadFontNamed, setActiveFont } from "./font.js";
import { loadSymbols } from "./fragments/symbols.js";
import { loadSvgFragments } from "./fragments/svgFragments.js";
import symbolManifest from "../assets/fragments/symbols/manifest.json";

const symbolSvgs = import.meta.glob("../assets/fragments/symbols/*.svg", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const fragmentSvgs = import.meta.glob("../assets/fragments/*.svg", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;
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
  scale?: [number, number, number];
}

interface RenderSvgRequest {
  id: string;
  type: "RENDER_SVG";
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

type WorkerRequest = RenderRequest | RenderSvgRequest | ExportRequest;

interface ReadyResponse {
  type: "READY";
}

interface MeshResponse {
  id: string;
  type: "MESH";
  faces: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  baseTriangleCount?: number;
}

interface FileResponse {
  id: string;
  type: "FILE";
  buffer: ArrayBuffer;
  mimeType: string;
  filename: string;
}

interface SvgResponse {
  id: string;
  type: "SVG";
  svg: string;
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

  // Load fonts
  const [fontData, jostData, jostSemiData] = await Promise.all([
    fetch(fontUrl).then((r) => r.arrayBuffer()),
    fetch(jostFontUrl).then((r) => r.arrayBuffer()),
    fetch(jostSemiBoldUrl).then((r) => r.arrayBuffer()),
  ]);
  await loadFont(fontData);
  await loadFontNamed("jost", jostData);
  await loadFontNamed("jost-semibold", jostSemiData);

  // Load symbols
  loadSymbols(symbolManifest, (id) => {
    const key = `../assets/fragments/symbols/${id}.svg`;
    const svg = symbolSvgs[key];
    if (!svg) throw new Error(`Symbol SVG not found: ${key}`);
    return svg;
  });

  // Load SVG-based hardware fragments
  loadSvgFragments((name) => {
    const key = `../assets/fragments/${name}.svg`;
    const svg = fragmentSvgs[key];
    if (!svg) throw new Error(`Fragment SVG not found: ${key}`);
    return svg;
  });

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

      setActiveFont(options.font.font ?? "open-sans");

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
      const extrudeResult = extrudeLabel(
        baseResult,
        labelDrawing,
        req.style,
        req.base.labelDepth ?? 0.4,
      );
      lastSolid = extrudeResult.solid;

      // Generate mesh for preview
      const mesh = extrudeResult.solid.mesh({ tolerance: 0.05, angularTolerance: 5 });
      const faces = new Float32Array(mesh.vertices);
      const normals = new Float32Array(mesh.normals);
      const indices = new Uint32Array(mesh.triangles);

      // Apply non-uniform scale to mesh vertices and normals
      const [sx, sy, sz] = req.scale ?? [1, 1, 1];
      if (sx !== 1 || sy !== 1 || sz !== 1) {
        for (let i = 0; i < faces.length; i += 3) {
          faces[i] = faces[i]! * sx;
          faces[i + 1] = faces[i + 1]! * sy;
          faces[i + 2] = faces[i + 2]! * sz;
        }
        // Scale normals by inverse scale, then renormalize
        const isx = 1 / sx, isy = 1 / sy, isz = 1 / sz;
        for (let i = 0; i < normals.length; i += 3) {
          const nx = normals[i]! * isx, ny = normals[i + 1]! * isy, nz = normals[i + 2]! * isz;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          normals[i] = nx / len;
          normals[i + 1] = ny / len;
          normals[i + 2] = nz / len;
        }
      }

      const msg: MeshResponse = {
        id: req.id,
        type: "MESH",
        faces,
        normals,
        indices,
        baseTriangleCount: extrudeResult.baseTriangleCount,
      };
      self.postMessage(msg, { transfer: [faces.buffer, normals.buffer, indices.buffer] });
    } else if (req.type === "RENDER_SVG") {
      const options: RenderOptions = {
        ...DEFAULT_RENDER_OPTIONS,
        ...req.options,
      };

      setActiveFont(options.font.font ?? "open-sans");

      // Build the base only for area dimensions
      const baseResult = buildBase({ ...req.base, style: req.style });

      // Render label drawing (2D only — no extrude/mesh)
      const renderer = new LabelRenderer(options);
      const specs = req.spec.split("\0");
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

      const { drawingToFilledSVG } = await import("./font.js");
      const svgString = drawingToFilledSVG(labelDrawing);

      const msg: SvgResponse = {
        id: req.id,
        type: "SVG",
        svg: svgString,
      };
      self.postMessage(msg);
    } else if (req.type === "EXPORT") {
      if (!lastSolid) {
        throw new Error("No solid to export — render first");
      }

      let buffer: ArrayBuffer;
      let mimeType: string;
      let filename: string;

      if (req.format === "stl") {
        const blob = lastSolid.blobSTL({ tolerance: 0.05, angularTolerance: 5 });
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
