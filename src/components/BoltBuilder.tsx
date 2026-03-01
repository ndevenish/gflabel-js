import React from "react";
import { renderSVG } from "../cad/workerClient.js";
import { LabelStyle } from "../cad/options.js";

// Eagerly import head SVGs as raw strings — inlined into the JS bundle
const headSvgRawModules = import.meta.glob<string>(
  "../assets/fragments/head-*.svg",
  { eager: true, import: "default", query: "?raw" },
);

function headSvgUrl(name: string): string | undefined {
  const key = `../assets/fragments/${name}.svg`;
  const raw = headSvgRawModules[key];
  if (!raw) return undefined;
  return `data:image/svg+xml,${encodeURIComponent(raw)}`;
}

const HEAD_SHAPES = [
  { id: "pan", label: "Pan" },
  { id: "socket", label: "Socket" },
  { id: "round", label: "Round" },
  { id: "countersunk", label: "CSK" },
  { id: "wafer", label: "Wafer" },
] as const;

// "slot" is omitted: parseBoltFeatures consumes it as the "slotted" modifier.
// "square" is omitted: FEATURE_ALIAS maps it to "socket" head shape.
// Use the Slotted checkbox for the slot-head visual on bolts.
const DRIVES = [
  { id: null as string | null, label: "None", icon: null },
  { id: "phillips", label: null, icon: "head-phillips" },
  { id: "pozidrive", label: null, icon: "head-pozidrive" },
  { id: "hex", label: null, icon: "head-hex" },
  { id: "cross", label: null, icon: "head-cross" },
  { id: "triangle", label: null, icon: "head-triangle" },
  { id: "torx", label: null, icon: "head-torx" },
];

const BOLT_MODIFIERS = ["tapping", "flip", "slotted", "flanged"] as const;
const WEBBOLT_MODIFIERS = ["tapping", "partial", "flip"] as const;

interface BoltBuilderProps {
  insertAtCursorRef: React.RefObject<((text: string) => void) | null>;
}

function buildSpec(
  mode: "bolt" | "webbolt",
  length: number,
  headShape: string,
  drive: string | null,
  modifiers: Set<string>,
): string {
  const parts: string[] = [];
  if (mode === "bolt") {
    parts.push(String(length));
  }
  // Omit "pan" for bolt (default), always include for webbolt
  if (mode === "webbolt" || headShape !== "pan") {
    parts.push(headShape);
  }
  if (drive && mode === "webbolt") {
    parts.push(drive);
  }
  for (const m of mode === "bolt" ? BOLT_MODIFIERS : WEBBOLT_MODIFIERS) {
    if (modifiers.has(m)) parts.push(m);
  }
  return `{${mode}(${parts.join(",")})}`;
}

const pillBtn: React.CSSProperties = {
  padding: "3px 8px",
  border: "1px solid #d1d5db",
  borderRadius: 4,
  background: "#f9fafb",
  cursor: "pointer",
  fontSize: 11,
  lineHeight: "18px",
};

const pillBtnActive: React.CSSProperties = {
  ...pillBtn,
  background: "#2563eb",
  borderColor: "#2563eb",
  color: "#fff",
};

const iconBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  padding: 2,
  border: "1px solid #d1d5db",
  borderRadius: 4,
  background: "#f9fafb",
  cursor: "pointer",
};

const iconBtnActive: React.CSSProperties = {
  ...iconBtn,
  background: "#2563eb",
  borderColor: "#2563eb",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  flexWrap: "wrap",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#6b7280",
  width: 40,
  flexShrink: 0,
};

