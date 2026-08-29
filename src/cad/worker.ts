/**
 * Web Worker for CAD operations.
 *
 * Initializes OpenCascade WASM, then handles RENDER and EXPORT messages.
 */

import { setOC, getOC, compoundShapes } from "replicad";
import type { Solid, Drawing } from "replicad";
import { zipSync, strToU8 } from "fflate";
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
import { buildBase, extrudeLabel, extrudeLabelParts } from "./bases/index.js";
import type { BaseConfig, BaseType, LabelBaseResult } from "./bases/index.js";
import type { LabelStyle, RenderOptions } from "./options.js";
import { DEFAULT_RENDER_OPTIONS } from "./options.js";
import { applyTemplate } from "./batch.js";
import { makeLabelFilename, makeLabelStem } from "./naming.js";
import { export3mf, type Part3MF, type Object3MF } from "./export3mf.js";
import { drawingToFilledSVG } from "./font.js";

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
  format: "stl" | "step" | "svg" | "3mf";
  /** RGB colours (0-255) for 3MF multi-colour output. */
  colors?: { base: [number, number, number]; label: [number, number, number] };
}

export type BatchFormat = "stl" | "step" | "svg" | "3mf";
export type BatchMode = "individual" | "combined";

interface BatchRequest {
  id: string;
  type: "BATCH";
  /** Label spec template with `{{column}}` placeholders. */
  template: string;
  /** One record per label — column name → value. */
  rows: Record<string, string>[];
  base: BaseConfig;
  style: LabelStyle;
  options?: Partial<RenderOptions>;
  divisions?: number;
  format: BatchFormat;
  mode: BatchMode;
  /** RGB colours (0-255) for 3MF multi-colour output. */
  colors?: { base: [number, number, number]; label: [number, number, number] };
  /** Gap between labels in the combined plate (mm). */
  gapMm?: number;
  /** Columns in the combined grid; defaults to ~sqrt(n). */
  columns?: number;
}

type WorkerRequest = RenderRequest | RenderSvgRequest | ExportRequest | BatchRequest;

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

interface BatchProgressResponse {
  id: string;
  type: "BATCH_PROGRESS";
  done: number;
  total: number;
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
/** Inputs of the last RENDER, so EXPORT can rebuild coloured parts (3MF). */
let lastRender: {
  base: BaseConfig;
  style: LabelStyle;
  options: RenderOptions;
  spec: string;
  divisions?: number;
} | null = null;

/**
 * Free a replicad shape's underlying OpenCascade (WASM) memory immediately.
 *
 * replicad frees each OC object via a `FinalizationRegistry`, but that only
 * fires on JS GC — and the tiny JS wrappers exert almost no memory pressure
 * while each solid holds megabytes in the WASM heap, so cleanup lags far behind
 * allocation and the heap balloons (the app feels progressively slower).
 * Deleting the shapes we're done with eagerly keeps the WASM heap flat across
 * many renders. Guarded so a double-delete (already-freed object) is a no-op,
 * and `delete` optional so it accepts wrappers that lack one.
 */
function safeDelete(obj: { delete?: () => void } | null | undefined): void {
  try {
    obj?.delete?.();
  } catch {
    // already deleted or not deletable
  }
}

/**
 * Free a Drawing's 2D geometry. The Drawing wrapper has no delete() of its own,
 * but its innerShape (a Blueprint) does — freeing it eagerly avoids piling up
 * curve data during large batch exports.
 */
function safeDeleteDrawing(d: Drawing | null | undefined): void {
  const inner = (d as unknown as { innerShape?: { delete?: () => void } | null })?.innerShape;
  safeDelete(inner);
}

/**
 * Turn a thrown value into a readable message. OpenCascade/Emscripten surface
 * C++ exceptions as a raw pointer number (which changes every run), so plain
 * `String(err)` shows a meaningless number — recover the real message when the
 * runtime exposes it, otherwise return a clear CAD-engine notice.
 */
function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "number") {
    try {
      const oc = getOC() as unknown as { getExceptionMessage?: (p: number) => unknown };
      const raw = oc.getExceptionMessage?.(err);
      const text = Array.isArray(raw) ? raw.filter(Boolean).join(": ") : String(raw ?? "");
      if (text && text !== "undefined") return text;
    } catch {
      // OC runtime unavailable or no exception helper — fall through
    }
    return "the CAD engine could not build this geometry";
  }
  return String(err);
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

// ── Batch helpers ─────────────────────────────────────────────

const MESH_OPTS = { tolerance: 0.05, angularTolerance: 5 };

