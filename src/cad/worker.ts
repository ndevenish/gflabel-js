/**
 * Web Worker for CAD operations.
 *
 * Initializes OpenCascade WASM, then handles RENDER and EXPORT messages.
 */

import { setOC, compoundShapes } from "replicad";
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
import type { ColoredDrawing } from "./label.js";
import { buildBase, extrudeLabel } from "./bases/index.js";
import type { BaseConfig, ColorEntry, LabelBaseResult } from "./bases/index.js";
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
  baseColor?: string;
  labelColor?: string;
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
  format: "stl" | "step" | "svg" | "3mf";
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
  colorMap?: ColorEntry[];
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
let lastColoredDrawings: ColoredDrawing[] = [];
let lastColorMap: ColorEntry[] | undefined;

// ── Constants ────────────────────────────────────────────────

/** Separator line used in the spec textarea to split multiple physical labels. */
const PHYSICAL_LABEL_SEP_RE = /\n[ \t]*---[ \t]*\n/;

/** Gap in mm between stacked physical labels. */
const LABEL_GAP_MM = 2;

// ── Helpers ───────────────────────────────────────────────────

/**
 * Render a single physical label spec to ColoredDrawing[].
 * Handles `\0`-separated column specs (for divided labels).
 */
function renderSpecDrawings(
  spec: string,
  baseResult: LabelBaseResult,
  options: RenderOptions,
  divisions?: number,
): ColoredDrawing[] {
  const renderer = new LabelRenderer(options);
  const specs = spec.split("\0");
  if (specs.length > 1 || (divisions && divisions > 1)) {
    return renderDividedLabel(specs, baseResult.area, divisions ?? specs.length, options);
  }
  const adjustedArea = {
    x: baseResult.area.x - options.marginMm * 2,
    y: baseResult.area.y - options.marginMm * 2,
  };
  return renderer.render(specs[0]!, adjustedArea);
}

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
        ...(req.labelColor ? { defaultColor: req.labelColor } : {}),
      };

      setActiveFont(options.font.font ?? "open-sans");

      const physicalSpecs = req.spec.split(PHYSICAL_LABEL_SEP_RE).filter((s) => s.trim());

      let resultSolid: Solid;
      let resultColorMap: ColorEntry[] | undefined;
      const allColoredDrawings: ColoredDrawing[] = [];

      if (physicalSpecs.length > 1) {
        // Multiple physical labels — render each and stack vertically
        const allBodies: Solid[] = [];
        const allColorMap: ColorEntry[] = [];
        let triangleOffset = 0;
        let yOffset = 0;

        for (const pspec of physicalSpecs) {
          const baseResult = buildBase({ ...req.base, style: req.style });
          const drawings = renderSpecDrawings(pspec, baseResult, options, req.divisions);

          // Track drawings with Y translation for export
          for (const cd of drawings) {
            allColoredDrawings.push({ ...cd, drawing: cd.drawing.translate([0, yOffset]) });
          }

          const extResult = extrudeLabel(
            baseResult,
            drawings,
            req.style,
            req.base.depth ?? options.depth,
            req.baseColor ?? "orange",
          );

          const translated = extResult.solid.translate([0, yOffset, 0]);
          allBodies.push(translated);

          if (extResult.colorMap) {
            for (const entry of extResult.colorMap) {
              allColorMap.push({ ...entry, triangleStart: entry.triangleStart + triangleOffset });
            }
            triangleOffset += extResult.colorMap.reduce((sum, e) => sum + e.triangleCount, 0);
          }

          const physicalHeight = baseResult.solid
            ? baseResult.solid.boundingBox.height
            : baseResult.area.y;
          yOffset -= physicalHeight + LABEL_GAP_MM;
        }

        resultSolid = allBodies.length === 1
          ? allBodies[0]!
          : (compoundShapes(allBodies) as unknown as Solid);
        resultColorMap = allColorMap.length > 0 ? allColorMap : undefined;
      } else {
        // Single physical label
        const baseResult = buildBase({ ...req.base, style: req.style });
        const drawings = renderSpecDrawings(req.spec, baseResult, options, req.divisions);
        allColoredDrawings.push(...drawings);

        const extResult = extrudeLabel(
          baseResult,
          drawings,
          req.style,
          req.base.depth ?? options.depth,
          req.baseColor ?? "orange",
        );
        resultSolid = extResult.solid;
        resultColorMap = extResult.colorMap;
      }

      lastColoredDrawings = allColoredDrawings;
      lastSolid = resultSolid;
      lastColorMap = resultColorMap;

      // Generate mesh for preview
      const mesh = resultSolid.mesh({ tolerance: 0.05, angularTolerance: 5 });
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
        colorMap: resultColorMap,
      };
      self.postMessage(msg, { transfer: [faces.buffer, normals.buffer, indices.buffer] });
    } else if (req.type === "RENDER_SVG") {
      const options: RenderOptions = {
        ...DEFAULT_RENDER_OPTIONS,
        ...req.options,
      };

      setActiveFont(options.font.font ?? "open-sans");

      const physicalSpecs = req.spec.split(PHYSICAL_LABEL_SEP_RE).filter((s) => s.trim());
      const allDrawings: ColoredDrawing[] = [];
      let yOffset = 0;

      for (const pspec of physicalSpecs) {
        const baseResult = buildBase({ ...req.base, style: req.style });
        const drawings = renderSpecDrawings(pspec, baseResult, options, req.divisions);
        for (const cd of drawings) {
          allDrawings.push({ ...cd, drawing: cd.drawing.translate([0, yOffset]) });
        }
        const physicalHeight = baseResult.solid
          ? baseResult.solid.boundingBox.height
          : baseResult.area.y;
        yOffset -= physicalHeight + LABEL_GAP_MM;
      }

      lastColoredDrawings = allDrawings;

      const { coloredDrawingsToSVG } = await import("./font.js");
      const svgString = coloredDrawingsToSVG(allDrawings);

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
      } else if (req.format === "3mf") {
        const { exportTo3MF } = await import("./three_mf.js");
        const data = await exportTo3MF(lastSolid, lastColorMap);
        buffer = data.buffer;
        mimeType = "model/3mf";
        filename = "label.3mf";
      } else if (req.format === "svg") {
        if (lastColoredDrawings.length === 0) {
          throw new Error("No drawing to export — render first");
        }
        const { coloredDrawingsToSVG } = await import("./font.js");
        const svgString = coloredDrawingsToSVG(lastColoredDrawings);
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
