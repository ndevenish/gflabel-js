/**
 * Descriptive filename generation for exported labels.
 *
 * Shared by the single-label download buttons and the batch export path so
 * every generated file is named consistently from its base type + spec.
 */

import type { BaseType } from "./bases/base.js";

/**
 * Build a descriptive filename from the label configuration.
 *
 * Format: {base}[-{width}u]-{spec}.{ext}
 * e.g.  "pred-3u-M5_nut.stl", "plain-Hello_World.step"
 */
export function makeLabelFilename(
  baseType: BaseType,
  width: number,
  spec: string,
  ext: string,
): string {
  // Bases that use a meaningful width parameter
  const hasWidth = baseType === "pred" || baseType === "predbox" || baseType === "modern";

  const stem = makeLabelStem(baseType, width, spec, hasWidth);
  return `${stem}.${ext}`;
}

/**
 * Build just the descriptive stem (no extension) from the label configuration.
 * Falls back to the base type alone when the spec sanitises to nothing.
 */
export function makeLabelStem(
  baseType: BaseType,
  width: number,
  spec: string,
  hasWidth: boolean = baseType === "pred" || baseType === "predbox" || baseType === "modern",
): string {
  // Sanitise spec: strip fragment braces but keep content, collapse whitespace
  const label = spec
    .replace(/\{[|]?\}/g, "_")        // column dividers → underscore
    .replace(/[{}]/g, "")              // drop remaining braces
    .replace(/[<>]/g, "")             // drop alignment markers
    .replace(/\.\.\./g, "")           // drop spacer ellipsis
    .replace(/[/\\:*?"<>|]+/g, "_")   // filesystem-unsafe chars
    .replace(/\s+/g, "_")             // whitespace → underscore
    .replace(/_+/g, "_")              // collapse multiple underscores
    .replace(/^_|_$/g, "");           // trim leading/trailing underscores

  const parts: string[] = [baseType];
  if (hasWidth) parts.push(`${width}u`);
  if (label) parts.push(label);

  return parts.join("-").slice(0, 80); // cap length
}
