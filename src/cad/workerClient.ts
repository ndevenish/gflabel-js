/**
 * Typed wrapper around the CAD Web Worker.
 * Provides a Promise-based API for the main thread.
 */

import type { BaseConfig } from "./bases/base.js";
import type { LabelStyle, RenderOptions } from "./options.js";

export interface MeshData {
  faces: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  style: string;
  baseTriangleCount?: number;
}

export interface SvgData {
  svg: string;
}

export interface FileData {
  buffer: ArrayBuffer;
  mimeType: string;
  filename: string;
}

type PendingResolve = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  onProgress?: (done: number, total: number) => void;
};

let _worker: Worker | null = null;
let _ready = false;
let _readyPromise: Promise<void> | null = null;
const _pending = new Map<string, PendingResolve>();
let _onReady: (() => void) | null = null;
let _idCounter = 0;

function nextId(): string {
  return `req_${++_idCounter}`;
}

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });

    _readyPromise = new Promise<void>((resolve) => {
      _onReady = resolve;
    });

    _worker.onmessage = (event: MessageEvent) => {
      const data = event.data;

      if (data.type === "READY") {
        _ready = true;
        _onReady?.();
        return;
      }

      const pending = _pending.get(data.id);
      if (!pending) return;

      // Progress updates keep the request pending until the final message.
      if (data.type === "BATCH_PROGRESS") {
        pending.onProgress?.(data.done, data.total);
        return;
      }

      _pending.delete(data.id);

      if (data.type === "ERROR") {
        pending.reject(new Error(data.message));
      } else {
        pending.resolve(data);
      }
    };

    _worker.onerror = (err) => {
      console.error("Worker error:", err);
    };
  }
  return _worker;
}

async function waitReady(): Promise<void> {
  getWorker();
  if (_ready) return;
  await _readyPromise;
}

function send(
  msg: Record<string, unknown>,
  onProgress?: (done: number, total: number) => void,
): Promise<unknown> {
  const worker = getWorker();
  const id = nextId();
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ ...msg, id });
  });
}

/**
 * Render a label and get back mesh data for 3D preview.
 */
export async function renderLabel(params: {
  spec: string;
  base: BaseConfig;
  style: LabelStyle;
  options?: Partial<RenderOptions>;
  divisions?: number;
  scale?: [number, number, number];
}): Promise<MeshData> {
  await waitReady();
  const result = (await send({
    type: "RENDER",
    ...params,
  })) as { type: "MESH"; faces: Float32Array; normals: Float32Array; indices: Uint32Array; baseTriangleCount?: number };
  return { faces: result.faces, normals: result.normals, indices: result.indices, style: params.style, baseTriangleCount: result.baseTriangleCount };
}

/**
 * Render a label and get back SVG string for 2D preview (no 3D extrusion).
 */
export async function renderSVG(params: {
  spec: string;
  base: BaseConfig;
  style: LabelStyle;
  options?: Partial<RenderOptions>;
  divisions?: number;
}): Promise<SvgData> {
  await waitReady();
  const result = (await send({
    type: "RENDER_SVG",
    ...params,
  })) as { type: "SVG"; svg: string };
  return { svg: result.svg };
}

/**
 * Export the last rendered solid to a file. For 3MF, `colors` sets the base and
 * label filament colours (falls back to the worker's defaults when omitted).
 */
export async function exportFile(
  format: "stl" | "step" | "svg" | "3mf",
  colors?: { base: [number, number, number]; label: [number, number, number] },
): Promise<FileData> {
  await waitReady();
  const result = (await send({
    type: "EXPORT",
    format,
    colors,
  })) as { type: "FILE"; buffer: ArrayBuffer; mimeType: string; filename: string };
  return {
    buffer: result.buffer,
    mimeType: result.mimeType,
    filename: result.filename,
  };
}

export type BatchFormat = "stl" | "step" | "svg" | "3mf";
export type BatchMode = "individual" | "combined";

export interface BatchExportParams {
  template: string;
  rows: Record<string, string>[];
  base: BaseConfig;
  style: LabelStyle;
  options?: Partial<RenderOptions>;
  divisions?: number;
  format: BatchFormat;
  mode: BatchMode;
  colors?: { base: [number, number, number]; label: [number, number, number] };
  gapMm?: number;
  columns?: number;
}

/**
 * Generate a batch of labels from a template + rows. Resolves to a single
 * downloadable file (a ZIP of individual files, or a combined plate).
 * `onProgress(done, total)` fires as each label is rendered.
 */
export async function batchExport(
  params: BatchExportParams,
  onProgress?: (done: number, total: number) => void,
): Promise<FileData> {
  await waitReady();
  const result = (await send({ type: "BATCH", ...params }, onProgress)) as {
    type: "FILE";
    buffer: ArrayBuffer;
    mimeType: string;
    filename: string;
  };
  return {
    buffer: result.buffer,
    mimeType: result.mimeType,
    filename: result.filename,
  };
}

/**
 * Check if worker is ready.
 */
export function isWorkerReady(): boolean {
  return _ready;
}

/**
 * Wait for the worker to be ready.
 */
export async function ensureReady(): Promise<void> {
  await waitReady();
}
