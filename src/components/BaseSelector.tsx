
import { BASE_TYPES, type BaseType } from "../cad/bases/base.js";

const WIP_TYPES: Set<BaseType> = new Set(["modern"]);

const LABELS: Record<BaseType, string> = {
  pred: "Pred",
  plain: "Plain",
  none: "None",
  predbox: "Predbox",
  tailorbox: "Tailorbox",
  cullenect: "Cullenect",
  modern: "Modern",
};

interface Props {
  value: BaseType;
  onChange: (value: BaseType) => void;
}

export function BaseSelector({ value, onChange }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <label style={{ fontSize: 13, whiteSpace: "nowrap" }}>
        Base Type
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as BaseType)}
        style={{ flex: 1, padding: "6px 8px" }}
      >
        {BASE_TYPES.map((type) => (
          <option key={type} value={type}>
            {LABELS[type]}{WIP_TYPES.has(type) ? " (WIP)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
