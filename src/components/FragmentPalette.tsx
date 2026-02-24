import React from "react";
import manifestData from "../assets/fragments/manifest.json";
import { BoltBuilder } from "./BoltBuilder.js";

interface ManifestEntry {
  name: string;
  label: string;
  spec: string;
  category: string;
}

const KEEP_CATEGORIES = new Set(["Hardware", "Screw Heads"]);
const manifest: ManifestEntry[] = manifestData.map((e) => ({
  ...e,
  category: KEEP_CATEGORIES.has(e.category) ? e.category : "Electronic Symbols",
}));

// Eagerly import all fragment SVGs via Vite glob — returns { path: url }
const svgModules = import.meta.glob<string>(
  "../assets/fragments/*.svg",
  { eager: true, import: "default" },
);

/** Resolve a manifest entry's name to its Vite-processed SVG URL. */
function svgUrl(name: string): string | undefined {
  const key = `../assets/fragments/${name}.svg`;
  return svgModules[key];
}

// Build ordered list of unique categories, injecting builder sections after "Screw Heads"
const BUILDER_CATEGORIES = new Set(["Bolts"]);
const CATEGORIES: string[] = [];
{
  const seen = new Set<string>();
  for (const entry of manifest) {
    if (!seen.has(entry.category)) {
      seen.add(entry.category);
      CATEGORIES.push(entry.category);
      // Insert builder categories after Screw Heads
      if (entry.category === "Screw Heads") {
        CATEGORIES.push("Bolts");
      }
    }
  }
}

// These categories are expanded by default
const DEFAULT_EXPANDED = new Set(["Hardware", "Screw Heads", "Bolts", "Electronic Symbols"]);

interface Props {
  insertAtCursorRef: React.RefObject<((text: string) => void) | null>;
}

export function FragmentPalette({ insertAtCursorRef }: Props) {
  const [filter, setFilter] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(DEFAULT_EXPANDED),
  );

  const isFiltering = filter.length > 0;
  const lowerFilter = filter.toLowerCase();
  const filtered = isFiltering
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

  const toggleCategory = (cat: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600 }}>Fragments</label>
      <input
        type="text"
        placeholder="Filter fragments..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          padding: "5px 8px",
          border: "1px solid #d1d5db",
          borderRadius: 4,
          fontSize: 12,
        }}
      />
      {CATEGORIES.map((cat) => {
        const isBuilder = BUILDER_CATEGORIES.has(cat);
        const entries = isBuilder ? null : grouped.get(cat);
        // Hide non-builder categories with no matching entries
        if (!isBuilder && !entries) return null;
        // When filtering, force all matching categories open
        const isOpen = isFiltering || expanded.has(cat);
        return (
          <div key={cat}>
            <button
              onClick={() => toggleCategory(cat)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                width: "100%",
                padding: "3px 0",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  textAlign: "center",
                  transition: "transform 0.15s",
                  transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                  fontSize: 10,
                }}
              >
                &#9654;
              </span>
              {cat}
              {entries && (
                <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 2 }}>
                  {entries.length}
                </span>
              )}
            </button>
            {isOpen && isBuilder && (
              <div style={{ paddingTop: 2, paddingBottom: 4 }}>
                <BoltBuilder insertAtCursorRef={insertAtCursorRef} />
              </div>
            )}
            {isOpen && entries && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(36px, 1fr))",
                  gap: 3,
                  paddingTop: 2,
                  paddingBottom: 4,
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
                        padding: 4,
                        border: "1px solid #d1d5db",
                        borderRadius: 4,
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
                        <span style={{ fontSize: 8, color: "#9ca3af" }}>
                          {frag.name.slice(0, 4)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
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
