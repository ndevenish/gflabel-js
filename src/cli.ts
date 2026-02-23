#!/usr/bin/env node

/**
 * CLI entry point for gflabel-js — mirrors the Python gflabel CLI.
 */

import { Command } from "commander";
import { readFileSync, writeFileSync } from "fs";
import { resolve, extname } from "path";
import { fileURLToPath } from "url";

async function main() {
  // Dynamic imports for replicad (needs WASM init first)
  const { setOC } = await import("replicad");

  // Load OpenCascade
  const opencascadeModule = await import(
    "replicad-opencascadejs/src/replicad_single.js"
  );
  const opencascade = opencascadeModule.default;

  // Locate WASM file
  const wasmPath = resolve(
    fileURLToPath(import.meta.url),
    "../../node_modules/replicad-opencascadejs/src/replicad_single.wasm",
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const OC = await opencascade({
    locateFile: () => wasmPath,
  }) as any;
  setOC(OC);

  // Load font
  const { loadFont } = await import("./cad/font.js");
  const fontPath = resolve(
    fileURLToPath(import.meta.url),
    "../assets/OpenSans-Regular.ttf",
  );
  const fontData = readFileSync(fontPath);
  await loadFont(
    fontData.buffer.slice(
      fontData.byteOffset,
      fontData.byteOffset + fontData.byteLength,
    ),
  );

  // Load symbol ZIP
  const { loadSymbolsZip } = await import("./cad/fragments/symbols.js");
  const zipPath = resolve(
    fileURLToPath(import.meta.url),
    "../assets/chris-pikul-symbols.zip",
  );
  const zipData = readFileSync(zipPath);
  loadSymbolsZip(
    new Uint8Array(
      zipData.buffer.slice(
        zipData.byteOffset,
        zipData.byteOffset + zipData.byteLength,
      ),
    ),
  );

  // Import fragment index to trigger registrations
  await import("./cad/fragments/index.js");

  // Import CAD modules
  const { LabelRenderer, renderDividedLabel } = await import("./cad/label.js");
  const { buildBase, extrudeLabel } = await import("./cad/bases/index.js");
  const { DEFAULT_RENDER_OPTIONS } = await import("./cad/options.js");

  const program = new Command();
  program
    .name("gflabel-js")
    .description("Generate 3D-printable Gridfinity labels")
    .argument("<base>", "Label base type (pred, plain, none, predbox, tailorbox, cullenect, modern)")
    .argument("<labels...>", "Label specifications")
    .option("-o, --output <file>", "Output file", "label.step")
    .option("-w, --width <n>", "Width (units for pred, mm for plain)", "1")
    .option("--height <mm>", "Height in mm")
    .option("--style <style>", "Label style (embossed, debossed, embedded)", "embossed")
    .option("--depth <mm>", "Extrusion depth in mm", "0.4")
    .option("-d, --divisions <n>", "Divisions per label", "1")
    .option("--margin <mm>", "Margin in mm", "0.4")
    .option("--column-gap <mm>", "Column gap in mm", "0.4")
    .parse(process.argv);

  const opts = program.opts();
  const [baseType, ...labels] = program.args;

  if (!baseType || labels.length === 0) {
    program.help();
    return;
  }

  // Parse options
  const { parseLabelStyle } = await import("./cad/options.js");
  const style = parseLabelStyle(opts.style);
  const width = parseFloat(opts.width);
  const height = opts.height ? parseFloat(opts.height) : undefined;
  const depth = parseFloat(opts.depth);
  const divisions = parseInt(opts.divisions, 10);

  const baseConfig = {
    baseType: baseType as import("./cad/bases/base.js").BaseType,
    width,
    height,
    depth,
    style,
  };

  const renderOptions = {
    ...DEFAULT_RENDER_OPTIONS,
    marginMm: parseFloat(opts.margin),
    columnGap: parseFloat(opts.columnGap),
  };

  // Build base
  const baseResult = buildBase(baseConfig);

  // Process labels (replace \\n with actual newlines)
  const processedLabels = labels.map((l: string) => l.replace(/\\n/g, "\n"));

  // Render
  const renderer = new LabelRenderer(renderOptions);
  let labelDrawing;
  if (processedLabels.length > 1 || divisions > 1) {
    labelDrawing = renderDividedLabel(
      processedLabels,
      baseResult.area,
      divisions,
      renderOptions,
    );
  } else {
    const adjustedArea = {
      x: baseResult.area.x - renderOptions.marginMm * 2,
      y: baseResult.area.y - renderOptions.marginMm * 2,
    };
    labelDrawing = renderer.render(processedLabels[0]!, adjustedArea);
  }

  // Extrude and combine
  const { solid } = extrudeLabel(baseResult, labelDrawing, style, depth);

  // Export
  const outputPath = resolve(opts.output);
  const ext = extname(outputPath).toLowerCase();

  if (ext === ".svg") {
    // SVG exports the 2D label drawing directly
    const { drawingToFilledSVG } = await import("./cad/font.js");
    const svgString = drawingToFilledSVG(labelDrawing);
    writeFileSync(outputPath, svgString, "utf-8");
  } else if (ext === ".stl") {
    const blob = solid.blobSTL();
    const buffer = Buffer.from(await blob.arrayBuffer());
    writeFileSync(outputPath, buffer);
  } else if (ext === ".step" || ext === ".stp") {
    const blob = solid.blobSTEP();
    const buffer = Buffer.from(await blob.arrayBuffer());
    writeFileSync(outputPath, buffer);
  } else {
    console.error(`Unsupported output format: ${ext}`);
    process.exit(1);
  }

  console.log(`Wrote ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
