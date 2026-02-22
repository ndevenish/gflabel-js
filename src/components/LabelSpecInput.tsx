interface Props {
  value: string;
  onChange: (value: string) => void;
  insertAtCursor?: (text: string) => void;
}

export function LabelSpecInput({ value, onChange }: Props) {
  return (
    <div>
      <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
        Label Spec
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='{nut}M3\nEnter label spec...'
        rows={4}
        style={{
          width: "100%",
          padding: "8px",
          border: "1px solid #ccc",
          borderRadius: 4,
          fontFamily: "monospace",
          fontSize: 13,
          resize: "vertical",
        }}
      />
      <div
        style={{
          fontSize: 11,
          color: "#888",
          marginTop: 4,
        }}
      >
        Use \n for newlines, {"{nut}"}, {"{bolt(20)}"}, {"{washer}"},{" "}
        {"{...}"} for expander, {"{|}"} for columns
      </div>
    </div>
  );
}
