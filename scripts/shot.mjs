// WO-03 dev-only visual QA: screenshot a URL at 1440/768/390. Not shipped.
// Usage: node scripts/shot.mjs <path> <tag> [cookie]
import { chromium } from "playwright";

const path = process.argv[2] ?? "/_preview/today";
const tag = process.argv[3] ?? "today";
const cookie = process.argv[4];
const base = "http://localhost:3999";

const browser = await chromium.launch();
const ctx = await browser.newContext();
if (cookie) {
  const [name, value] = cookie.split("=");
  await ctx.addCookies([{ name, value, url: base }]);
}
for (const [w, h, bp] of [[1440, 900, "1440"], [768, 1024, "768"], [390, 844, "390"]]) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: w, height: h });
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/wo03_${tag}_${bp}.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log(`shots: /tmp/wo03_${tag}_{1440,768,390}.png`);
