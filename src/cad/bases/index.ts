/**
 * Base geometry entry point.
 */

import { compoundShapes, drawRectangle, type Drawing, type Solid } from "replicad";
import type { BaseConfig, LabelBaseResult } from "./base.js";
import { buildPredBase } from "./pred.js";
import { buildPlainBase } from "./plain.js";
import { buildNoneBase } from "./none.js";
import { buildPredboxBase } from "./predbox.js";
import { buildTailorboxBase } from "./tailorbox.js";
import { buildCullenectBase } from "./cullenect.js";
import { buildModernBase } from "./modern.js";
import { LabelStyle } from "../options.js";
import type { ColoredDrawing } from "../options.js";
import { fuseColoredDrawings, groupColoredDrawings } from "../label.js";

export function buildBase(config: BaseConfig): LabelBaseResult {
  switch (config.baseType) {
    case "pred":
      return buildPredBase(config);
    case "plain":
      return buildPlainBase(config);
    case "none":
      return buildNoneBase(config);
    case "predbox":
      return buildPredboxBase(config);
    case "tailorbox":
      return buildTailorboxBase(config);
    case "cullenect":
      return buildCullenectBase(config);
    case "modern":
      return buildModernBase(config);
    default:
      throw new Error(`Unknown base type: ${config.baseType}`);
  }
}

/** Per-color triangle range entry in the mesh. */
export interface ColorEntry {
  triangleStart: number;
  triangleCount: number;
  color: string;
}

/**
 * Extrude a label Drawing onto/into a base solid.
 *
 * Z-offsets per plan:
 * - Embossed: label at z=0 (base surface), extrude up by +depth (raised text)
 * - Debossed: label at z=0, extrude down by -depth (cut into surface)
 * - Embedded: label at z=0, extrude up by +depth, returned as separate compound
 *   (not fused to base — allows different colors in multi-color slicing)
 */
export interface ExtrudeResult {
  solid: Solid;
  /** For embedded (legacy): number of triangles belonging to the base body */
  baseTriangleCount?: number;
  /** Per-color triangle ranges (when color info is available) */
  colorMap?: ColorEntry[];
}

const MESH_OPTS = { tolerance: 0.05, angularTolerance: 5 };

/**
 * Extrude a single ColoredDrawing with optional z scale/offset applied.
 * Returns a Solid. Direction is positive (embossed/embedded fill) or negative (debossed cut).
 */
function extrudeOne(
  drawing: Drawing,
  depth: number,
  zScale: number,
  zOffset: number,
  direction: 1 | -1,
): Solid {
  const actualDepth = depth * zScale * direction;
  const planeOrigin = zOffset;
  return drawing.sketchOnPlane("XY", planeOrigin).extrude(actualDepth) as Solid;
}

/** True if a ColoredDrawing has non-default z transforms. */
function hasCustomZ(cd: ColoredDrawing): boolean {
  return (cd.zScale ?? 1) !== 1 || (cd.zOffset ?? 0) !== 0;
}

