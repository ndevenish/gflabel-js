
import React from "react";
import { BASE_TYPES, type BaseType } from "../cad/bases/base.js";

import imgPred from "../assets/bases/base_pred.png";
import imgPredbox from "../assets/bases/base_predbox.png";
import imgTailor from "../assets/bases/base_tailor.png";
import imgPlain from "../assets/bases/base_plain.png";
import imgCullenect from "../assets/bases/base_cullenect.png";
import imgModern from "../assets/bases/base_modern.png";
import imgNone from "../assets/bases/base_none.png";

const WIP_TYPES: Set<BaseType> = new Set(["modern"]);

const L = (href: string, text: string) =>
  React.createElement("a", {
    href,
    target: "_blank",
    rel: "noopener noreferrer",
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    style: { color: "#2563eb", textDecoration: "underline" },
  }, text);

interface BaseInfo {
  label: string;
  image: string;
  description: React.ReactNode;
}

const BASE_INFO: Record<BaseType, BaseInfo> = {
  pred: {
    label: "Pred",
    image: imgPred,
    description: <>For {L("https://www.printables.com/model/592545-gridfinity-bin-with-printable-label-by-pred-parame", "Pred's parametric labelled bins")}. Height ignored; width in gridfinity units (e.g. width=1 for a single 42mm bin).</>,
  },
  predbox: {
    label: "Predbox",
    image: imgPredbox,
    description: <>For labels matching {L("https://www.printables.com/model/543553-gridfinity-storage-box-by-pred-now-parametric", "Pred's Parametric Storage Box")} (~25mm). Width is for the storage bin width: 4, 5, 6, or 7 U.</>,
  },
  tailorbox: {
    label: "Tailorbox",
    image: imgTailor,
    description: <>For labels matching {L("https://www.printables.com/model/1152814-gridfinity-hardware-storage-system-beta", "Tailor Glad's Storage Box")}. Even larger labels for slotting in the front of the storage boxes. Currently only accepts 5U width.</>,
  },
  plain: {
    label: "Plain",
    image: imgPlain,
    description: "Blank square label with chamfered top edge. Width and height are the whole label area in mm.",
  },
  cullenect: {
    label: "Cullenect",
    image: imgCullenect,
    description: <>For {L("https://makerworld.com/en/models/446624", "Cullen J Webb's")} swappable label system. 36.4mm x 11mm rounded rectangle with snap-fit inserts. Use without margins to match the author's style.</>,
  },
  modern: {
    label: "Modern",
    image: imgModern,
    description: <>For {L("https://www.printables.com/model/894202-modern-gridfinity-case", "Modern Gridfinity Case")} labels, ~22mm high that slot into the front. Width can be 3, 4, 5, 6, 7, or 8 U.</>,
  },
  none: {
    label: "None",
    image: imgNone,
    description: "No base at all \u2014 the label is extruded standalone. Useful for generating label models to place onto other volumes in slicer.",
  },
};

interface Props {
  value: BaseType;
  onChange: (value: BaseType) => void;
  disabled?: boolean;
}

export function BaseSelector({ value, onChange, disabled }: Props) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const current = BASE_INFO[value];

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Selected value button — image at 70% with dropdown arrow */}
      <button
        onClick={() => !disabled && setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "4px",
          border: disabled ? "none" : "1px solid #d1d5db",
          borderRadius: 6,
          background: disabled ? "transparent" : "#fff",
          cursor: disabled ? "default" : "pointer",
        }}
      >
        <img
          src={current.image}
          alt={current.label}
          style={{ width: "70%", height: "auto", display: "block", borderRadius: 4 }}
        />
        {!disabled && (
          <span style={{ position: "absolute", right: 8, fontSize: 12, color: "#9ca3af" }}>
            {open ? "\u25B2" : "\u25BC"}
          </span>
        )}
      </button>

      {/* Dropdown popup — wider to fit image + description */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            width: 520,
            zIndex: 100,
            marginTop: 4,
            background: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            maxHeight: 480,
            overflowY: "auto",
          }}
        >
          {BASE_TYPES.map((type) => {
            const info = BASE_INFO[type];
            const selected = type === value;
            return (
              <button
                key={type}
                onClick={() => {
                  onChange(type);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 12px",
                  border: "none",
                  borderBottom: "1px solid #f3f4f6",
                  background: selected ? "#eff6ff" : "#fff",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  if (!selected) e.currentTarget.style.background = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = selected ? "#eff6ff" : "#fff";
                }}
              >
                <img
                  src={info.image}
                  alt={info.label}
                  style={{
                    width: 120,
                    height: "auto",
                    flexShrink: 0,
                    borderRadius: 4,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {info.label}
                    {WIP_TYPES.has(type) ? " (WIP)" : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4, marginTop: 2 }}>
                    {info.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
