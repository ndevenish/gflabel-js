import React from "react";
import { BaseSelector } from "./BaseSelector.js";
import { BaseSizeControls, defaultWidth } from "./BaseSizeControls.js";
import { LabelSpecInput } from "./LabelSpecInput.js";
import { FragmentPalette } from "./FragmentPalette.js";
import { DownloadButtons } from "./DownloadButtons.js";
import { renderLabel, renderSVG, ensureReady } from "../cad/workerClient.js";
import type { MeshData } from "../cad/workerClient.js";
import { LabelStyle, FontStyle } from "../cad/options.js";
import type { BaseConfig, BaseType } from "../cad/bases/base.js";
import { CULLENECT_VERSIONS } from "../cad/bases/cullenect.js";
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

  // Sync baseType when route-locked type changes
  React.useEffect(() => {
    if (lockedBaseType !== undefined) {
      setBaseType(lockedBaseType);
      setWidth(defaultWidth(lockedBaseType));
      setHeight(undefined);
      setVersion(undefined);
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
    saveSettings({ baseType, width, height, version, style, font, spec, autoRender, previewMode });
  }, [baseType, width, height, version, style, font, spec, autoRender, previewMode]);

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
        version,
      };
      const fontOptions = { font: { font, fontStyle: FontStyle.REGULAR, fontHeightExact: true } };
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
    const baseConfig: BaseConfig = { baseType, width, height, version };
    await renderLabel({ spec, base: baseConfig, style, options: { font: { font, fontStyle: FontStyle.REGULAR, fontHeightExact: true } } });
  }, [workerReady, spec, baseType, width, height, version, style, font]);

  // Keep a stable ref to doRender so the debounce effect doesn't re-trigger
  // when callback identity changes.
  const doRenderRef = React.useRef(doRender);
  React.useEffect(() => { doRenderRef.current = doRender; }, [doRender]);

  // Auto-render: debounced in SVG mode on input changes, immediate on mode switch
  const prevModeRef = React.useRef(previewMode);
  React.useEffect(() => {
    const modeChanged = prevModeRef.current !== previewMode;
    prevModeRef.current = previewMode;

    if (!workerReady || !spec.trim()) return;
    if (!autoRender && !modeChanged) return;

    const delay = modeChanged ? 0 : previewMode === "svg" ? 300 : 600;
    const timer = setTimeout(() => {
      doRenderRef.current();
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, baseType, width, height, version, style, font, previewMode, workerReady, autoRender]);

  const handleRender = doRender;

  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const baseZoneRef = React.useRef<HTMLDivElement>(null);
  const [baseZoneHeight, setBaseZoneHeight] = React.useState(0);

  // Measure the base config zone height for the advanced panel
  React.useEffect(() => {
    if (!baseZoneRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setBaseZoneHeight(entry.contentRect.height);
    });
    ro.observe(baseZoneRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      style={{
        width: 340,
        minWidth: 340,
        borderRight: "1px solid #ddd",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
      }}
    >
      {/* Top zone: controls (shrink-to-fit) */}
      <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {lockedBaseType ? (
            <a
              href="/"
              onClick={(e) => { e.preventDefault(); onNavigateHome(); }}
              style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#2563eb", textDecoration: "none", cursor: "pointer" }}
            >
              GFLabel
            </a>
          ) : (
            <h2 style={{ margin: 0, fontSize: 18 }}>GFLabel</h2>
          )}
          <button
            onClick={resetSettings}
            title="Reset all settings to defaults"
            style={{
              padding: "3px 8px",
              border: "1px solid #d1d5db",
              borderRadius: 4,
              background: "#f9fafb",
              cursor: "pointer",
              fontSize: 11,
              color: "#6b7280",
            }}
          >
            Reset
          </button>
        </div>

        {/* Base config zone with thin Advanced strip on right */}
        <div ref={baseZoneRef} style={{ display: "flex", gap: 4, position: "relative" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <BaseSelector value={baseType} disabled={!!lockedBaseType} onChange={(bt) => {
              setBaseType(bt);
              setWidth(defaultWidth(bt));
              setHeight(undefined);
              setVersion(undefined);
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
            <div style={{ borderTop: "1px solid #e5e7eb", marginRight: -36 }} />
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
              borderLeft: "1px solid #e5e7eb",
              borderBottom: "1px solid #e5e7eb",
              background: advancedOpen ? "#2563eb" : "#f9fafb",
              cursor: "pointer",
              writingMode: "vertical-rl",
              fontSize: 10,
              fontWeight: 500,
              color: advancedOpen ? "#fff" : "#9ca3af",
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
            background: "#fff",
            borderRight: "1px solid #ddd",
            borderBottom: "1px solid #ddd",
            boxShadow: "2px 2px 8px rgba(0,0,0,0.08)",
            zIndex: 50,
            padding: 16,
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Advanced Settings</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            Base tweaking options will go here.
          </div>
        </div>
      )}

      {/* Middle zone: fragment palette (scrollable) */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", minHeight: 0 }}>
        <FragmentPalette insertAtCursorRef={insertAtCursorRef} />
      </div>

      {/* Bottom zone: preview + render + export (pinned) */}
      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12, flexShrink: 0, borderTop: "1px solid #eee" }}>
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
              border: "1px solid #d1d5db",
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
                  background: previewMode === mode ? "#2563eb" : "#f3f4f6",
                  color: previewMode === mode ? "white" : "#374151",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {!autoRender && (
          <button
            onClick={handleRender}
            disabled={!workerReady || !spec.trim()}
            style={{
              padding: "10px 16px",
              background: workerReady ? "#2563eb" : "#94a3b8",
              color: "white",
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

        <DownloadButtons onEnsureRendered={ensureRendered3D} />
      </div>
    </div>
  );
}
