import React from "react";
import manifestData from "../assets/fragments/manifest.json";

interface ManifestEntry {
  name: string;
  label: string;
  spec: string;
  category: string;
}

const manifest: ManifestEntry[] = manifestData;

// Eagerly import all fragment SVGs via Vite glob — returns { path: url }
const svgModules = import.meta.glob<string>(
  "../assets/fragments/*.svg",
  { eager: true, import: "default" },
);

/** Resolve a manifest entry's name to its Vite-processed SVG URL. */
function svgUrl(name: string): string | undefined {
  // Glob keys are relative paths like "../assets/fragments/nut.svg"
  const key = `../assets/fragments/${name}.svg`;
  return svgModules[key];
}

// Build ordered list of unique categories
const CATEGORIES: string[] = [];
{
  const seen = new Set<string>();
  for (const entry of manifest) {
    if (!seen.has(entry.category)) {
      seen.add(entry.category);
      CATEGORIES.push(entry.category);
    }
  }
}

interface Props {
  insertAtCursorRef: React.RefObject<((text: string) => void) | null>;
}

export function FragmentPalette({ insertAtCursorRef }: Props) {
  const [filter, setFilter] = React.useState("");

  const lowerFilter = filter.toLowerCase();
  const filtered = lowerFilter
    ? manifest.filter(
        (e) =>
          e.label.toLowerCase().includes(lowerFilter) ||
          e.name.toLowerCase().includes(lowerFilter) ||
          e.category.toLowerCase().includes(lowerFilter),
      )
    : manifest;

  // Group filtered entries by category, preserving manifest order
  const grouped = new Map<string, ManifestEntry[]>();
  for (const entry of filtered) {
    let list = grouped.get(entry.category);
    if (!list) {
      list = [];
      grouped.set(entry.category, list);
    }
    list.push(entry);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontSize: 13, fontWeight: 600 }}>Fragments</label>
      <input
        type="text"
        placeholder="Filter fragments..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          padding: "6px 8px",
          border: "1px solid #d1d5db",
          borderRadius: 4,
          fontSize: 13,
        }}
      />
      {CATEGORIES.map((cat) => {
        const entries = grouped.get(cat);
        if (!entries) return null;
        return (
          <div key={cat}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 4,
              }}
            >
              {cat}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(48px, 1fr))",
                gap: 4,
              }}
            >
              {entries.map((frag) => {
                const url = svgUrl(frag.name);
                return (
                  <button
                    key={frag.name}
                    title={frag.label}
                    onClick={() => insertAtCursorRef.current?.(frag.spec)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      aspectRatio: "1",
                      padding: 6,
                      border: "1px solid #d1d5db",
                      borderRadius: 6,
                      background: "#f9fafb",
                      cursor: "pointer",
                    }}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={frag.label}
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    ) : (
                      <span style={{ fontSize: 9, color: "#9ca3af" }}>
                        {frag.name.slice(0, 4)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {filtered.length === 0 && (
        <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: 8 }}>
          No matching fragments
        </div>
      )}
    </div>
  );
}
