/**
 * Label rendering engine — port of label.py.
 *
 * LabelRenderer takes a spec string and available area, and produces
 * a single Drawing representing the complete label content.
 */

import { Drawing, drawRectangle } from "replicad";
import type { RenderOptions } from "./options.js";
import {
  specToFragments,
  Fragment,
  SPLIT_RE,
  type FragmentRenderResult,
} from "./fragments/index.js";

/** Utility: split an iterable into chunks of n */
function batched<T>(arr: T[], n: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += n) {
    result.push(arr.slice(i, i + n));
  }
  return result;
}

export interface Vec2 {
  x: number;
  y: number;
}

export class LabelRenderer {
  constructor(public readonly opts: RenderOptions) {}

  /**
   * Render a complete label spec (potentially multi-column) within the given area.
   */
  render(spec: string, area: Vec2): Drawing {
    // Column splitting via SplitterFragment.SPLIT_RE
    const columns: string[] = [];
    const columnProportions: number[] = [];

    // Split on column dividers
    const splitParts = spec.split(SPLIT_RE);
    // splitParts alternates: text, leftProp, rightProp, text, leftProp, rightProp, ...
    // Each group is (text, left?, right?)
    const groupSize = 1 + (SPLIT_RE.source.match(/\(/g)?.length ?? 0);
    const groups = batched(splitParts, groupSize);

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi]!;
      let label = group[0] ?? "";
      const leftStr = group[1];
      const rightStr = group[2];

      // Handle alignment at start of label
      let alignment: string | null = null;
      if (label.startsWith("{<}")) {
        label = label.slice(3);
        alignment = "<";
      } else if (label.startsWith("{>}")) {
        label = label.slice(3);
        alignment = ">";
      }

      // Process divider proportions
      if (leftStr !== undefined || rightStr !== undefined) {
        const left = parseFloat(leftStr || "1");
        const right = parseFloat(rightStr || "1");
        if (columnProportions.length === 0) {
          columnProportions.push(left, right);
        } else {
          const prev = columnProportions[columnProportions.length - 1]!;
          columnProportions.push((right / left) * prev);
        }
      }

      // If alignment specified, add expanding fragments to every line
      if (alignment) {
        const parts = label.split("\n");
        if (label.endsWith("\n")) parts.push("");
        const newParts = parts.map((part) => {
          if (!part || part.includes("{...}") || part.includes("{measure}")) {
            return part;
          }
          return alignment === "<" ? `${part}{...}` : `{...}${part}`;
        });
        label = newParts.join("\n");
      }

      columns.push(label);
    }

    if (columnProportions.length === 0) {
      columnProportions.push(1);
    }

    // Calculate column widths
    const totalProportions = columnProportions.reduce((a, b) => a + b, 0);
    const columnGapsWidth = this.opts.columnGap * (columns.length - 1);
    const columnWidths = columnProportions.map(
      (p) => (p * (area.x - columnGapsWidth)) / totalProportions,
    );

    // Render each column and position it
    let result: Drawing | null = null;
    let x = -area.x / 2;

    for (let i = 0; i < columns.length; i++) {
      const colSpec = columns[i]!;
      const width = columnWidths[i]!;

      if (colSpec.trim()) {
        const colDrawing = this.doMultilineRender(colSpec, {
          x: width,
          y: area.y,
        });
        // Position: translate so column center is at (x + width/2, 0)
        const translated = colDrawing.translate([x + width / 2, 0]);
        result = result ? result.fuse(translated) : translated;
      }

      x += width + this.opts.columnGap;
    }

