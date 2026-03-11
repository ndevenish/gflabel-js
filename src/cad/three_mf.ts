/**
 * 3MF export with per-triangle colors using @3mfconsortium/lib3mf.
 *
 * The lib3mf WASM module mirrors the Python lib3mf API.
 * Colors are stored in a colorgroup resource; each triangle references
 * a color property from that group.
 */

import type { Solid } from "replicad";
import type { ColorEntry } from "./bases/index.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — no types shipped with this package
import lib3mf from "@3mfconsortium/lib3mf";

// Cache the initialised module so it is only loaded once per context.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _lib3mfModule: any | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLib3MF(): Promise<any> {
  if (!_lib3mfModule) {
    // Suppress Emscripten's internal stdout chatter
    _lib3mfModule = await lib3mf({ print: () => {} });
  }
  return _lib3mfModule;
}

// CSS named color → #RRGGBB
const NAMED_COLORS: Record<string, string> = {
  orange: "#FF6600",
  blue: "#0000FF",
  red: "#FF0000",
  green: "#008000",
  yellow: "#FFFF00",
  purple: "#800080",
  gray: "#808080",
  grey: "#808080",
  white: "#FFFFFF",
  black: "#000000",
  cyan: "#00FFFF",
  magenta: "#FF00FF",
  brown: "#A52A2A",
  pink: "#FFC0CB",
  gold: "#FFD700",
  silver: "#C0C0C0",
  lime: "#00FF00",
  navy: "#000080",
  teal: "#008080",
  maroon: "#800000",
};

/** Normalise any CSS color string to uppercase #RRGGBB (6 hex digits). */
function cssColorToHex(color: string): string {
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toUpperCase();
    }
    return `#${hex.slice(0, 6).toUpperCase()}`;
  }
  return (NAMED_COLORS[trimmed.toLowerCase()] ?? "#808080").toUpperCase();
}

/** Parse #RRGGBB into {r, g, b}. */
function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const h = hex.slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Export a replicad Solid to a 3MF byte array with optional per-triangle colors.
 *
 * @param solid    The replicad Solid (or Compound) to export.
 * @param colorMap Per-color triangle ranges from extrudeLabel(). Undefined = no colors.
 * @param meshOpts Tessellation quality (defaults match preview quality).
 */
export async function exportTo3MF(
  solid: Solid,
  colorMap: ColorEntry[] | undefined,
  meshOpts?: { tolerance: number; angularTolerance: number },
): Promise<Uint8Array> {
  const opts = meshOpts ?? { tolerance: 0.05, angularTolerance: 5 };
  const mesh = solid.mesh(opts);

  const { vertices, triangles } = mesh;
  const vertexCount = vertices.length / 3;
  const triangleCount = triangles.length / 3;

  // ── Build unique color list ──────────────────────────────────────
  const uniqueHexColors: string[] = [];
  const colorToIndex = new Map<string, number>();

  if (colorMap && colorMap.length > 0) {
    for (const entry of colorMap) {
      const hex = cssColorToHex(entry.color);
      if (!colorToIndex.has(hex)) {
        colorToIndex.set(hex, uniqueHexColors.length);
        uniqueHexColors.push(hex);
      }
    }
  }

  // ── Per-triangle color index (-1 = no color) ────────────────────
  const triangleColorIdx = new Int32Array(triangleCount).fill(-1);
  if (colorMap && colorMap.length > 0) {
    for (const entry of colorMap) {
      const hex = cssColorToHex(entry.color);
      const idx = colorToIndex.get(hex)!;
      const end = entry.triangleStart + entry.triangleCount;
      for (let t = entry.triangleStart; t < end; t++) {
        triangleColorIdx[t] = idx;
      }
    }
  }

  const hasColors = uniqueHexColors.length > 0;

  // ── Initialise lib3mf ────────────────────────────────────────────
  const Module = await getLib3MF();
  const wrapper = new Module.CWrapper();
  const model = wrapper.CreateModel();
  model.SetUnit(Module.eModelUnit.MilliMeter);

  // ── Add color group ──────────────────────────────────────────────
  let colorGroupResourceId = 0;
  const colorIds: number[] = [];

  if (hasColors) {
    const colorGroup = model.AddColorGroup();
    colorGroupResourceId = colorGroup.GetResourceID();
    for (const hex of uniqueHexColors) {
      const { r, g, b } = hexToRGB(hex);
      const c = wrapper.RGBAToColor(r, g, b, 255);
      colorIds.push(colorGroup.AddColor(c));
    }
  }

  // ── Add mesh object ──────────────────────────────────────────────
  const meshObj = model.AddMeshObject();

  // Add vertices
  for (let i = 0; i < vertexCount; i++) {
    const pos = new Module.sPosition();
    pos.set_Coordinates0(vertices[i * 3]!);
    pos.set_Coordinates1(vertices[i * 3 + 1]!);
    pos.set_Coordinates2(vertices[i * 3 + 2]!);
    meshObj.AddVertex(pos);
  }

  // Add triangles + per-triangle color properties
  for (let t = 0; t < triangleCount; t++) {
    const tri = new Module.sTriangle();
    tri.set_Indices0(triangles[t * 3]!);
    tri.set_Indices1(triangles[t * 3 + 1]!);
    tri.set_Indices2(triangles[t * 3 + 2]!);
    meshObj.AddTriangle(tri);

    if (hasColors) {
      const ci = triangleColorIdx[t]!;
      const colorId = ci >= 0 ? colorIds[ci]! : colorIds[0]!;
      const tp = new Module.sTriangleProperties();
      tp.set_ResourceID(colorGroupResourceId);
      tp.set_PropertyIDs0(colorId);
      tp.set_PropertyIDs1(colorId);
      tp.set_PropertyIDs2(colorId);
      meshObj.SetTriangleProperties(t, tp);
    }
  }

  // ── Build and write ──────────────────────────────────────────────
  // lib3mf requires an object-level property when per-triangle properties are set.
  if (hasColors) {
    meshObj.SetObjectLevelProperty(colorGroupResourceId, colorIds[0]!);
  }

  model.AddBuildItem(meshObj, wrapper.GetIdentityTransform());

  const writer = model.QueryWriter("3mf");
  const outPath = "/gflabel_export.3mf";
  writer.WriteToFile(outPath);

  // Read back from WASM virtual filesystem
  const data: Uint8Array = Module.FS.readFile(outPath) as Uint8Array;

  // Clean up virtual file
  try {
    Module.FS.unlink(outPath);
  } catch {
    // ignore
  }

  return data;
}
