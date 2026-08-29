import React from "react";
import { BaseSelector } from "./BaseSelector.js";
import { BaseSizeControls, defaultWidth } from "./BaseSizeControls.js";
import { LabelSpecInput } from "./LabelSpecInput.js";
import { FragmentPalette } from "./FragmentPalette.js";
import { DownloadButtons } from "./DownloadButtons.js";
import { BatchPanel } from "./BatchPanel.js";
import { renderLabel, renderSVG, ensureReady } from "../cad/workerClient.js";
import type { MeshData } from "../cad/workerClient.js";
import { LabelStyle, FontStyle } from "../cad/options.js";
import type { BaseConfig, BaseType } from "../cad/bases/base.js";
import { DEFAULT_DEPTHS, hasAdjustableDepth, getMaxLabelDepth } from "../cad/bases/index.js";
import { CULLENECT_VERSIONS } from "../cad/bases/cullenect.js";
import { getCurrentTheme, setTheme, type Theme } from "../theme.js";
import type { PreviewColors } from "../color.js";
import type { PreviewMode } from "../App.js";

const STORAGE_KEY = "gflabel-settings";

interface Settings {
  baseType: BaseType;
  width: number;
  height?: number;
  version?: string;
  style: LabelStyle;
  font: string;
  spec: string;
  autoRender: boolean;
  previewMode: PreviewMode;
  depth: number;
  labelDepth: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

const DEFAULTS: Settings = {
  baseType: "pred",
  width: 1,
  height: undefined,
  version: undefined,
  style: LabelStyle.EMBOSSED,
  font: "jost-semibold",
  spec: "{head(hex)} {bolt(12)}\nM3 x 12",
  autoRender: true,
  previewMode: "3d",
  depth: DEFAULT_DEPTHS.pred ?? 0.4,
  labelDepth: 0.4,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // Corrupt or unavailable — fall through to defaults
  }
  return { ...DEFAULTS };
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // localStorage full or unavailable
  }
}

interface Props {
  lockedBaseType?: BaseType;
  onNavigateHome: () => void;
  onMeshUpdate: (mesh: MeshData) => void;
  onSvgUpdate: (svg: string) => void;
  previewMode: PreviewMode;
  onPreviewModeChange: (mode: PreviewMode) => void;
  previewColors: PreviewColors;
  onPreviewColorsChange: (colors: PreviewColors) => void;
  onRenderStart: () => void;
  onRenderEnd: () => void;
  onError: (error: string) => void;
}

