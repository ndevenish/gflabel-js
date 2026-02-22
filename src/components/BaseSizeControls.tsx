import React from "react";

interface Props {
  baseType: "pred" | "plain";
  width: number;
  height: number | undefined;
  onWidthChange: (w: number) => void;
  onHeightChange: (h: number | undefined) => void;
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
          Width ({baseType === "pred" ? "units" : "mm"})
        </label>
        <input
          type="number"
          value={width}
          min={baseType === "pred" ? 1 : 10}
          step={baseType === "pred" ? 1 : 5}
          onChange={(e) => onWidthChange(Number(e.target.value))}
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
          placeholder={baseType === "pred" ? "11.5" : "15"}
          min={5}
          step={0.5}
          onChange={(e) =>
            onHeightChange(e.target.value ? Number(e.target.value) : undefined)
          }
          style={inputStyle}
        />
      </div>
    </div>
  );
}
