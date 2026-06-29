import { spawn } from "node:child_process";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Local inference via the Claude Code CLI (`claude -p`), using the machine's
// OAuth credentials instead of a paid ANTHROPIC_API_KEY. Used as the classifier
// backend when no API key is set and the binary is available (local/self-hosted).
//
// Deliberate security posture: this runs IN-PROCESS in our trusted server only —
// NOT behind a public HTTP endpoint. Exposing a general "shell out to Claude
// Code" endpoint would be an RCE surface (Claude Code can run Bash/Write). So we
// (a) keep it in-process, (b) disable tools, (c) use a minimal system prompt,
// (d) drop ANTHROPIC_API_KEY from the child env so OAuth creds are used,
// (e) time out + hard-kill, and (f) clean up the session transcript after.

const TOOL_DENYLIST = ["Bash", "Edit", "Write", "WebFetch", "WebSearch", "Task", "NotebookEdit", "Read", "Glob", "Grep"];

function extractJson(text: string): string | null {
  // Strip ```json fences if present, then take the outermost { ... }.
  const fenced = text.replace(/```(?:json)?/gi, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return fenced.slice(start, end + 1);
}

async function cleanupSession(sessionId: string, cwd: string) {
  try {
    const encoded = cwd.replace(/\//g, "-");
    const file = path.join(os.homedir(), ".claude", "projects", encoded, `${sessionId}.jsonl`);
    await unlink(file);
  } catch {
    // best-effort; a leftover transcript is harmless
  }
}

export function claudeCliEnabled(): boolean {
  return (process.env.CLASSIFIER_BACKEND ?? "auto") !== "off";
}

// Shared runner: returns the model's raw result text (the `result` field of the
// CLI's JSON envelope), or null on any failure. Tools disabled, OAuth creds, timeout.
function runClaudeCli(prompt: string, opts?: { model?: string; timeoutMs?: number; system?: string }): Promise<string | null> {
  const model = opts?.model ?? process.env.DOC_CLASSIFY_MODEL ?? "claude-haiku-4-5";
  const timeoutMs = opts?.timeoutMs ?? 90_000;
  const cwd = process.cwd();
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // force OAuth creds (an empty key would 401)
  const args = [
    "-p", "--output-format", "json", "--model", model,
    "--system-prompt", opts?.system ?? "You are a strict JSON document classifier. Output ONLY one JSON object — no markdown, no code fences, no prose.",
    "--disallowed-tools", ...TOOL_DENYLIST,
  ];
  return new Promise((resolve) => {
    let child;
    try { child = spawn("claude", args, { env, cwd }); } catch { resolve(null); return; }
    let out = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(null); }, timeoutMs);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("error", () => { clearTimeout(timer); resolve(null); });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const env2 = JSON.parse(out) as { result?: string; session_id?: string; is_error?: boolean };
        if (env2.session_id) void cleanupSession(env2.session_id, cwd);
        resolve(env2.is_error || !env2.result ? null : env2.result);
      } catch { resolve(null); }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// Raw JSON string the model produced, or null. (Strict-JSON system prompt + extract.)
export async function claudeCliJson(prompt: string, opts?: { model?: string; timeoutMs?: number }): Promise<string | null> {
  const result = await runClaudeCli(prompt, opts);
  return result ? extractJson(result) : null;
}

// Prose/long-form output (e.g. drafting) — no JSON constraint. Longer default timeout.
export async function claudeCliText(prompt: string, opts?: { model?: string; timeoutMs?: number }): Promise<string | null> {
  return runClaudeCli(prompt, { model: opts?.model, timeoutMs: opts?.timeoutMs ?? 180_000, system: "You are a careful Indian legal assistant. Follow the user's instructions precisely. Output only the requested content." });
}