export function BoltBuilder({ insertAtCursorRef }: BoltBuilderProps) {
  const [mode, setMode] = React.useState<"bolt" | "webbolt">("bolt");
  const [length, setLength] = React.useState(10);
  const [headShape, setHeadShape] = React.useState("pan");
  const [drive, setDrive] = React.useState<string | null>(null);
  const [modifiers, setModifiers] = React.useState<Set<string>>(() => new Set());

  const switchMode = (newMode: "bolt" | "webbolt") => {
    if (newMode === mode) return;
    setMode(newMode);
    // Clear drive when switching to bolt (bolt doesn't support drives)
    if (newMode === "bolt") setDrive(null);
    // Clear modifiers not available in the new mode
    const available = new Set<string>(
      newMode === "bolt" ? BOLT_MODIFIERS : WEBBOLT_MODIFIERS,
    );
    setModifiers((prev) => {
      const next = new Set([...prev].filter((m) => available.has(m)));
      return next.size === prev.size ? prev : next;
    });
  };
  const [svgHtml, setSvgHtml] = React.useState<string | null>(null);
  const [rendering, setRendering] = React.useState(false);

  const spec = buildSpec(mode, length, headShape, drive, modifiers);

  const toggleModifier = (m: string) => {
    setModifiers((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const availableModifiers = mode === "bolt" ? BOLT_MODIFIERS : WEBBOLT_MODIFIERS;

  // Debounced SVG preview
  React.useEffect(() => {
    setRendering(true);
    const timer = setTimeout(() => {
      renderSVG({
        spec: spec,
        base: { baseType: "none", width: 40, height: 12 },
        style: LabelStyle.EMBOSSED,
      })
        .then((result) => setSvgHtml(result.svg))
        .catch(() => setSvgHtml(null))
        .finally(() => setRendering(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [spec]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* SVG Preview */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 4,
          background: "#fff",
          padding: 4,
          minHeight: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: rendering ? 0.5 : 1,
          transition: "opacity 0.15s",
        }}
      >
        {svgHtml ? (
          <div
            dangerouslySetInnerHTML={{ __html: svgHtml }}
            style={{
              width: "100%",
              height: 32,
              overflow: "hidden",
            }}
            ref={(el) => {
              // Force the inline SVG to fill its container
              const svg = el?.querySelector("svg");
              if (svg) {
                svg.setAttribute("width", "100%");
                svg.setAttribute("height", "100%");
                svg.style.display = "block";
              }
            }}
          />
        ) : (
          <span style={{ fontSize: 10, color: "#9ca3af" }}>
            {rendering ? "Rendering..." : "No preview"}
          </span>
        )}
      </div>

      {/* Type toggle */}
      <div style={rowStyle}>
        <span style={labelStyle}>Type</span>
        <button
          onClick={() => switchMode("bolt")}
          style={mode === "bolt" ? pillBtnActive : pillBtn}
        >
          Bolt
        </button>
        <button
          onClick={() => switchMode("webbolt")}
          style={mode === "webbolt" ? pillBtnActive : pillBtn}
        >
          Webbolt
        </button>
      </div>

      {/* Length (bolt only) */}
      {mode === "bolt" && (
        <div style={rowStyle}>
          <span style={labelStyle}>Length</span>
          <input
            type="number"
            min={1}
            max={200}
            value={length}
            onChange={(e) => setLength(Math.max(1, Number(e.target.value) || 1))}
            style={{
              width: 60,
              padding: "2px 6px",
              border: "1px solid #d1d5db",
              borderRadius: 4,
              fontSize: 12,
            }}
          />
        </div>
      )}

      {/* Head shape */}
      <div style={rowStyle}>
        <span style={labelStyle}>Head</span>
        {HEAD_SHAPES.map((h) => (
          <button
            key={h.id}
            onClick={() => setHeadShape(h.id)}
            style={headShape === h.id ? pillBtnActive : pillBtn}
          >
            {h.label}
          </button>
        ))}
      </div>

      {/* Drive (webbolt only — bolt doesn't render drives) */}
      {mode === "webbolt" && (
        <div style={rowStyle}>
          <span style={labelStyle}>Drive</span>
          {DRIVES.map((d) => {
            const active = drive === d.id;
            if (d.icon) {
              const url = headSvgUrl(d.icon);
              return (
                <button
                  key={d.id}
                  title={d.id!}
                  onClick={() => setDrive(d.id)}
                  style={active ? iconBtnActive : iconBtn}
                >
                  {url ? (
                    <img
                      src={url}
                      alt={d.id!}
                      style={{
                        width: 20,
                        height: 20,
                        objectFit: "contain",
                        filter: active ? "brightness(0) invert(1)" : undefined,
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 8 }}>{d.id}</span>
                  )}
                </button>
              );
            }
            return (
              <button
                key="none"
                onClick={() => setDrive(null)}
                style={active ? pillBtnActive : pillBtn}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Modifiers */}
      <div style={rowStyle}>
        <span style={labelStyle}></span>
        {availableModifiers.map((m) => (
          <label
            key={m}
            style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={modifiers.has(m)}
              onChange={() => toggleModifier(m)}
              style={{ margin: 0 }}
            />
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </label>
        ))}
      </div>

      {/* Spec + Insert */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <code
          style={{
            flex: 1,
            fontSize: 11,
            padding: "3px 6px",
            background: "#f3f4f6",
            borderRadius: 3,
            color: "#374151",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {spec}
        </code>
        <button
          onClick={() => insertAtCursorRef.current?.(spec)}
          style={{
            padding: "3px 10px",
            border: "1px solid #2563eb",
            borderRadius: 4,
            background: "#2563eb",
            color: "#fff",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          Insert
        </button>
      </div>
    </div>
  );
}