    return result ?? drawRectangle(0.001, 0.001);
  }

  /**
   * Multi-line rendering with automatic rescaling.
   */
  private doMultilineRender(
    spec: string,
    area: Vec2,
    isRescaling: boolean = false,
  ): Drawing {
    const lines = spec.split("\n");
    if (spec.endsWith("\n")) lines.push("");

    if (lines.length === 0) throw new Error("Asked to render empty label");

    const rowHeight =
      (area.y - this.opts.lineSpacingMm * (lines.length - 1)) / lines.length;

    // Render each line
    let result: Drawing | null = null;

    for (let n = 0; n < lines.length; n++) {
      const line = lines[n]!;
      if (!line) continue;

      const renderY =
        area.y / 2 -
        (rowHeight + this.opts.lineSpacingMm) * n -
        rowHeight / 2;

      const lineDrawing = this.renderSingleLine(line, {
        x: area.x,
        y: rowHeight,
      }, this.opts.allowOverheight);

      const translated = lineDrawing.translate([0, renderY]);
      result = result ? result.fuse(translated) : translated;
    }

    if (!result) return drawRectangle(0.001, 0.001);

    // Check if rescaling is needed
    const bb = result.boundingBox;
    const scaleToMaxWidth = area.x / bb.width;
    const scaleToMaxHeight = area.y / bb.height;
    const toScale = Math.min(scaleToMaxHeight, scaleToMaxWidth, 1);

    if (toScale < 0.99 && !isRescaling) {
      const heightToScale = Math.min(area.y, bb.height);
      return this.doMultilineRender(
        spec,
        { x: area.x, y: heightToScale * toScale * 0.95 },
        true,
      );
    }

    return result;
  }

  /**
   * Render a single line of fragments horizontally.
   */
  private renderSingleLine(
    line: string,
    area: Vec2,
    allowOverheight: boolean,
  ): Drawing {
    const frags = specToFragments(line);

    // Overheight handling
    let yAvailable = area.y;
    if (allowOverheight) {
      const maxOverheight = Math.max(
        ...frags.map((f) => f.overheight ?? 1),
      );
      if (maxOverheight > 1) {
        yAvailable /= maxOverheight;
      }
    }

    // Render fixed-width fragments first
    const rendered = new Map<Fragment, FragmentRenderResult>();
    for (const frag of frags) {
      if (frag.variableWidth) continue;
      const fragAvailY = yAvailable / (allowOverheight ? 1 : (frag.overheight ?? 1));
      rendered.set(frag, frag.render(fragAvailY, area.x, this.opts));
    }

    // Calculate remaining width for variable fragments
    let remainingArea =
      area.x -
      [...rendered.values()].reduce((sum, r) => sum + r.width, 0);
    let countVariable = frags.length - rendered.size;

    // Render variable-width fragments (highest priority first)
    const variableFrags = frags
      .filter((f) => f.variableWidth)
      .sort((a, b) => b.priority - a.priority);

    for (const frag of variableFrags) {
      const fragAvailY = yAvailable / (allowOverheight ? 1 : (frag.overheight ?? 1));
      const allocatedWidth = Math.max(
        remainingArea / countVariable,
        frag.minWidth(area.y),
      );
      const renderResult = frag.render(fragAvailY, allocatedWidth, this.opts);
      rendered.set(frag, renderResult);
      countVariable--;
      remainingArea -= renderResult.width;
    }

    // Calculate total width
    const totalWidth = [...rendered.values()].reduce(
      (sum, r) => sum + r.width,
      0,
    );

    // Assemble: position fragments left-to-right, centered at origin
    let result: Drawing | null = null;
    let x = -totalWidth / 2;

    for (const frag of frags) {
      const fragResult = rendered.get(frag);
      if (!fragResult) continue;
      const fragWidth = fragResult.width;

      if (frag.visible) {
        const translated = fragResult.drawing.translate([
          x + fragWidth / 2,
          0,
        ]);
        result = result ? result.fuse(translated) : translated;
      }
      x += fragWidth;
    }

    return result ?? drawRectangle(0.001, 0.001);
  }
}

/**
 * Render multiple labels fitted into a single area with divisions.
 */
export function renderDividedLabel(
  labels: string[],
  area: Vec2,
  divisions: number,
  options: RenderOptions,
): Drawing {
  const adjustedArea: Vec2 = {
    x: area.x - options.marginMm * 2,
    y: area.y - options.marginMm * 2,
  };
  const areaPerLabel: Vec2 = {
    x: adjustedArea.x / divisions,
    y: adjustedArea.y,
  };
  const leftmostX = -adjustedArea.x / 2 + areaPerLabel.x / 2;
  const renderer = new LabelRenderer(options);

  let result: Drawing | null = null;

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!;
    if (!label.trim()) continue;

    const labelDrawing = renderer.render(label, areaPerLabel);
    const translated = labelDrawing.translate([
      leftmostX + i * areaPerLabel.x,
      0,
    ]);
    result = result ? result.fuse(translated) : translated;
  }

  return result ?? drawRectangle(0.001, 0.001);
}
