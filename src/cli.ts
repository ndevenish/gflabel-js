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

  // Load fonts
  const { loadFont, loadFontNamed, setActiveFont } = await import("./cad/font.js");
  const assetsDir = resolve(fileURLToPath(import.meta.url), "../assets");

  function loadTtf(filename: string): ArrayBuffer {
    const buf = readFileSync(resolve(assetsDir, filename));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }

  await loadFont(loadTtf("OpenSans-Regular.ttf"));
  await loadFontNamed("jost", loadTtf("Jost-500-Medium.ttf"));
  await loadFontNamed("jost-semibold", loadTtf("Jost-600-Semi.ttf"));

  // Load symbols
  const { loadSymbols } = await import("./cad/fragments/symbols.js");
  const symbolsDir = resolve(
    fileURLToPath(import.meta.url),
    "../assets/fragments/symbols",
  );
  const symbolManifest = JSON.parse(
    readFileSync(resolve(symbolsDir, "manifest.json"), "utf-8"),
  );
  loadSymbols(symbolManifest, (id) =>
    readFileSync(resolve(symbolsDir, `${id}.svg`), "utf-8"),
  );

  // Load SVG-based hardware fragments
  const { loadSvgFragments } = await import("./cad/fragments/svgFragments.js");
  const fragmentsDir = resolve(
    fileURLToPath(import.meta.url),
    "../assets/fragments",
  );
  loadSvgFragments((name) =>
    readFileSync(resolve(fragmentsDir, `${name}.svg`), "utf-8"),
  );

  // Import fragment index to trigger registrations
  await import("./cad/fragments/index.js");

  // Import CAD modules
  const { LabelRenderer, renderDividedLabel } = await import("./cad/label.js");
  const { buildBase, extrudeLabel, getMaxLabelDepth } = await import("./cad/bases/index.js");
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
    .option("--base-depth <mm>", "Base depth in mm", "0.4")
    .option("--label-depth <mm>", "Label extrusion/cut depth in mm", "0.4")
    .option("--depth <mm>", "Deprecated: use --label-depth instead")
    .option("-d, --divisions <n>", "Divisions per label", "1")
    .option("--margin <mm>", "Margin in mm", "0.4")
    .option("--column-gap <mm>", "Column gap in mm", "0.4")
    .option("--font <name>", "Font (open-sans, jost, jost-semibold)", "jost-semibold")
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
  setActiveFont(opts.font);
  const width = parseFloat(opts.width);
  const height = opts.height ? parseFloat(opts.height) : undefined;
  const baseDepth = parseFloat(opts.baseDepth);
  const baseTypeEnum = baseType as import("./cad/bases/base.js").BaseType;

  // For backwards compatibility, --depth sets labelDepth if --label-depth not specified
  let labelDepth = opts.labelDepth ? parseFloat(opts.labelDepth) : (opts.depth ? parseFloat(opts.depth) : 0.4);

  // Clamp label depth to base-specific maximum
  const maxLabelDepth = getMaxLabelDepth(baseTypeEnum);
  if (labelDepth > maxLabelDepth) {
    console.warn(`Warning: Label depth ${labelDepth}mm exceeds maximum ${maxLabelDepth}mm for ${baseType} base. Clamping to ${maxLabelDepth}mm.`);
    labelDepth = maxLabelDepth;
  }

  const divisions = parseInt(opts.divisions, 10);

  const baseConfig = {
    baseType: baseTypeEnum,
    width,
    height,
    depth: baseDepth,
    labelDepth,
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
  const { solid } = extrudeLabel(baseResult, labelDrawing, style, labelDepth);

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
