
interface Props {
  value: "pred" | "plain";
  onChange: (value: "pred" | "plain") => void;
}

export function BaseSelector({ value, onChange }: Props) {
  return (
    <div>
      <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
        Base Type
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        {(["pred", "plain"] as const).map((type) => (
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
          </label>
        ))}
      </div>
    </div>
  );
}
