// WO-27 Wave 3 — a tiny, zero-dependency ZIP writer (STORE method, no compression).
//
// Why hand-rolled: the export needs to hand the user ONE file (a real archive), not open N
// browser tabs (popup-blocker hell). Adding jszip/archiver would change the shared, 8-worktree
// package-lock — friction we avoid. Legal documents are overwhelmingly PDFs/images that are
// already compressed, so STORE (no DEFLATE) costs almost nothing and keeps the format simple
// enough to be fully unit-tested (CRC32 vectors + real `unzip -t` validation).
//
// Format ref: PKWARE APPNOTE — Local File Header (0x04034b50), Central Directory (0x02014b50),
// End Of Central Directory (0x06054b50). We set the UTF-8 name flag (bit 11) and omit data
// descriptors (sizes are known up front), which keeps every offset deterministic.

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array };

// DOS date/time encoding (used verbatim in both headers). Defaults to a fixed timestamp so the
// output is deterministic for tests; callers may pass `new Date()` in production for a real mtime.
function dosDateTime(d: Date): { time: number; date: number } {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

// Build a complete ZIP archive from in-memory entries. Names are stored UTF-8; duplicate names are
// de-collided with a numeric suffix so an archive is never silently missing a file.
export function buildZip(entries: ZipEntry[], mtime: Date = new Date(1980, 0, 1, 0, 0, 0)): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(mtime);
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const seen = new Map<string, number>();

  for (const entry of entries) {
    let name = entry.name;
    const dup = seen.get(name);
    if (dup !== undefined) { seen.set(entry.name, dup + 1); const dot = name.lastIndexOf("."); const base = dot > 0 ? name.slice(0, dot) : name; const ext = dot > 0 ? name.slice(dot) : ""; name = `${base} (${dup + 1})${ext}`; }
    else seen.set(name, 0);

    const nameBytes = enc.encode(name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header (30 bytes + name).
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);      // version needed
    lv.setUint16(6, 0x0800, true);  // flags: UTF-8 name
    lv.setUint16(8, 0, true);       // method: store
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);   // compressed size (= size for store)
    lv.setUint32(22, size, true);   // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);      // extra length
    local.set(nameBytes, 30);
    chunks.push(local, entry.data);

    // Central directory record (46 bytes + name).
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);      // version made by
    cv.setUint16(6, 20, true);      // version needed
    cv.setUint16(8, 0x0800, true);  // flags: UTF-8 name
    cv.setUint16(10, 0, true);      // method
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);      // extra length
    cv.setUint16(32, 0, true);      // comment length
    cv.setUint16(34, 0, true);      // disk number start
    cv.setUint16(36, 0, true);      // internal attrs
    cv.setUint32(38, 0, true);      // external attrs
    cv.setUint32(42, offset, true); // local header offset
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + size;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const centralOffset = offset;

  // End of central directory (22 bytes, no comment).
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);        // disk number
  ev.setUint16(6, 0, true);        // disk with central dir
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);
  ev.setUint16(20, 0, true);       // comment length

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  for (const c of central) { out.set(c, p); p += c.length; }
  out.set(eocd, p);
  return out;
}
