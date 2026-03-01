import React from "react";
import type { BaseType } from "../cad/bases/base.js";

interface Props {
  baseType: BaseType;
  width: number;
  height: number | undefined;
  onWidthChange: (w: number) => void;
  onHeightChange: (h: number | undefined) => void;
}

/** Whether this base type uses gridfinity units (vs raw mm) for width. */
function usesUnits(bt: BaseType): boolean {
  return bt === "pred" || bt === "predbox" || bt === "tailorbox" || bt === "cullenect" || bt === "modern";
}

export function defaultWidth(bt: BaseType): number {
  switch (bt) {
    case "pred": return 1;
    case "predbox": return 4;
    case "tailorbox": return 5;
    case "cullenect": return 1;
    case "modern": return 3;
    case "plain": return 10;
    case "none": return 1;
  }
}

function widthStep(bt: BaseType): number {
  return usesUnits(bt) ? 1 : 5;
}

function defaultHeightPlaceholder(bt: BaseType): string {
  switch (bt) {
    case "pred": return "11.5";
    case "plain": return "15";
    case "none": return "15";
    case "predbox": return "24.5";
    case "tailorbox": return "24.8";
    case "cullenect": return "11";
    case "modern": return "22.1";
  }
}

export function BaseSizeControls({
  baseType,
  width,
  height,
  onWidthChange,
  onHeightChange,
}: Props) {
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    border: "1px solid #ccc",
    borderRadius: 4,
  };

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ flex: 1 }}>
        <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
          Width ({usesUnits(baseType) ? "units" : "mm"})
        </label>
        <input
          type="number"
          value={width}
          min={defaultWidth(baseType)}
          step={widthStep(baseType)}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) onWidthChange(val);
          }}
          onBlur={(e) => {
            const val = parseFloat(e.target.value);
            const minVal = defaultWidth(baseType);
            if (isNaN(val) || val < minVal) {
              onWidthChange(minVal);
            }
          }}
          style={inputStyle}
        />
      </div>
      <div style={{ flex: 1 }}>
        <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
          Height (mm)
        </label>
        <input
          type="number"
          value={height ?? ""}
          placeholder={defaultHeightPlaceholder(baseType)}
          min={5}
          step={0.5}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
              onHeightChange(val);
            } else if (e.target.value === "") {
              onHeightChange(undefined);
            }
          }}
          onBlur={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val < 5) {
              onHeightChange(5);
            }
          }}
          style={inputStyle}
        />
      </div>
    </div>
  );
}
