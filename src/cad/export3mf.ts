/**
 * Minimal 3MF (3D Manufacturing Format) writer with multi-colour / multi-slot
 * support, targeting OrcaSlicer / BambuStudio (and generic 3MF viewers).
 *
 * A 3MF file is an OPC ZIP package. We emit, per label, one *assembled object*
 * whose sub-parts (e.g. "Base" + "Text") are separate child mesh objects
 * referenced via `<components>`. Each label object gets its own `<build><item>`,
 * so a plate of many labels shows as many independent, movable objects.
 *
 * Colours / filament slots are written two ways so the file "just works":
 *  - Core `<basematerials>` + per-child `pid`/`pindex`, so any 3MF viewer shows
 *    the right colours.
 *  - `Metadata/model_settings.config` (the OrcaSlicer/BambuStudio project format)
 *    assigning each part to a filament **slot** (`extruder`, 1-based), so the
 *    slicer puts each colour on a different filament automatically — no hand
 *    painting.
 */

import { zipSync, strToU8 } from "fflate";

export interface Mesh3MF {
  /** Flat vertex coordinates: [x0,y0,z0, x1,y1,z1, ...]. */
  vertices: ArrayLike<number>;
  /** Flat triangle indices into the vertex list: [a0,b0,c0, a1,b1,c1, ...]. */
  triangles: ArrayLike<number>;
}

export interface Part3MF {
  mesh: Mesh3MF;
  /** RGB colour, each channel 0-255. */
  color: [number, number, number];
  /** Optional human-readable part name. */
  name?: string;
}

/**
 * A grouping of coloured mesh parts that form one printable object on the plate
 * (e.g. one label = a "Base" part + a "Text" part). Each object becomes its own
 * `<build><item>`, with its parts on separate filament slots.
 */
export interface Object3MF {
  name?: string;
  parts: Part3MF[];
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
  <Default Extension="config" ContentType="application/xml" />
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

/** Format a coordinate compactly: fixed precision with trailing zeros stripped. */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  let s = n.toFixed(5);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  if (s === "-0") s = "0";
  return s;
}

/** #RRGGBBFF hex string from an [r,g,b] triple (0-255). */
function colorHex([r, g, b]: [number, number, number]): string {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}FF`.toUpperCase();
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Weld coincident vertices into a single shared index.
 *
 * OpenCascade tessellates each topological face independently, so vertices
 * along an edge shared by two faces are duplicated. 3MF uses an indexed vertex
 * list, so those duplicates leave the shared edges topologically disconnected —
 * slicers then report them as non-manifold. Merging vertices by (quantised)
 * position and remapping the triangles restores a watertight indexed mesh.
 * Degenerate triangles (collapsed by the merge) are dropped.
 */
export function weldMesh(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
): { vertices: number[]; triangles: number[] } {
  const QUANT = 1e4; // snap to 1e-4 mm — far finer than any real label feature
  const map = new Map<string, number>();
  const outVerts: number[] = [];
  const remap = new Int32Array(vertices.length / 3);

  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i]!, y = vertices[i + 1]!, z = vertices[i + 2]!;
    const key = `${Math.round(x * QUANT)},${Math.round(y * QUANT)},${Math.round(z * QUANT)}`;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = outVerts.length / 3;
      map.set(key, idx);
      outVerts.push(x, y, z);
    }
    remap[i / 3] = idx;
  }

  const outTris: number[] = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const a = remap[triangles[i]!]!;
    const b = remap[triangles[i + 1]!]!;
    const c = remap[triangles[i + 2]!]!;
    if (a === b || b === c || a === c) continue; // drop degenerate triangles
    outTris.push(a, b, c);
  }

  return { vertices: outVerts, triangles: outTris };
}

interface BuiltPart {
  childId: number;
  extruder: number;
  name: string;
}

interface BuiltObject {
  parentId: number;
  name?: string;
  parts: BuiltPart[];
}

/**
 * Build the bytes of a `.3mf` package. Pass one {@link Object3MF} per printable
 * object; parts with no triangles and empty objects are skipped.
 */
export function export3mf(objects: Object3MF[]): Uint8Array {
  const groups = objects
    .map((o) => ({ name: o.name, parts: o.parts.filter((p) => p.mesh.triangles.length >= 3) }))
    .filter((o) => o.parts.length > 0);

  if (groups.length === 0) throw new Error("Nothing to export to 3MF");

  // Deduplicate colours into base-material entries. Colour index → filament slot.
  const colorIndex = new Map<string, number>();
  const baseEntries: string[] = [];
  const colorOf = (part: Part3MF): number => {
    const hex = colorHex(part.color);
    let idx = colorIndex.get(hex);
    if (idx === undefined) {
      idx = baseEntries.length;
      colorIndex.set(hex, idx);
      const name = part.name ?? `Material ${idx + 1}`;
      baseEntries.push(`      <base name="${escapeXml(name)}" displaycolor="${hex}" />`);
    }
    return idx;
  };

  const MATERIALS_ID = 1;
  let nextId = 2;

  const childXml: string[] = [];
  const parentXml: string[] = [];
  const built: BuiltObject[] = [];

  for (const group of groups) {
    const parts: BuiltPart[] = [];
    const componentXml: string[] = [];

    for (const part of group.parts) {
      const ci = colorOf(part);
      const childId = nextId++;
      childXml.push(buildChildObject(childId, MATERIALS_ID, ci, part));
      componentXml.push(`      <component objectid="${childId}" />`);
      parts.push({ childId, extruder: ci + 1, name: part.name ?? "Part" });
    }

    const parentId = nextId++;
    const nameAttr = group.name ? ` name="${escapeXml(group.name)}"` : "";
    parentXml.push(`    <object id="${parentId}" type="model"${nameAttr}>
      <components>
