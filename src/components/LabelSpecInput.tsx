import React from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  insertAtCursorRef?: React.MutableRefObject<((text: string) => void) | null>;
}

export function LabelSpecInput({ value, onChange, insertAtCursorRef }: Props) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Expose insertAtCursor via ref so parent/palette can call it
  React.useEffect(() => {
    if (insertAtCursorRef) {
      insertAtCursorRef.current = (text: string) => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const before = value.slice(0, start);
        const after = value.slice(end);
        onChange(before + text + after);
        // Restore cursor position after the inserted text
        requestAnimationFrame(() => {
          el.selectionStart = el.selectionEnd = start + text.length;
          el.focus();
        });
      };
    }
    return () => {
      if (insertAtCursorRef) insertAtCursorRef.current = null;
    };
  }, [value, onChange, insertAtCursorRef]);

  return (
    <div>
      <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
        Label Spec
      </label>
      <textarea
        ref={textareaRef}
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
