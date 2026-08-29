/**
 * Batch label generation — CSV parsing and template substitution.
 *
 * A "template" is an ordinary label spec that additionally contains
 * `{{column}}` placeholders. Each CSV row is turned into a concrete spec by
 * substituting its column values. The double-brace placeholder syntax cannot
 * collide with the single-brace `{fragment}` syntax used by the renderer.
 */

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Parse CSV text (RFC 4180-ish): first line is the header row, remaining lines
 * are records. Handles quoted fields containing commas, newlines, and escaped
 * quotes (`""`). Accepts both `\n` and `\r\n` line endings.
 */
export function parseCSV(text: string): ParsedCsv {
  const records = parseRecords(text);
  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = records[0]!.map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < records.length; i++) {
    const fields = records[i]!;
    // Skip fully blank lines (a single empty field with no others)
    if (fields.length === 1 && fields[0]!.trim() === "") continue;

    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]!] = fields[c] ?? "";
    }
    rows.push(row);
  }

  return { headers, rows };
}

/** Split raw CSV text into records of string fields. */
function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      // Handle CRLF and lone CR
      if (text[i + 1] === "\n") i++;
      pushRecord();
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRecord();
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // Flush trailing field/record if the text didn't end with a newline
  if (field !== "" || record.length > 0) {
    pushRecord();
  }

  return records;
}

const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Substitute `{{column}}` placeholders in a template with values from a row.
 * Unknown columns resolve to an empty string. Leaves single-brace `{fragment}`
 * syntax untouched.
 */
export function applyTemplate(template: string, row: Record<string, string>): string {
  return template.replace(PLACEHOLDER_RE, (_match, name: string) => {
    const key = name.trim();
    return Object.prototype.hasOwnProperty.call(row, key) ? row[key]! : "";
  });
}

/** Return the distinct placeholder column names referenced by a template. */
export function extractPlaceholders(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER_RE)) {
    names.add(m[1]!.trim());
  }
  return [...names];
}
