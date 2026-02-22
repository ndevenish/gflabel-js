/**
 * Environment detection and cross-platform helpers.
 */

export const isNode =
  typeof process !== "undefined" && process.versions?.node != null;

export async function loadArrayBuffer(path: string): Promise<ArrayBuffer> {
  if (isNode) {
    const { readFileSync } = await import("fs");
    const buf = readFileSync(path);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  return fetch(path).then((r) => r.arrayBuffer());
}
