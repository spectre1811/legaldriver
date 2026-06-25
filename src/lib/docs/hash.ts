import { createHash } from "crypto";

// Content hash for document dedup. App-level dedup keys on (tenant_id, content_hash).
// Node crypto only — server runtime; do not import from client components.
export async function sha256Hex(bytes: ArrayBuffer | Uint8Array | Buffer): Promise<string> {
  const buf =
    bytes instanceof Buffer
      ? bytes
      : bytes instanceof Uint8Array
        ? Buffer.from(bytes)
        : Buffer.from(new Uint8Array(bytes));
  return createHash("sha256").update(buf).digest("hex");
}
