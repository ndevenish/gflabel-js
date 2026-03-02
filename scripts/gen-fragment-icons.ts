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
  /** Optional tooltip shown in the palette UI */
  tooltip?: string;
}

const dataNameRe = /data-name="([^"]+)"/;
const dataLabelRe = /data-label="([^"]+)"/;
const dataSpecRe = /data-spec="([^"]+)"/;
const dataCategoryRe = /data-category="([^"]+)"/;
const dataTooltipRe = /data-tooltip="([^"]+)"/;

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
    tooltip?: string,
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
      const meta: Record<string, string> = { name, label, spec, category };
      if (tooltip) meta.tooltip = tooltip;
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

  // ── QR code fragments ──────────────────────────────────────
  // Use bwip-js SVG output directly as the icon (bypassing the CAD pipeline)
  // because the many-polygon union overflows the call stack for standard QR.
  console.log("QR fragments:");
  {
    const bwipjs = (await import("bwip-js/generic")).default;
    const qrFragments: Array<{
      name: string; label: string; spec: string; bcid: string; sampleData: string; tooltip: string;
    }> = [
      {
        name: "qr",
        label: "QR Code",
        spec: "{qr(text)}",
        bcid: "qrcode",
        sampleData: "QR",
        tooltip: "QR Code: {qr(data)} or {qr(data,level)} — EC levels: L (7%), M (15%, default), Q (25%), H (30%)",
      },
      {
        name: "microqr",
        label: "Micro QR",
        spec: "{microqr(text)}",
        bcid: "microqrcode",
        sampleData: "MR",
        tooltip: "Micro QR: {microqr(data)} or {microqr(data,level)} — EC levels: L (7%, default), M (15%), Q (25%)",
      },
    ];
    for (const frag of qrFragments) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawSvg: string = bwipjs.toSVG({ bcid: frag.bcid as any, text: frag.sampleData, scale: 1, paddingwidth: 0, paddingheight: 0 } as any);
        // Inject data-* attributes into the <svg> opening tag
        const dataAttrs = [
          `data-name="${frag.name}"`,
          `data-label="${frag.label}"`,
          `data-spec="${frag.spec}"`,
          `data-category="Misc"`,
          `data-tooltip="${frag.tooltip}"`,
        ].join(" ");
        const iconSvg = rawSvg.replace(/^<svg /, `<svg ${dataAttrs} `);
        writeFileSync(resolve(OUT_DIR, `${frag.name}.svg`), iconSvg, "utf-8");
        console.log(`  ${frag.name}.svg`);
      } catch (err) {
        console.error(`  FAILED ${frag.name}: ${err}`);
      }
    }
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
      const tooltipMatch = dataTooltipRe.exec(content);
      const entry: ManifestEntry = {
        name: nameMatch[1]!,
        label: labelMatch[1]!,
        spec: specMatch[1]!,
        category: categoryMatch[1]!,
      };
      if (tooltipMatch) entry.tooltip = tooltipMatch[1]!;
      manifest.push(entry);
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
