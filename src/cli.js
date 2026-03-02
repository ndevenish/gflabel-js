#!/usr/bin/env node
"use strict";
/**
 * CLI entry point for gflabel-js — mirrors the Python gflabel CLI.
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var commander_1 = require("commander");
var fs_1 = require("fs");
var path_1 = require("path");
var url_1 = require("url");
function main() {
    return __awaiter(this, void 0, void 0, function () {
        function loadTtf(filename) {
            var buf = (0, fs_1.readFileSync)((0, path_1.resolve)(assetsDir, filename));
            return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        }
        var setOC, opencascadeModule, opencascade, wasmPath, OC, _a, loadFont, loadFontNamed, setActiveFont, assetsDir, loadSymbols, symbolsDir, symbolManifest, loadSvgFragments, fragmentsDir, _b, LabelRenderer, renderDividedLabel, _c, buildBase, extrudeLabel, getMaxLabelDepth, DEFAULT_RENDER_OPTIONS, program, opts, _d, baseType, labels, parseLabelStyle, style, width, height, baseDepth, baseTypeEnum, labelDepth, maxLabelDepth, divisions, baseConfig, renderOptions, baseResult, processedLabels, renderer, labelDrawing, adjustedArea, solid, outputPath, ext, drawingToFilledSVG, svgString, blob, buffer, _e, _f, blob, buffer, _g, _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("replicad"); })];
                case 1:
                    setOC = (_j.sent()).setOC;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("replicad-opencascadejs/src/replicad_single.js"); })];
                case 2:
                    opencascadeModule = _j.sent();
                    opencascade = opencascadeModule.default;
                    wasmPath = (0, path_1.resolve)((0, url_1.fileURLToPath)(import.meta.url), "../../node_modules/replicad-opencascadejs/src/replicad_single.wasm");
                    return [4 /*yield*/, opencascade({
                            locateFile: function () { return wasmPath; },
                        })];
                case 3:
                    OC = _j.sent();
                    setOC(OC);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./cad/font.js"); })];
                case 4:
                    _a = _j.sent(), loadFont = _a.loadFont, loadFontNamed = _a.loadFontNamed, setActiveFont = _a.setActiveFont;
                    assetsDir = (0, path_1.resolve)((0, url_1.fileURLToPath)(import.meta.url), "../assets");
                    return [4 /*yield*/, loadFont(loadTtf("OpenSans-Regular.ttf"))];
                case 5:
                    _j.sent();
                    return [4 /*yield*/, loadFontNamed("jost", loadTtf("Jost-500-Medium.ttf"))];
                case 6:
                    _j.sent();
                    return [4 /*yield*/, loadFontNamed("jost-semibold", loadTtf("Jost-600-Semi.ttf"))];
                case 7:
                    _j.sent();
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./cad/fragments/symbols.js"); })];
                case 8:
                    loadSymbols = (_j.sent()).loadSymbols;
                    symbolsDir = (0, path_1.resolve)((0, url_1.fileURLToPath)(import.meta.url), "../assets/fragments/symbols");
                    symbolManifest = JSON.parse((0, fs_1.readFileSync)((0, path_1.resolve)(symbolsDir, "manifest.json"), "utf-8"));
                    loadSymbols(symbolManifest, function (id) {
                        return (0, fs_1.readFileSync)((0, path_1.resolve)(symbolsDir, "".concat(id, ".svg")), "utf-8");
                    });
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./cad/fragments/svgFragments.js"); })];
                case 9:
                    loadSvgFragments = (_j.sent()).loadSvgFragments;
                    fragmentsDir = (0, path_1.resolve)((0, url_1.fileURLToPath)(import.meta.url), "../assets/fragments");
                    loadSvgFragments(function (name) {
                        return (0, fs_1.readFileSync)((0, path_1.resolve)(fragmentsDir, "".concat(name, ".svg")), "utf-8");
                    });
                    // Import fragment index to trigger registrations
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./cad/fragments/index.js"); })];
                case 10:
                    // Import fragment index to trigger registrations
                    _j.sent();
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./cad/label.js"); })];
                case 11:
                    _b = _j.sent(), LabelRenderer = _b.LabelRenderer, renderDividedLabel = _b.renderDividedLabel;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./cad/bases/index.js"); })];
                case 12:
                    _c = _j.sent(), buildBase = _c.buildBase, extrudeLabel = _c.extrudeLabel, getMaxLabelDepth = _c.getMaxLabelDepth;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./cad/options.js"); })];
                case 13:
                    DEFAULT_RENDER_OPTIONS = (_j.sent()).DEFAULT_RENDER_OPTIONS;
                    program = new commander_1.Command();
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
                    opts = program.opts();
                    _d = program.args, baseType = _d[0], labels = _d.slice(1);
                    if (!baseType || labels.length === 0) {
                        program.help();
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./cad/options.js"); })];
                case 14:
                    parseLabelStyle = (_j.sent()).parseLabelStyle;
                    style = parseLabelStyle(opts.style);
                    setActiveFont(opts.font);
                    width = parseFloat(opts.width);
                    height = opts.height ? parseFloat(opts.height) : undefined;
                    baseDepth = parseFloat(opts.baseDepth);
                    baseTypeEnum = baseType;
                    labelDepth = opts.labelDepth ? parseFloat(opts.labelDepth) : (opts.depth ? parseFloat(opts.depth) : 0.4);
                    maxLabelDepth = getMaxLabelDepth(baseTypeEnum);
                    if (labelDepth > maxLabelDepth) {
                        console.warn("Warning: Label depth ".concat(labelDepth, "mm exceeds maximum ").concat(maxLabelDepth, "mm for ").concat(baseType, " base. Clamping to ").concat(maxLabelDepth, "mm."));
                        labelDepth = maxLabelDepth;
                    }
                    divisions = parseInt(opts.divisions, 10);
                    baseConfig = {
                        baseType: baseTypeEnum,
                        width: width,
                        height: height,
                        depth: baseDepth,
                        labelDepth: labelDepth,
                        style: style,
                    };
                    renderOptions = __assign(__assign({}, DEFAULT_RENDER_OPTIONS), { marginMm: parseFloat(opts.margin), columnGap: parseFloat(opts.columnGap) });
                    baseResult = buildBase(baseConfig);
                    processedLabels = labels.map(function (l) { return l.replace(/\\n/g, "\n"); });
                    renderer = new LabelRenderer(renderOptions);
                    if (processedLabels.length > 1 || divisions > 1) {
                        labelDrawing = renderDividedLabel(processedLabels, baseResult.area, divisions, renderOptions);
                    }
                    else {
                        adjustedArea = {
                            x: baseResult.area.x - renderOptions.marginMm * 2,
                            y: baseResult.area.y - renderOptions.marginMm * 2,
                        };
                        labelDrawing = renderer.render(processedLabels[0], adjustedArea);
                    }
                    solid = extrudeLabel(baseResult, labelDrawing, style, labelDepth).solid;
                    outputPath = (0, path_1.resolve)(opts.output);
                    ext = (0, path_1.extname)(outputPath).toLowerCase();
                    if (!(ext === ".svg")) return [3 /*break*/, 16];
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./cad/font.js"); })];
                case 15:
                    drawingToFilledSVG = (_j.sent()).drawingToFilledSVG;
                    svgString = drawingToFilledSVG(labelDrawing);
                    (0, fs_1.writeFileSync)(outputPath, svgString, "utf-8");
                    return [3 /*break*/, 21];
                case 16:
                    if (!(ext === ".stl")) return [3 /*break*/, 18];
                    blob = solid.blobSTL();
                    _f = (_e = Buffer).from;
                    return [4 /*yield*/, blob.arrayBuffer()];
                case 17:
                    buffer = _f.apply(_e, [_j.sent()]);
                    (0, fs_1.writeFileSync)(outputPath, buffer);
                    return [3 /*break*/, 21];
                case 18:
                    if (!(ext === ".step" || ext === ".stp")) return [3 /*break*/, 20];
                    blob = solid.blobSTEP();
                    _h = (_g = Buffer).from;
                    return [4 /*yield*/, blob.arrayBuffer()];
                case 19:
                    buffer = _h.apply(_g, [_j.sent()]);
                    (0, fs_1.writeFileSync)(outputPath, buffer);
                    return [3 /*break*/, 21];
                case 20:
                    console.error("Unsupported output format: ".concat(ext));
                    process.exit(1);
                    _j.label = 21;
                case 21:
                    console.log("Wrote ".concat(outputPath));
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(function (err) {
    console.error(err);
    process.exit(1);
});
