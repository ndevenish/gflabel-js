/**
 * QR code and Micro QR code fragments.
 *
 * {qr(data)}           — standard QR code, error correction M
 * {qr(data,H)}         — error correction level L/M/Q/H
 * {microqr(data)}      — Micro QR code, error correction L
 * {microqr(data,M)}    — error correction level L/M/Q
 * {mqr(data)}          — alias for microqr
 *
 * Uses bwip-js (zero-dep, supports both QR and Micro QR). toSVG() produces
 * pre-merged rectangle paths which svgToDrawing() unions in one pass.
 */

// Use the generic (no-canvas) bundle — works in Web Workers and Node alike.
import bwipjs from "bwip-js/generic";
import type { RenderOptions } from "../options.js";
import { Fragment, registerFragment } from "./base.js";
import type { FragmentRenderResult } from "./base.js";
import { svgToDrawing } from "../svg.js";

function makeQrFragment(
  bcid: "qrcode" | "microqrcode",
  data: string,
  eclevel: string,
  validLevels: string[],
  defaultLevel: string,
) {
  const level = (eclevel ?? defaultLevel).toUpperCase();
  if (!validLevels.includes(level)) {
    throw new Error(
      `Invalid error correction level '${eclevel}'. Must be one of: ${validLevels.join(", ")}`,
    );
  }

  // Generate the SVG up front — bwip-js throws here if data won't fit.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svgStr = bwipjs.toSVG({ bcid, text: data, scale: 1, paddingwidth: 0, paddingheight: 0, eclevel: level } as any);
  const baseDrawing = svgToDrawing(svgStr);
  const { center, height: bbHeight } = baseDrawing.boundingBox;
  // Pre-center once; render() only needs to scale.
  const centeredDrawing = baseDrawing.translate([-center[0], -center[1]]);

  return new (class extends Fragment {
    render(height: number, _maxWidth: number, _opts: RenderOptions): FragmentRenderResult {
      return { drawing: centeredDrawing.scale(height / bbHeight), width: height };
    }
  })();
}

// ── QR Code ────────────────────────────────────────────────────

registerFragment(["qr", "qrcode"], (data: string, error?: string) =>
  makeQrFragment("qrcode", data, error ?? "M", ["L", "M", "Q", "H"], "M"),
);

// ── Micro QR Code ──────────────────────────────────────────────

registerFragment(["microqr", "mqr"], (data: string, error?: string) =>
  makeQrFragment("microqrcode", data, error ?? "L", ["L", "M", "Q"], "L"),
);
