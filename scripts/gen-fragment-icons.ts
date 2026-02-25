#!/usr/bin/env npx tsx
/**
 * Generate the fragment palette manifest from source SVG files.
 *
 * Hardware and screw-head SVGs embed their metadata as data-* attributes
 * on the <svg> root element. Symbol SVGs use a separate manifest.json.
 *
 * Usage:  npx tsx scripts/gen-fragment-icons.ts
 *
 * Outputs:
 *   src/assets/fragments/manifest.json — metadata for the palette UI
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

function main() {
  const manifest: ManifestEntry[] = [];

  // ── Scan SVGs with embedded data-* metadata ────────────────
  // (hardware fragments + screw heads)
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

  // ── Electrical symbols ─────────────────────────────────────
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

main();