export function extrudeLabel(
  baseResult: LabelBaseResult,
  labelDrawings: ColoredDrawing[],
  style: LabelStyle,
  depth: number = 0.4,
  baseColor: string = "orange",
): ExtrudeResult {
  const { solid } = baseResult;

  if (style === LabelStyle.EMBOSSED) {
    if (labelDrawings.length === 0) {
      return { solid: solid ?? (drawRectangle(0.001, 0.001).sketchOnPlane("XY", 0).extrude(depth) as Solid) };
    }

    // Separate drawings with custom z from those without
    const normalDrawings = labelDrawings.filter((cd) => !hasCustomZ(cd));
    const customZDrawings = labelDrawings.filter(hasCustomZ);

    // Group normal drawings by color and extrude together
    const colorGroups = groupColoredDrawings(normalDrawings);
    const labelSolids: Array<{ solid: Solid; color: string }> = [];
    for (const [color, drawing] of colorGroups) {
      const s = drawing.sketchOnPlane("XY", 0).extrude(depth) as Solid;
      labelSolids.push({ solid: s, color });
    }
    // Extrude custom-z drawings individually
    for (const cd of customZDrawings) {
      const s = extrudeOne(cd.drawing, depth, cd.zScale ?? 1, cd.zOffset ?? 0, 1);
      labelSolids.push({ solid: s, color: cd.color });
    }

    // Build colorMap by meshing each body separately
    const colorMap: ColorEntry[] = [];
    let triangleStart = 0;
    const allBodies: Solid[] = [];

    if (solid) {
      const baseMesh = solid.mesh(MESH_OPTS);
      const count = baseMesh.triangles.length / 3;
      colorMap.push({ triangleStart, triangleCount: count, color: baseColor });
      triangleStart += count;
      allBodies.push(solid);
    }

    for (const { solid: ls, color } of labelSolids) {
      const mesh = ls.mesh(MESH_OPTS);
      const count = mesh.triangles.length / 3;
      colorMap.push({ triangleStart, triangleCount: count, color });
      triangleStart += count;
      allBodies.push(ls);
    }

    if (allBodies.length === 1) {
      return { solid: allBodies[0]!, colorMap };
    }
    const compound = compoundShapes(allBodies) as unknown as Solid;
    return { solid: compound, colorMap };
  } else if (style === LabelStyle.DEBOSSED) {
    // Fuse all drawings (each with its own z scale applied) and cut from base
    if (labelDrawings.length === 0) {
      return { solid: solid ?? (drawRectangle(0.001, 0.001).sketchOnPlane("XY", 0).extrude(depth) as Solid) };
    }
    // Start by extruding each drawing with its z scale, then fuse into a single cut solid
    let cutSolid: Solid | null = null;
    for (const cd of labelDrawings) {
      const s = extrudeOne(cd.drawing, depth, cd.zScale ?? 1, cd.zOffset ?? 0, -1);
      cutSolid = cutSolid ? (cutSolid.fuse(s) as Solid) : s;
    }
    if (!cutSolid) {
      return { solid: solid ?? (drawRectangle(0.001, 0.001).sketchOnPlane("XY", 0).extrude(depth) as Solid) };
    }
    return { solid: solid ? solid.cut(cutSolid) : cutSolid };
  } else {
    // EMBEDDED: flush label for multi-color printing.
    // Cut the label shape down into the base, then fill per-color with separate solids.
    if (labelDrawings.length === 0) {
      return { solid: solid ?? (drawRectangle(0.001, 0.001).sketchOnPlane("XY", 0).extrude(depth) as Solid) };
    }

    // For the cut, fuse all drawings ignoring z (cut uses base depth to create pocket)
    const fusedDrawing = fuseColoredDrawings(labelDrawings);
    if (!fusedDrawing) {
      return { solid: solid ?? (drawRectangle(0.001, 0.001).sketchOnPlane("XY", 0).extrude(depth) as Solid) };
    }

    const cutSolid = fusedDrawing.sketchOnPlane("XY", 0).extrude(-depth) as Solid;

    if (!solid) {
      return { solid: cutSolid };
    }

    const baseCut = solid.cut(cutSolid);

    // Per-color fill solids (with z scale/offset applied to each)
    const colorMap: ColorEntry[] = [];
    let triangleStart = 0;
    const allBodies: Solid[] = [baseCut];

    const baseMesh = baseCut.mesh(MESH_OPTS);
    const baseCount = baseMesh.triangles.length / 3;
    colorMap.push({ triangleStart, triangleCount: baseCount, color: baseColor });
    triangleStart += baseCount;

    // Group by color for fill solids, but apply z transforms individually
    const normalDrawings = labelDrawings.filter((cd) => !hasCustomZ(cd));
    const customZDrawings = labelDrawings.filter(hasCustomZ);

    const colorGroups = groupColoredDrawings(normalDrawings);
    for (const [color, drawing] of colorGroups) {
      const fillSolid = drawing.sketchOnPlane("XY", 0).extrude(-depth) as Solid;
      const mesh = fillSolid.mesh(MESH_OPTS);
      const count = mesh.triangles.length / 3;
      colorMap.push({ triangleStart, triangleCount: count, color });
      triangleStart += count;
      allBodies.push(fillSolid);
    }
    for (const cd of customZDrawings) {
      const fillSolid = extrudeOne(cd.drawing, depth, cd.zScale ?? 1, cd.zOffset ?? 0, -1);
      const mesh = fillSolid.mesh(MESH_OPTS);
      const count = mesh.triangles.length / 3;
      colorMap.push({ triangleStart, triangleCount: count, color: cd.color });
      triangleStart += count;
      allBodies.push(fillSolid);
    }

    const compound = compoundShapes(allBodies) as unknown as Solid;
    return { solid: compound, colorMap };
  }
}

export type { BaseConfig, BaseType, LabelBaseResult } from "./base.js";
export { DEFAULT_MARGINS } from "./base.js";
