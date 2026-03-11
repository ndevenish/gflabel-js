/**
 * Base geometry entry point.
 */

import { compoundShapes, drawRectangle, type Solid } from "replicad";
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

    // Extrude each color group as its own solid
    const colorGroups = groupColoredDrawings(labelDrawings);
    const labelSolids: Array<{ solid: Solid; color: string }> = [];
    for (const [color, drawing] of colorGroups) {
      const s = drawing.sketchOnPlane("XY", 0).extrude(depth) as Solid;
      labelSolids.push({ solid: s, color });
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
    // Fuse all drawings together and cut from base
    const fusedDrawing = fuseColoredDrawings(labelDrawings);
    if (!fusedDrawing) {
      return { solid: solid ?? (drawRectangle(0.001, 0.001).sketchOnPlane("XY", 0).extrude(depth) as Solid) };
    }
    const labelSolid = fusedDrawing.sketchOnPlane("XY", 0).extrude(-depth) as Solid;
    return { solid: solid ? solid.cut(labelSolid) : labelSolid };
  } else {
    // EMBEDDED: flush label for multi-color printing.
    // Cut the label shape down into the base, then fill per-color with separate solids.
    const fusedDrawing = fuseColoredDrawings(labelDrawings);
    if (!fusedDrawing) {
      return { solid: solid ?? (drawRectangle(0.001, 0.001).sketchOnPlane("XY", 0).extrude(depth) as Solid) };
    }

    const cutSolid = fusedDrawing.sketchOnPlane("XY", 0).extrude(-depth) as Solid;

    if (!solid) {
      return { solid: cutSolid };
    }

    const baseCut = solid.cut(cutSolid);

    // Per-color fill solids
    const colorGroups = groupColoredDrawings(labelDrawings);
    const colorMap: ColorEntry[] = [];
    let triangleStart = 0;
    const allBodies: Solid[] = [baseCut];

    const baseMesh = baseCut.mesh(MESH_OPTS);
    const baseCount = baseMesh.triangles.length / 3;
    colorMap.push({ triangleStart, triangleCount: baseCount, color: baseColor });
    triangleStart += baseCount;

    for (const [color, drawing] of colorGroups) {
      const fillSolid = drawing.sketchOnPlane("XY", 0).extrude(-depth) as Solid;
      const mesh = fillSolid.mesh(MESH_OPTS);
      const count = mesh.triangles.length / 3;
      colorMap.push({ triangleStart, triangleCount: count, color });
      triangleStart += count;
      allBodies.push(fillSolid);
    }

    const compound = compoundShapes(allBodies) as unknown as Solid;
    return { solid: compound, colorMap };
  }
}

export type { BaseConfig, BaseType, LabelBaseResult } from "./base.js";
export { DEFAULT_MARGINS } from "./base.js";
