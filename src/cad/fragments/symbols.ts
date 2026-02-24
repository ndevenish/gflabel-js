/**
 * Electronic symbol fragments: {symbol(...)} / {sym(...)}.
 *
 * Loads symbols from a bundled ZIP of SVGs (chris-pikul-symbols.zip).
 * Port of the symbol matching and rendering from Python gflabel.
 */

import { type Drawing } from "replicad";
import type { RenderOptions } from "../options.js";
import { Fragment, registerFragment } from "./base.js";
import type { FragmentRenderResult } from "./base.js";
import { svgToDrawing, type DrawingWithExtras } from "../svg.js";
import { unzipSync } from "fflate";

// ── Types ──────────────────────────────────────────────────────

interface ManifestItem {
  id: string;
  name: string;
  category: string;
  standard: string;
  filename: string;
}

// ── Module state ───────────────────────────────────────────────

let _zipData: Uint8Array | null = null;
let _manifest: ManifestItem[] | null = null;
let _unzipped: Record<string, Uint8Array> | null = null;

/**
 * Initialize the symbol system with ZIP file data.
 * Called from worker.ts or cli.ts during init.
 */
export function loadSymbolsZip(data: Uint8Array): void {
  _zipData = data;
  _unzipped = null;
  _manifest = null;
}

function getUnzipped(): Record<string, Uint8Array> {
  if (!_unzipped) {
    if (!_zipData) throw new Error("Symbol ZIP not loaded — call loadSymbolsZip() first");
    _unzipped = unzipSync(_zipData);
  }
  return _unzipped;
}

function getManifest(): ManifestItem[] {
  if (!_manifest) {
    const unzipped = getUnzipped();
    const manifestBytes = unzipped["manifest.json"];
    if (!manifestBytes) throw new Error("manifest.json not found in symbol ZIP");
    const text = new TextDecoder().decode(manifestBytes);
    _manifest = JSON.parse(text) as ManifestItem[];
  }
  return _manifest;
}

function loadSvgFromZip(filename: string): string {
  const unzipped = getUnzipped();
  const key = `SVG/${filename}.svg`;
  const data = unzipped[key];
  if (!data) throw new Error(`Symbol SVG not found in ZIP: ${key}`);
  return new TextDecoder().decode(data);
}

// ── Standard aliases and matching ──────────────────────────────

const STANDARD_ALIASES: Record<string, string> = {
  com: "common",
  ansi: "ieee",
  euro: "iec",
  europe: "iec",
};

const KNOWN_STANDARDS = new Set(["iec", "ieee", "common"]);
const DEFAULT_STANDARD_ORDER = ["common", "iec", "ieee"];

function getStandardRequested(
  tokens: Set<string>,
): { standard: string | null; remaining: Set<string> } {
  const remaining = new Set(tokens);
  let standard: string | null = null;

  for (const tok of tokens) {
    const resolved = STANDARD_ALIASES[tok] ?? tok;
    if (KNOWN_STANDARDS.has(resolved)) {
      standard = resolved;
      remaining.delete(tok);
      break;
    }
  }

  return { standard, remaining };
}

function cleanName(name: string): string {
  return name
    .replace(/ \(IEEE\/ANSI\)$/i, "")
    .replace(/ \(Common Style\)$/i, "")
    .toLowerCase();
}