/** Build the 2D label drawing for a spec within a base, mirroring RENDER. */
function buildLabelDrawing(
  spec: string,
  baseResult: LabelBaseResult,
  options: RenderOptions,
  divisions?: number,
): Drawing {
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

/** Mesh a label as separate coloured base/text parts for 3MF export. */
function labelParts(
  baseResult: LabelBaseResult,
  drawing: Drawing,
  style: LabelStyle,
  depth: number,
  baseColor: [number, number, number],
  labelColor: [number, number, number],
  offset?: [number, number],
): Part3MF[] {
  const { baseBody, labelBody } = extrudeLabelParts(baseResult, drawing, style, depth);
  const place = (s: Solid): Solid =>
    offset && (offset[0] || offset[1]) ? (s.translate([offset[0], offset[1], 0]) as Solid) : s;

  // Mesh each body into plain JS arrays (copied out of WASM), then free the
  // solids — including any translated copy `place()` produced.
  const out: Part3MF[] = [];
  const basePlaced = place(baseBody);
  const bm = basePlaced.mesh(MESH_OPTS);
  out.push({ mesh: { vertices: bm.vertices, triangles: bm.triangles }, color: baseColor, name: "Base" });
  if (basePlaced !== baseBody) safeDelete(basePlaced);
  safeDelete(baseBody);
  if (labelBody) {
    const labelPlaced = place(labelBody);
    const lm = labelPlaced.mesh(MESH_OPTS);
    out.push({ mesh: { vertices: lm.vertices, triangles: lm.triangles }, color: labelColor, name: "Text" });
    if (labelPlaced !== labelBody) safeDelete(labelPlaced);
    safeDelete(labelBody);
  }
  return out;
}

/** Ensure a filename is unique within a set, appending -2, -3, … on collision. */
function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) { used.add(name); return name; }
  const dot = name.lastIndexOf(".");
  const stem = dot >= 0 ? name.slice(0, dot) : name;
  const ext = dot >= 0 ? name.slice(dot) : "";
  let n = 2;
  let candidate = `${stem}-${n}${ext}`;
  while (used.has(candidate)) candidate = `${stem}-${++n}${ext}`;
  used.add(candidate);
  return candidate;
}

/** Post a completed file back to the main thread (buffer transferred). */
function sendFile(id: string, bytes: Uint8Array, mimeType: string, filename: string): void {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const msg: FileResponse = { id, type: "FILE", buffer, mimeType, filename };
  self.postMessage(msg, { transfer: [buffer] });
}

