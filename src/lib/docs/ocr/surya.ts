import type { OcrProvider, OcrResult } from "./types";

// SOTA self-hosted OCR: Surya (open-source, 90+ languages incl. Devanagari/Gujarati,
// strong on real-world scans). Zero per-page cost, bytes stay on-box — the quality
// tier that replaces a paid cloud OCR. Gated on a configured CLI so it never runs
// unless the worker box actually has Surya installed:
//   SURYA_OCR_CMD   e.g. "surya_ocr"  (unset → provider disabled, returns null)
// We write the input to a temp file, run `<cmd> <file> --output_dir <tmp>`, and read
// Surya's results.json (map of name → pages[] → text_lines[] → {text, confidence}).
// Parsing is defensive: we collect every `text`/`confidence` under any `text_lines`.

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CMD = () => process.env.SURYA_OCR_CMD;

function run(cmd: string, args: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(cmd, args, { stdio: "ignore" }); } catch { resolve(false); return; }
    const t = setTimeout(() => { child.kill("SIGKILL"); resolve(false); }, timeoutMs);
    child.on("error", () => { clearTimeout(t); resolve(false); });
    child.on("close", (code) => { clearTimeout(t); resolve(code === 0); });
  });
}

// Recursively pull {text, confidence} from any object containing text_lines.
function collect(node: unknown, out: { text: string; conf: number[] }) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) collect(n, out); return; }
  const obj = node as Record<string, unknown>;
  const lines = obj.text_lines;
  if (Array.isArray(lines)) {
    for (const l of lines as Record<string, unknown>[]) {
      if (typeof l.text === "string" && l.text.trim()) out.text += (out.text ? "\n" : "") + l.text.trim();
      if (typeof l.confidence === "number") out.conf.push(l.confidence);
    }
  }
  for (const v of Object.values(obj)) collect(v, out);
}

export const suryaProvider: OcrProvider = {
  name: "surya",
  async ocr(buf, mime): Promise<OcrResult | null> {
    const cmd = CMD();
    if (!cmd) return null;
    let dir: string | null = null;
    try {
      dir = await mkdtemp(path.join(os.tmpdir(), "surya-"));
      const ext = mime === "application/pdf" ? "pdf" : (mime.split("/")[1] || "png");
      const inFile = path.join(dir, `in.${ext}`);
      const outDir = path.join(dir, "out");
      await writeFile(inFile, buf);
      const ok = await run(cmd, [inFile, "--output_dir", outDir], Number(process.env.SURYA_TIMEOUT_MS ?? "240000"));
      if (!ok) return null;

      // Find the results.json Surya wrote (usually out/<stem>/results.json).
      const found: string[] = [];
      async function walk(d: string) {
        for (const e of await readdir(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) await walk(p);
          else if (e.name.endsWith(".json")) found.push(p);
        }
      }
      await walk(outDir).catch(() => {});
      if (!found.length) return null;

      const acc = { text: "", conf: [] as number[] };
      for (const f of found) {
        try { collect(JSON.parse(await readFile(f, "utf8")), acc); } catch { /* skip bad json */ }
      }
      const text = acc.text.trim();
      if (!text) return null;
      const confidence = acc.conf.length ? Math.max(0, Math.min(1, acc.conf.reduce((a, b) => a + b, 0) / acc.conf.length)) : 0.85;
      return { text, langs: [], confidence };
    } catch {
      return null;
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  },
};