function matchSymbol(selectors: string[]): ManifestItem {
  const manifest = getManifest();

  // Pre-process selectors
  const processed = selectors.map((s) =>
    s
      .toLowerCase()
      .replace(/\.svg$/i, "")
      .replace(/\.png$/i, "")
      .replace(/\.jpg$/i, ""),
  );

  const allTokens = new Set(processed);
  const { standard: requestedStandard, remaining: contentTokens } =
    getStandardRequested(allTokens);

  // Build standard preference order
  const standardsOrder = [...DEFAULT_STANDARD_ORDER];
  if (requestedStandard) {
    const idx = standardsOrder.indexOf(requestedStandard);
    if (idx > 0) {
      standardsOrder.splice(idx, 1);
      standardsOrder.unshift(requestedStandard);
    }
  }

  // Phase 1: Exact match on id/name/filename
  const exactMatches: ManifestItem[] = [];
  for (const item of manifest) {
    const names = new Set([
      item.id.toLowerCase(),
      item.name.toLowerCase(),
      item.filename.toLowerCase(),
      cleanName(item.name),
    ]);

    for (const tok of contentTokens) {
      if (names.has(tok)) {
        exactMatches.push(item);
        break;
      }
    }
  }

  // Filter by standard if requested
  let filtered = exactMatches;
  if (requestedStandard && filtered.length > 1) {
    const stdFiltered = filtered.filter(
      (x) => x.standard.toLowerCase() === requestedStandard,
    );
    if (stdFiltered.length > 0) filtered = stdFiltered;
  }

  if (filtered.length === 1) return filtered[0]!;

  // Phase 2: Fuzzy token match (only if no exact matches)
  if (exactMatches.length === 0) {
    // Build match tokens from all content selectors
    const matchTokens = new Set<string>();
    for (const tok of contentTokens) {
      for (const word of tok.split(/\s+/)) {
        if (word) matchTokens.add(word);
      }
    }

    if (matchTokens.size > 0) {
      const fuzzyMatches: ManifestItem[] = [];

      for (const item of manifest) {
        // Build word soup from category, name, id
        const soup = new Set<string>();
        for (const field of [item.category, item.name, item.id]) {
          for (const word of field.toLowerCase().split(/[\s-]+/)) {
            if (word) soup.add(word);
          }
        }
        // Special: if "logic" is in soup, also add "gate"
        if (soup.has("logic")) soup.add("gate");

        // Check if all match tokens are substrings of at least one soup word
        let allMatch = true;
        for (const cand of matchTokens) {
          let found = false;
          for (const s of soup) {
            if (s.includes(cand)) {
              found = true;
              break;
            }
          }
          if (!found) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) fuzzyMatches.push(item);
      }

      filtered = fuzzyMatches;
    }
  }

  if (filtered.length === 0) {
    throw new Error(
      `No matching symbol found for: ${selectors.join(", ")}`,
    );
  }

  // Phase 3: Disambiguate by standard preference
  // Check if all matches are in the same category
  const categories = new Set(filtered.map((x) => x.category));
  if (categories.size === 1) {
    for (const std of standardsOrder) {
      const stdMatches = filtered.filter(
        (x) => x.standard.toLowerCase() === std,
      );
      if (stdMatches.length > 0) {
        if (stdMatches.length === 1) return stdMatches[0]!;
        filtered = stdMatches;
        break;
      }
    }
  }

  if (filtered.length === 1) return filtered[0]!;

  // Return first match if we still have multiple
  if (filtered.length > 0) return filtered[0]!;

  throw new Error(
    `No matching symbol found for: ${selectors.join(", ")}`,
  );
}

// ── Fragment registration ──────────────────────────────────────

registerFragment(["symbol", "sym"], (...selectors: string[]) => {
  // Match and load the symbol eagerly so errors surface at parse time
  if (!_zipData) {
    throw new Error("Symbol ZIP not loaded — call loadSymbolsZip() first");
  }

  const item = matchSymbol(selectors);
  const svgData = loadSvgFromZip(item.filename);
  const symbolDrawing = svgToDrawing(svgData);

  return new (class extends Fragment {
    render(
      height: number,
      _maxWidth: number,
      _opts: RenderOptions,
    ): FragmentRenderResult {
      // Center and scale to fit height
      let drawing: Drawing = symbolDrawing;
      const bb = drawing.boundingBox;
      const tx = -bb.center[0];
      const ty = -bb.center[1];
      const s = height / bb.height;
      drawing = drawing.translate([tx, ty]).scale(s);

      // Propagate transforms to any extra drawings that couldn't be
      // fused (OpenCascade boolean failures on near-tangent paths).
      const srcExtras = (symbolDrawing as DrawingWithExtras)
        .__extraDrawings;
      if (srcExtras) {
        (drawing as DrawingWithExtras).__extraDrawings = srcExtras.map(
          (d) => d.translate([tx, ty]).scale(s),
        );
      }

      return {
        drawing,
        width: drawing.boundingBox.width,
      };
    }
  })();
});