export function ControlPanel({
  lockedBaseType,
  onNavigateHome,
  onMeshUpdate,
  onSvgUpdate,
  previewMode,
  onPreviewModeChange,
  previewColors,
  onPreviewColorsChange,
  onRenderStart,
  onRenderEnd,
  onError,
}: Props) {
  const [saved] = React.useState(loadSettings);
  const [baseType, setBaseType] = React.useState<BaseType>(lockedBaseType ?? saved.baseType);
  const [width, setWidth] = React.useState(saved.width);
  const [height, setHeight] = React.useState<number | undefined>(saved.height);
  const [spec, setSpec] = React.useState(saved.spec);
  const [version, setVersion] = React.useState<string | undefined>(saved.version);
  const [style, setStyle] = React.useState<LabelStyle>(saved.style);
  const [font, setFont] = React.useState<string>(saved.font);
  const [workerReady, setWorkerReady] = React.useState(false);
  const [autoRender, setAutoRender] = React.useState(saved.autoRender);
  const [depth, setDepth] = React.useState(saved.depth);
  const [labelDepth, setLabelDepth] = React.useState(saved.labelDepth);
  const [scaleX, setScaleX] = React.useState(saved.scaleX);
  const [scaleY, setScaleY] = React.useState(saved.scaleY);
  const [scaleZ, setScaleZ] = React.useState(saved.scaleZ);

  // Sync baseType when route-locked type changes
  React.useEffect(() => {
    if (lockedBaseType !== undefined) {
      setBaseType(lockedBaseType);
      setWidth(defaultWidth(lockedBaseType));
      setHeight(undefined);
      setVersion(undefined);
      setDepth(DEFAULT_DEPTHS[lockedBaseType] ?? 0.4);
    }
  }, [lockedBaseType]);

  // Sync saved previewMode to parent on mount
  React.useEffect(() => {
    if (saved.previewMode !== previewMode) {
      onPreviewModeChange(saved.previewMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist settings on change
  React.useEffect(() => {
    saveSettings({ baseType, width, height, version, style, font, spec, autoRender, previewMode, depth, labelDepth, scaleX, scaleY, scaleZ });
  }, [baseType, width, height, version, style, font, spec, autoRender, previewMode, depth, labelDepth, scaleX, scaleY, scaleZ]);

  const resetSettings = () => {
    const resetBase = lockedBaseType ?? DEFAULTS.baseType;
    setBaseType(resetBase);
    setWidth(defaultWidth(resetBase));
    setHeight(DEFAULTS.height);
    setVersion(DEFAULTS.version);
    setStyle(DEFAULTS.style);
    setFont(DEFAULTS.font);
    setSpec(DEFAULTS.spec);
    setAutoRender(DEFAULTS.autoRender);
    setDepth(DEFAULT_DEPTHS[resetBase] ?? 0.4);
    setLabelDepth(DEFAULTS.labelDepth);
    setScaleX(DEFAULTS.scaleX);
    setScaleY(DEFAULTS.scaleY);
    setScaleZ(DEFAULTS.scaleZ);
    onPreviewModeChange(DEFAULTS.previewMode);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Initialize worker
  React.useEffect(() => {
    ensureReady().then(() => setWorkerReady(true));
  }, []);

  const insertAtCursorRef = React.useRef<((text: string) => void) | null>(null);

  const doRender = React.useCallback(async () => {
    if (!workerReady || !spec.trim()) return;

    onRenderStart();
    try {
      const baseConfig: BaseConfig = {
        baseType,
        width,
        height,
        depth,
        labelDepth,
        version,
      };
      const fontOptions = { font: { font, fontStyle: FontStyle.REGULAR, fontHeightExact: true } };
      const scale: [number, number, number] = [scaleX, scaleY, scaleZ];
      if (previewMode === "svg") {
        const result = await renderSVG({
          spec,
          base: baseConfig,
          style,
          options: fontOptions,
        });
        onSvgUpdate(result.svg);
      } else {
        const mesh = await renderLabel({
          spec,
          base: baseConfig,
          style,
          options: fontOptions,
          scale,
        });
        onMeshUpdate(mesh);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      onRenderEnd();
    }
  }, [
    workerReady,
    spec,
    baseType,
    width,
    height,
    version,
    style,
    font,
    depth,
    labelDepth,
    scaleX,
    scaleY,
    scaleZ,
    previewMode,
    onMeshUpdate,
    onSvgUpdate,
    onRenderStart,
    onRenderEnd,
    onError,
  ]);

  // Ensure the worker has a 3D solid (needed before export).
  const ensureRendered3D = React.useCallback(async () => {
    if (!workerReady || !spec.trim()) return;
    const baseConfig: BaseConfig = { baseType, width, height, depth, labelDepth, version };
    await renderLabel({ spec, base: baseConfig, style, options: { font: { font, fontStyle: FontStyle.REGULAR, fontHeightExact: true } }, scale: [scaleX, scaleY, scaleZ] });
  }, [workerReady, spec, baseType, width, height, depth, labelDepth, version, style, font, scaleX, scaleY, scaleZ]);

  // Keep a stable ref to doRender so the debounce effect doesn't re-trigger
  // when callback identity changes.
  const doRenderRef = React.useRef(doRender);
  React.useEffect(() => { doRenderRef.current = doRender; }, [doRender]);

  // Auto-render: wait for a pause in edits before generating, but switch preview
  // mode immediately. Each edit resets the timer (cleanup clears the previous
  // one), so generation only fires ~2s after the last change.
  const AUTO_RENDER_DELAY_MS = 2000;
  const prevModeRef = React.useRef(previewMode);
  React.useEffect(() => {
    const modeChanged = prevModeRef.current !== previewMode;
    prevModeRef.current = previewMode;

    if (!workerReady || !spec.trim()) return;
    if (!autoRender && !modeChanged) return;

    const delay = modeChanged ? 0 : AUTO_RENDER_DELAY_MS;
    const timer = setTimeout(() => {
      doRenderRef.current();
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, baseType, width, height, version, style, font, depth, labelDepth, scaleX, scaleY, scaleZ, previewMode, workerReady, autoRender]);

  const handleRender = doRender;

  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [theme, setThemeState] = React.useState<Theme>(getCurrentTheme);
  const baseZoneRef = React.useRef<HTMLDivElement>(null);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  return (
    <div
      style={{
        width: 340,
        minWidth: 340,
        borderRight: "1px solid var(--border)",
        background: "var(--panel)",
        color: "var(--text)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
      }}
    >
      {/* Top zone: controls (shrink-to-fit) */}
      <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {lockedBaseType ? (
            <a
              href="/"
              onClick={(e) => { e.preventDefault(); onNavigateHome(); }}
              style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--accent)", textDecoration: "none", cursor: "pointer" }}
            >
              GFLabel
            </a>
          ) : (
            <h2 style={{ margin: 0, fontSize: 18 }}>GFLabel</h2>
          )}
          <a
            href="https://github.com/ndevenish/gflabel-js"
            target="_blank"
            rel="noopener noreferrer"
            title="View on GitHub"
            style={{
              display: "flex",
              alignItems: "center",
              color: "var(--text-3)",
              textDecoration: "none",
            }}
          >
            <svg height="18" width="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
              aria-label="Basculer le thème clair/sombre"
              style={{
                padding: "3px 8px",
                border: "1px solid var(--border)",
                borderRadius: 4,
                background: "var(--muted-surface)",
                cursor: "pointer",
                fontSize: 13,
                lineHeight: 1.2,
                color: "var(--text-3)",
              }}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <button
              onClick={resetSettings}
              title="Reset all settings to defaults"
              style={{
                padding: "3px 8px",
                border: "1px solid var(--border)",
                borderRadius: 4,
                background: "var(--muted-surface)",
                cursor: "pointer",
                fontSize: 11,
                color: "var(--text-3)",
              }}
            >
              Reset
            </button>
          </div>
        </div>

        {/* Base config zone with thin Advanced strip on right */}
        <div ref={baseZoneRef} style={{ display: "flex", gap: 4, position: "relative" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <BaseSelector value={baseType} disabled={!!lockedBaseType} onChange={(bt) => {
              setBaseType(bt);
              setWidth(defaultWidth(bt));
              setHeight(undefined);
              setVersion(undefined);
              setDepth(DEFAULT_DEPTHS[bt] ?? 0.4);
              // Clamp label depth to new base's max
              const maxLabelDepth = getMaxLabelDepth(bt);
              if (labelDepth > maxLabelDepth) {
                setLabelDepth(Math.min(labelDepth, maxLabelDepth));
              }
            }} />

            {baseType === "cullenect" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                  Version
                </label>
                <select
                  value={version ?? "v2.0.0"}
                  onChange={(e) => setVersion(e.target.value)}
                  style={{ flex: 1, padding: "6px 8px" }}
                >
                  {CULLENECT_VERSIONS.map((v) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </div>
            )}

            <BaseSizeControls
              baseType={baseType}
              width={width}
              height={height}
              onWidthChange={setWidth}
              onHeightChange={setHeight}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                Style
              </label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as LabelStyle)}
                style={{ flex: 1, padding: "6px 8px" }}
              >
                <option value={LabelStyle.EMBOSSED}>Embossed</option>
                <option value={LabelStyle.DEBOSSED}>Debossed</option>
                <option value={LabelStyle.EMBEDDED}>Embedded</option>
              </select>
            </div>

            {/* Soft divider at bottom of base settings — extends past the Advanced strip */}
            <div style={{ borderTop: "1px solid var(--divider)", marginRight: -36 }} />
          </div>

          {/* Thin vertical Advanced strip — spans full height including divider */}
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            title="Advanced base settings"
            style={{
              width: 20,
              flexShrink: 0,
              marginRight: -16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              border: "none",
              borderLeft: "1px solid var(--divider)",
              borderBottom: "1px solid var(--divider)",
              background: advancedOpen ? "var(--accent)" : "var(--muted-surface)",
              cursor: "pointer",
              writingMode: "vertical-rl",
              fontSize: 10,
              fontWeight: 500,
              color: advancedOpen ? "var(--on-accent)" : "var(--text-4)",
              letterSpacing: "0.5px",
            }}
          >
            {advancedOpen ? "\u25C0" : "\u25B6"} Advanced
          </button>

        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 13, whiteSpace: "nowrap" }}>
            Font
          </label>
          <select
            value={font}
            onChange={(e) => setFont(e.target.value)}
            style={{ flex: 1, padding: "6px 8px" }}
          >
            <option value="open-sans">Open Sans</option>
            <option value="jost">Jost</option>
            <option value="jost-semibold">Jost Semibold</option>
          </select>
        </div>

        <LabelSpecInput value={spec} onChange={setSpec} insertAtCursorRef={insertAtCursorRef} />
      </div>

      {/* Advanced panel — positioned from outer panel, matching baseZone height */}
      {advancedOpen && baseZoneRef.current && (
        <div
          style={{
            position: "absolute",
            left: "100%",
            top: baseZoneRef.current.offsetTop,
            height: baseZoneRef.current.offsetHeight,
            width: 300,
            background: "var(--panel)",
            borderRight: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            boxShadow: "2px 2px 8px rgba(0,0,0,0.08)",
            zIndex: 50,
            padding: 16,
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>Advanced</div>

            {hasAdjustableDepth(baseType) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ whiteSpace: "nowrap", minWidth: 80 }}>Label Depth</label>
                <input
                  type="number"
                  value={depth}
                  min={0.1}
                  max={5}
                  step={0.1}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) setDepth(val);
                  }}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    if (isNaN(val) || val < 0.1) {
                      setDepth(DEFAULT_DEPTHS[baseType] || 0.4);
                    }
                  }}
                  style={{ flex: 1, padding: "4px 6px", width: 60 }}
                />
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>mm</span>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ whiteSpace: "nowrap", minWidth: 80 }}>
                {style === LabelStyle.EMBOSSED ? "Extrude Height" : "Cut Depth"}
              </label>
              <input
                type="number"
                value={labelDepth}
                min={0.1}
                max={getMaxLabelDepth(baseType)}
                step={0.1}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setLabelDepth(Math.min(val, getMaxLabelDepth(baseType)));
                }}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  const max = getMaxLabelDepth(baseType);
                  if (isNaN(val) || val < 0.1) {
                    setLabelDepth(0.4);
                  } else if (val > max) {
                    setLabelDepth(max);
                  }
                }}
                style={{ flex: 1, padding: "4px 6px", width: 60 }}
              />
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>mm</span>
            </div>

            <div style={{ fontWeight: 600, marginTop: 4 }}>Scale</div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {([
                ["X", scaleX, setScaleX],
                ["Y", scaleY, setScaleY],
                ["Z", scaleZ, setScaleZ],
              ] as const).map(([axis, val, setter]) => (
                <div key={axis} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <label style={{ fontSize: 12 }}>{axis}</label>
                  <input
                    type="number"
                    value={Math.round(val * 100)}
                    min={10}
                    max={1000}
                    step={5}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) setter(val / 100);
                    }}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (isNaN(val) || val < 10) {
                        setter(1);
                      } else if (val > 1000) {
                        setter(10);
                      }
                    }}
                    style={{ width: 60, padding: "4px 4px", fontSize: 12 }}
                  />
                  <span style={{ fontSize: 12 }}>%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Middle zone: fragment palette (scrollable) */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", minHeight: 0 }}>
        <FragmentPalette insertAtCursorRef={insertAtCursorRef} />
      </div>

      {/* Bottom zone: preview + render + export (pinned) */}
      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12, flexShrink: 0, borderTop: "1px solid var(--divider)" }}>
        <div style={{ paddingTop: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
            Preview
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoRender}
              onChange={(e) => setAutoRender(e.target.checked)}
            />
            Auto re-render
          </label>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border)",
            }}
          >
            {(["svg", "3d"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onPreviewModeChange(mode)}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  border: "none",
                  background: previewMode === mode ? "var(--accent)" : "var(--inset)",
                  color: previewMode === mode ? "var(--on-accent)" : "var(--text-2)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Preview colours — also the default filament colours for 3MF export */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 4 }}>
              Couleurs — aperçu 3D &amp; défaut export 3MF
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              {([
                ["Base", "base", "Couleur de la base"],
                ["Texte", "label", "Couleur du texte"],
              ] as const).map(([label, key, title]) => (
                <label key={key} title={title} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="color"
                    value={previewColors[key]}
                    onChange={(e) => onPreviewColorsChange({ ...previewColors, [key]: e.target.value })}
                    style={{ width: 30, height: 24, padding: 0, border: "1px solid var(--border)", borderRadius: 4, background: "none", cursor: "pointer" }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>

        {!autoRender && (
          <button
            onClick={handleRender}
            disabled={!workerReady || !spec.trim()}
            style={{
              padding: "10px 16px",
              background: workerReady ? "var(--accent)" : "var(--text-disabled)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: 6,
              cursor: workerReady ? "pointer" : "not-allowed",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {workerReady ? "Render" : "Loading WASM..."}
          </button>
        )}

        <DownloadButtons onEnsureRendered={ensureRendered3D} baseType={baseType} width={width} spec={spec} colors={previewColors} />

        <button
          onClick={() => setBatchOpen(true)}
          disabled={!workerReady}
          title="Générer des étiquettes en masse depuis un CSV"
          style={{
            padding: "8px 12px",
            background: "var(--panel)",
            color: workerReady ? "var(--accent)" : "var(--text-disabled)",
            border: `1px solid ${workerReady ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 6,
            cursor: workerReady ? "pointer" : "not-allowed",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Génération en masse (CSV → 3MF/STL…)
        </button>
      </div>

      {batchOpen && (
        <BatchPanel
          onClose={() => setBatchOpen(false)}
          baseType={baseType}
          width={width}
          height={height}
          version={version}
          depth={depth}
          labelDepth={labelDepth}
          style={style}
          font={font}
          initialTemplate={spec}
          initialColors={previewColors}
        />
      )}
    </div>
  );
}