${componentXml.join("\n")}
      </components>
    </object>`);
    built.push({ parentId, name: group.name, parts });
  }

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <basematerials id="${MATERIALS_ID}">
${baseEntries.join("\n")}
    </basematerials>
${childXml.join("\n")}
${parentXml.join("\n")}
  </resources>
  <build>
${built.map((b) => `    <item objectid="${b.parentId}" />`).join("\n")}
  </build>
</model>`;

  const settings = buildModelSettings(built);

  return zipSync(
    {
      "[Content_Types].xml": strToU8(CONTENT_TYPES),
      "_rels/.rels": strToU8(RELS),
      "3D/3dmodel.model": strToU8(model),
      "Metadata/model_settings.config": strToU8(settings),
    },
    { level: 6 },
  );
}

/** A single-colour child mesh object (one label part). */
function buildChildObject(id: number, materialsId: number, pindex: number, part: Part3MF): string {
  const { vertices, triangles } = weldMesh(part.mesh.vertices, part.mesh.triangles);

  const verts: string[] = [];
  for (let i = 0; i < vertices.length; i += 3) {
    verts.push(
      `        <vertex x="${fmt(vertices[i]!)}" y="${fmt(vertices[i + 1]!)}" z="${fmt(vertices[i + 2]!)}" />`,
    );
  }
  const tris: string[] = [];
  for (let i = 0; i < triangles.length; i += 3) {
    tris.push(`        <triangle v1="${triangles[i]}" v2="${triangles[i + 1]}" v3="${triangles[i + 2]}" />`);
  }

  const nameAttr = part.name ? ` name="${escapeXml(part.name)}"` : "";
  return `    <object id="${id}" type="model" pid="${materialsId}" pindex="${pindex}"${nameAttr}>
      <mesh>
        <vertices>
${verts.join("\n")}
        </vertices>
        <triangles>
${tris.join("\n")}
        </triangles>
      </mesh>
    </object>`;
}

/**
 * OrcaSlicer / BambuStudio project config: for each assembled object, assign
 * each part (a component sub-object) to a filament slot (`extruder`, 1-based).
 * This is what makes the slicer put each colour on a different filament without
 * any manual painting.
 */
function buildModelSettings(built: BuiltObject[]): string {
  const objects = built.map((b) => {
    const nameMeta = b.name
      ? `    <metadata key="name" value="${escapeXml(b.name)}"/>\n`
      : "";
    const parts = b.parts
      .map(
        (p) => `    <part id="${p.childId}" subtype="normal_part">
      <metadata key="name" value="${escapeXml(p.name)}"/>
      <metadata key="extruder" value="${p.extruder}"/>
    </part>`,
      )
      .join("\n");
    return `  <object id="${b.parentId}">
${nameMeta}${parts}
  </object>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
${objects.join("\n")}
</config>`;
}
