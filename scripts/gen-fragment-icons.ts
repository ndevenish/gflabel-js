#!/usr/bin/env npx tsx
/**
 * Generate SVG icon files for all fragments (hardware + electrical symbols).
 * All icons are rendered through the full replicad/WASM pipeline so they
 * match the actual label output exactly.
 *
 * Usage:  npx tsx scripts/gen-fragment-icons.ts
 *
 * Outputs:
 *   src/assets/fragments/{name}.svg        — individual SVG icons
 *   src/assets/fragments/manifest.json     — metadata for the palette UI
 */

import { resolve, dirname } from "path";
import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { unzipSync } from "fflate";

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

async function main() {
  // Init OpenCascade
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

  // Load symbols ZIP
  const zipPath = resolve(ROOT, "src/assets/chris-pikul-symbols.zip");
  const zipBytes = readFileSync(zipPath);
  const zipUint8 = new Uint8Array(
    zipBytes.buffer.slice(
      zipBytes.byteOffset,
      zipBytes.byteOffset + zipBytes.byteLength,
    ),
  );

  const { loadSymbolsZip } = await import("../src/cad/fragments/symbols.js");
  loadSymbolsZip(zipUint8);

  // Register all fragments
  await import("../src/cad/fragments/index.js");

  const { FRAGMENT_REGISTRY } = await import("../src/cad/fragments/base.js");
  const { drawingToFilledSVG } = await import("../src/cad/font.js");
  const { DEFAULT_RENDER_OPTIONS } = await import("../src/cad/options.js");

  mkdirSync(OUT_DIR, { recursive: true });

  const manifest: ManifestEntry[] = [];
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
      const svg = drawingToFilledSVG(result.drawing);
      writeFileSync(resolve(OUT_DIR, `${name}.svg`), svg, "utf-8");
      manifest.push({ name, label, spec, category });
      console.log(`  ${name}.svg`);
      return true;
    } catch (err) {
      console.error(`  FAILED ${name}: ${err}`);
      return false;
    }
  }

  // ── Hardware fragments ──────────────────────────────────────
  const hardwareFragments = [
    { name: "nut", label: "Nut" },
    { name: "washer", label: "Washer" },
    { name: "lockwasher", label: "Lock Washer" },
    { name: "magnet", label: "Magnet" },
    { name: "threaded_insert", label: "Threaded Insert" },
    { name: "tnut", label: "T-Nut" },
    { name: "circle", label: "Circle" },
    { name: "variable_resistor", label: "Variable Resistor" },
    { name: "nut_profile", label: "Nut Profile" },
    { name: "locknut_profile", label: "Lock Nut Profile" },
  ];

  console.log("Hardware fragments:");
  for (const { name, label } of hardwareFragments) {
    renderAndWrite(name, label, `{${name}}`, "Hardware", name, []);
  }

  // ── Electrical symbols (rendered via {sym(id)} fragment) ────
  const unzipped = unzipSync(zipUint8);
  const symbolManifest = JSON.parse(
    new TextDecoder().decode(unzipped["manifest.json"]),
  ) as Array<{
    id: string;
    name: string;
    category: string;
    standard: string;
    filename: string;
  }>;

  console.log("\nElectrical symbols:");
  for (const item of symbolManifest) {
    const safeName = `sym-${item.id}`;
    const stdSuffix =
      item.standard === "COMMON" ? "" : ` (${item.standard})`;
    const label = `${item.name}${stdSuffix}`;
    const category =
      item.category.charAt(0) + item.category.slice(1).toLowerCase();

    renderAndWrite(
      safeName,
      label,
      `{sym(${item.id})}`,
      category,
      "sym",
      [item.id],
    );
  }

  // Write manifest
  writeFileSync(
    resolve(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
  console.log(`\nWrote manifest.json (${manifest.length} entries)`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
