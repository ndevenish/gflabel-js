
import type { BaseType } from "../cad/bases/base.js";

const BASE_TYPES: BaseType[] = [
  "pred",
  "plain",
  "none",
  "predbox",
  "tailorbox",
  "cullenect",
  "modern",
];

const WIP_TYPES: Set<BaseType> = new Set(["modern"]);

interface Props {
  value: BaseType;
  onChange: (value: BaseType) => void;
}

export function BaseSelector({ value, onChange }: Props) {
  return (
    <div>
      <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
        Base Type
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {BASE_TYPES.map((type) => (
          <label
            key={type}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            <input
              type="radio"
              name="baseType"
              value={type}
              checked={value === type}
              onChange={() => onChange(type)}
            />
            {type.charAt(0).toUpperCase() + type.slice(1)}
            {WIP_TYPES.has(type) && (
              <span style={{ fontSize: 10, color: "#b45309", fontWeight: 600 }}> WIP</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