async function solidBytes(solid: Solid, format: "stl" | "step"): Promise<Uint8Array> {
  const blob = format === "stl" ? solid.blobSTL(MESH_OPTS) : solid.blobSTEP();
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Render every CSV row through the template and package the results, either as
 * a ZIP of individual files or a single combined plate.
 */
async function handleBatch(req: BatchRequest): Promise<void> {
  const options: RenderOptions = { ...DEFAULT_RENDER_OPTIONS, ...req.options };
  setActiveFont(options.font.font ?? "open-sans");

  const { rows } = req;
  const total = rows.length;
  if (total === 0) throw new Error("No rows to generate");

  const baseColor = req.colors?.base ?? [128, 128, 128];
  const labelColor = req.colors?.label ?? [30, 30, 30];
  const gap = req.gapMm ?? 2;
  const depth = req.base.labelDepth ?? 0.4;
  const baseType = req.base.baseType as BaseType;
  const width = req.base.width ?? 1;

  const postProgress = (done: number) => {
    const msg: BatchProgressResponse = { id: req.id, type: "BATCH_PROGRESS", done, total };
    self.postMessage(msg);
  };

  const buildRow = (spec: string) => {
    const baseResult = buildBase({ ...req.base, style: req.style });
    const drawing = buildLabelDrawing(spec, baseResult, options, req.divisions);
    return { baseResult, drawing };
  };

  const stem = `${makeLabelStem(baseType, width, "batch")}-${total}`;

  if (req.mode === "individual") {
    const files: Record<string, Uint8Array> = {};
    const used = new Set<string>();
    for (let i = 0; i < total; i++) {
      const spec = applyTemplate(req.template, rows[i]!);
      if (!spec.trim()) { postProgress(i + 1); continue; }
      try {
        const { baseResult, drawing } = buildRow(spec);

        let bytes: Uint8Array;
        if (req.format === "svg") {
          bytes = strToU8(drawingToFilledSVG(drawing));
        } else if (req.format === "3mf") {
          bytes = export3mf([
            {
              name: makeLabelStem(baseType, width, spec),
              parts: labelParts(baseResult, drawing, req.style, depth, baseColor, labelColor),
            },
          ]);
        } else {
          const { solid } = extrudeLabel(baseResult, drawing, req.style, depth);
          bytes = await solidBytes(solid, req.format);
          safeDelete(solid);
        }

        // Free this row's shapes so a large CSV can't balloon the WASM heap.
        safeDeleteDrawing(drawing);
        safeDelete(baseResult.solid);

        const name = uniqueName(makeLabelFilename(baseType, width, spec, req.format), used);
        files[name] = bytes;
      } catch (e) {
        throw new Error(`Row ${i + 1} ("${spec}"): could not generate — ${formatError(e)}`);
      }
      postProgress(i + 1);
    }
    if (Object.keys(files).length === 0) throw new Error("No non-empty labels to export");
    sendFile(req.id, zipSync(files, { level: 6 }), "application/zip", `${stem}.zip`);
    return;
  }

  // combined: lay labels out in a grid
  const columns = req.columns && req.columns > 0 ? req.columns : Math.ceil(Math.sqrt(total));
  let cellW = 0;
  let cellH = 0;
  const solids: Solid[] = [];
  const objects: Object3MF[] = [];
  let svg: Drawing | null = null;

  for (let i = 0; i < total; i++) {
    const spec = applyTemplate(req.template, rows[i]!);
    if (!spec.trim()) { postProgress(i + 1); continue; }
    try {
      const { baseResult, drawing } = buildRow(spec);

      if (cellW === 0) {
        if (baseResult.solid) {
          const [min, max] = baseResult.solid.boundingBox.bounds;
          cellW = max[0] - min[0];
          cellH = max[1] - min[1];
        } else {
          cellW = drawing.boundingBox.width;
          cellH = drawing.boundingBox.height;
        }
      }
      const dx = (i % columns) * (cellW + gap);
      const dy = -Math.floor(i / columns) * (cellH + gap);

      if (req.format === "svg") {
        const t = drawing.translate([dx, dy]) as Drawing;
        if (svg) {
          const prev = svg;
          svg = svg.fuse(t);
          safeDeleteDrawing(prev);
          safeDeleteDrawing(t);
        } else {
          svg = t;
        }
      } else if (req.format === "3mf") {
        objects.push({
          name: makeLabelStem(baseType, width, spec),
          parts: labelParts(baseResult, drawing, req.style, depth, baseColor, labelColor, [dx, dy]),
        });
      } else {
        const { solid } = extrudeLabel(baseResult, drawing, req.style, depth);
        if (dx || dy) {
          solids.push(solid.translate([dx, dy, 0]) as Solid);
          safeDelete(solid); // keep only the translated copy
        } else {
          solids.push(solid);
        }
      }

      // Free per-row shapes not retained for the combined output.
      safeDeleteDrawing(drawing);
      safeDelete(baseResult.solid);
    } catch (e) {
      throw new Error(`Row ${i + 1} ("${spec}"): could not generate — ${formatError(e)}`);
    }
    postProgress(i + 1);
  }

  if (req.format === "svg") {
    if (!svg) throw new Error("No non-empty labels to export");
    sendFile(req.id, strToU8(drawingToFilledSVG(svg)), "image/svg+xml", `${stem}.svg`);
    safeDeleteDrawing(svg);
  } else if (req.format === "3mf") {
    if (objects.length === 0) throw new Error("No non-empty labels to export");
    sendFile(req.id, export3mf(objects), "model/3mf", `${stem}.3mf`);
  } else {
    if (solids.length === 0) throw new Error("No non-empty labels to export");
    const combined =
      solids.length === 1 ? solids[0]! : (compoundShapes(solids) as unknown as Solid);
    const mime = req.format === "stl" ? "model/stl" : "model/step";
    sendFile(req.id, await solidBytes(combined, req.format), mime, `${stem}.${req.format}`);
    for (const s of solids) safeDelete(s);
    if (combined !== solids[0]) safeDelete(combined);
  }
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

      // Release the previous render's retained WASM shapes before building new
      // ones (module-level refs are never reclaimed by the FinalizationRegistry).
      safeDelete(lastSolid);
      lastSolid = null;
      safeDeleteDrawing(lastDrawing);
      lastDrawing = null;

      lastRender = { base: req.base, style: req.style, options, spec: req.spec, divisions: req.divisions };

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

      // The base solid was an input to the boolean op; the final solid is a new
      // shape, so free the base to keep per-render WASM usage flat.
      if (baseResult.solid && baseResult.solid !== lastSolid) safeDelete(baseResult.solid);

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

      // Release the previous drawing before building a new one (this path runs
      // often — e.g. the bolt builder re-renders an SVG every 300ms).
      safeDeleteDrawing(lastDrawing);
      lastDrawing = null;

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

      // The base solid is only built for its area here — free it.
      safeDelete(baseResult.solid);

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
        const svgString = drawingToFilledSVG(lastDrawing);
        buffer = new TextEncoder().encode(svgString).buffer;
        mimeType = "image/svg+xml";
        filename = "label.svg";
      } else if (req.format === "3mf") {
        if (!lastRender) {
          throw new Error("No label to export — render first");
        }
        const { base, style, options, spec, divisions } = lastRender;
        const baseResult = buildBase({ ...base, style });
        const drawing = buildLabelDrawing(spec, baseResult, options, divisions);
        const baseColor = req.colors?.base ?? [128, 128, 128];
        const labelColor = req.colors?.label ?? [30, 30, 30];
        const parts = labelParts(baseResult, drawing, style, base.labelDepth ?? 0.4, baseColor, labelColor);
        const name = makeLabelStem(base.baseType as BaseType, base.width ?? 1, spec.split("\0")[0] ?? spec);
        const bytes = export3mf([{ name, parts }]);
        buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        mimeType = "model/3mf";
        filename = "label.3mf";
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
    } else if (req.type === "BATCH") {
      await handleBatch(req);
    }
  } catch (err) {
    const msg: ErrorResponse = {
      id: req.id,
      type: "ERROR",
      message: formatError(err),
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
