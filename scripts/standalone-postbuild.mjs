// WO-323 · Assemble a runnable `output:'standalone'` bundle for the self-hosted box.
//
// `next build` with `output:'standalone'` emits `.next/standalone/server.js` but does NOT copy the
// static assets or `public/` into it. Off Vercel we run `node .next/standalone/server.js` directly,
// so the assets must sit where the server expects them: `.next/standalone/.next/static` and
// `.next/standalone/public`. Run this right after `next build` (see the `build:standalone` script);
// the deploy pipeline tars the result. `outputFileTracingIncludes` (next.config) already traces the
// native deps (unpdf/canvas) into the standalone bundle — this only adds the browser-served assets.
import { cpSync, existsSync } from "node:fs";

const S = ".next/standalone";
if (!existsSync(`${S}/server.js`)) {
  console.error(`[standalone] ${S}/server.js missing — is output:'standalone' set and did next build run?`);
  process.exit(1);
}
cpSync(".next/static", `${S}/.next/static`, { recursive: true });
if (existsSync("public")) cpSync("public", `${S}/public`, { recursive: true });
console.log("[standalone] copied .next/static + public into .next/standalone");
