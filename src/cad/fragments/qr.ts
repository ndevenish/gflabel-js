/**
 * QR code and Micro QR code fragments.
 *
 * {qr(data)}         — standard QR code
 * {qr(data,H)}       — with error correction level L/M/Q/H (default M)
 * {microqr(data)}    — not supported; throws a helpful error
 *
 * Uses qrcode-generator (658K weekly downloads, 0-dep, own TypeScript types)
 * for QR generation. The SVG output from qrcode-generator is passed through
 * svgToDrawing() which handles Y-flip and polygon-clipping union in one pass.
 *
 * No pure-JS Micro QR library exists, so microqr/mqr throw a clear error.
 */

import qrcode from "qrcode-generator";
import type { RenderOptions } from "../options.js";
import { Fragment, registerFragment } from "./base.js";
import type { FragmentRenderResult } from "./base.js";
import { svgToDrawing } from "../svg.js";

// ── QR Code Fragment ───────────────────────────────────────────

registerFragment(["qr", "qrcode"], (data: string, error?: string) => {
  const level = ((error ?? "M").toUpperCase()) as "L" | "M" | "Q" | "H";
  if (!["L", "M", "Q", "H"].includes(level)) {
    throw new Error(
      `Invalid error correction level '${error}'. Must be one of: L, M, Q, H`,
    );
  }

  // Generate QR code up front (typeNumber 0 = auto-select version).
  // margin:0 so the viewBox exactly covers the module grid.
  const qr = qrcode(0, level);
  qr.addData(data);
  qr.make();
  const moduleCount = qr.getModuleCount();

  // Build Drawing from the generated SVG path via svgToDrawing.
  // Uses cellSize=1 so coordinates are in module units (0..moduleCount).
  // svgToDrawing ignores the white <rect> background and Y-flips the path.
  const svgStr = qr.createSvgTag({ cellSize: 1, margin: 0, scalable: true });
  const baseDrawing = svgToDrawing(svgStr);

  return new (class extends Fragment {
    render(height: number, _maxWidth: number, _opts: RenderOptions): FragmentRenderResult {
      // Center and scale to fit height.
      // After Y-flip, the QR spans X:[0,N] Y:[-N,0]; center is at (N/2,-N/2).
      const bb = baseDrawing.boundingBox;
      let drawing = baseDrawing.translate([-bb.center[0], -bb.center[1]]);
      drawing = drawing.scale(height / moduleCount);
      return { drawing, width: height };
    }
  })();
});

// ── Micro QR Fragment ──────────────────────────────────────────
// No pure-JS Micro QR library exists. Throw a clear error at parse time.

registerFragment(["microqr", "mqr"], (_data: string, _error?: string) => {
  throw new Error(
    "Micro QR codes are not supported in the JS port — no pure-JS Micro QR library exists. " +
      "Use {qr(...)} for standard QR codes instead.",
  );
});
