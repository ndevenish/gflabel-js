#!/usr/bin/env npx tsx
/**
 * Generate derived fragment SVGs and the palette manifest.
 *
 * Source SVGs (hardware, screw heads) embed metadata as data-* attributes.
 * This script generates any derived fragments (e.g. hexhead variants from
 * head drive types) via the CAD pipeline, then builds the unified manifest.
 *
 * Usage:  npx tsx scripts/gen-fragment-icons.ts
 *
 * Outputs:
 *   src/assets/fragments/hexhead-*.svg  — generated hexhead SVGs
 *   src/assets/fragments/manifest.json  — metadata for the palette UI
 */

import { resolve, dirname } from "path";
import { writeFileSync, readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "src/assets/fragments");

interface ManifestEntry {
  /** Unique key, used as filename (without .svg) */
  name: string;
  /** Human-readable label */
  label: string;
  /** Spec string to insert, e.g. "{nut}" or "{sym(resistor)}" */
  spec: string;
  /** Grouping category */
  category: string;
}

const dataNameRe = /data-name="([^"]+)"/;
const dataLabelRe = /data-label="([^"]+)"/;
const dataSpecRe = /data-spec="([^"]+)"/;
const dataCategoryRe = /data-category="([^"]+)"/;

// ── CAD pipeline init ─────────────────────────────────────────

async function initCAD() {
  const { setOC } = await import("replicad");
  const opencascadeModule = await import(
    "replicad-opencascadejs/src/replicad_single.js"
  );
  const opencascade = opencascadeModule.default;
  const wasmPath = resolve(
    ROOT,
    "node_modules/replicad-opencascadejs/src/replicad_single.wasm",
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const OC = (await opencascade({ locateFile: () => wasmPath })) as any;
  setOC(OC);

  // Load font
  const { loadFont } = await import("../src/cad/font.js");
  const fontPath = resolve(ROOT, "src/assets/OpenSans-Regular.ttf");
  const fontData = readFileSync(fontPath);
  await loadFont(
    fontData.buffer.slice(
      fontData.byteOffset,
      fontData.byteOffset + fontData.byteLength,
    ),
  );

  // Load symbols
  const { loadSymbols } = await import("../src/cad/fragments/symbols.js");
  const symbolsDir = resolve(ROOT, "src/assets/fragments/symbols");
  const symbolManifest = JSON.parse(
    readFileSync(resolve(symbolsDir, "manifest.json"), "utf-8"),
  );
  loadSymbols(symbolManifest, (id: string) =>
    readFileSync(resolve(symbolsDir, `${id}.svg`), "utf-8"),
  );

  // Load SVG-based hardware fragments
  const { loadSvgFragments } = await import(
    "../src/cad/fragments/svgFragments.js"
  );
  loadSvgFragments((name: string) =>
    readFileSync(resolve(OUT_DIR, `${name}.svg`), "utf-8"),
  );

  // Register all fragments
  await import("../src/cad/fragments/index.js");
}

// ── Fragment rendering ────────────────────────────────────────

async function generateDerivedSvgs() {
  const { FRAGMENT_REGISTRY } = await import("../src/cad/fragments/base.js");
  const { drawingToFilledSVG } = await import("../src/cad/font.js");
  const { DEFAULT_RENDER_OPTIONS } = await import("../src/cad/options.js");

  const height = 8;
  const maxWidth = 20;

  function renderAndWrite(
    name: string,
    label: string,
    spec: string,
    category: string,
    fragName: string,
    fragArgs: string[],
  ): boolean {
    const factory = FRAGMENT_REGISTRY.get(fragName);
    if (!factory) {
      console.warn(`  SKIP "${name}" — "${fragName}" not in registry`);
      return false;
    }
    try {
      const fragment = factory(...fragArgs);
      const result = fragment.render(height, maxWidth, DEFAULT_RENDER_OPTIONS);
      if (!result.drawing) {
        console.warn(`  SKIP "${name}" — no drawing`);
        return false;
      }
      const meta = { name, label, spec, category };
      const svg = drawingToFilledSVG(result.drawing, 3, meta);
      writeFileSync(resolve(OUT_DIR, `${name}.svg`), svg, "utf-8");
      console.log(`  ${name}.svg`);
      return true;
    } catch (err) {
      console.error(`  FAILED ${name}: ${err}`);
      return false;
    }
  }

  // ── Hexhead fragments ──────────────────────────────────────
  // Only plain and slotted; all other drive variants available via spec input.
  const hexheadVariants: { name: string; label: string; args: string[]; spec: string }[] = [
    { name: "hexhead-plain", label: "Hex Head", args: [], spec: "{hexhead}" },
    { name: "hexhead-r", label: "Hex Head (Rotated)", args: ["r"], spec: "{hexhead(r)}" },
    { name: "hexhead-slot", label: "Hex Head (Slot)", args: ["slot"], spec: "{hexhead(slot)}" },
  ];

  console.log("Hexhead fragments:");
  for (const { name, label, args, spec } of hexheadVariants) {
    renderAndWrite(name, label, spec, "Screw Heads", "hexhead", args);
  }
}

// ── Manifest generation ───────────────────────────────────────

function buildManifest() {
  const manifest: ManifestEntry[] = [];

  // Scan SVGs with embedded data-* metadata
  for (const file of readdirSync(OUT_DIR).filter((f) => f.endsWith(".svg")).sort()) {
    const content = readFileSync(resolve(OUT_DIR, file), "utf-8");
    const nameMatch = dataNameRe.exec(content);
    if (!nameMatch) continue;
    const labelMatch = dataLabelRe.exec(content);
    const specMatch = dataSpecRe.exec(content);
    const categoryMatch = dataCategoryRe.exec(content);
    if (labelMatch && specMatch && categoryMatch) {
      manifest.push({
        name: nameMatch[1]!,
        label: labelMatch[1]!,
        spec: specMatch[1]!,
        category: categoryMatch[1]!,
      });
    }
  }
  console.log(`Found ${manifest.length} SVGs with embedded metadata`);

  // Electrical symbols
  const symbolsDir = resolve(ROOT, "src/assets/fragments/symbols");
  const symbolManifest = JSON.parse(
    readFileSync(resolve(symbolsDir, "manifest.json"), "utf-8"),
  ) as Array<{ id: string; name: string; category: string; standard: string }>;

  for (const item of symbolManifest) {
    const safeName = `sym-${item.id}`;
    const stdSuffix =
      item.standard === "COMMON" ? "" : ` (${item.standard})`;
    const label = `${item.name}${stdSuffix}`;
    const category =
      item.category.charAt(0) + item.category.slice(1).toLowerCase();
    manifest.push({ name: safeName, label, spec: `{sym(${item.id})}`, category });
  }

  // Write manifest
  writeFileSync(
    resolve(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
  console.log(`Wrote manifest.json (${manifest.length} entries)`);
  console.log("Done.");
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  await initCAD();
  await generateDerivedSvgs();
  buildManifest();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
