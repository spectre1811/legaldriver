import createNextIntlPlugin from "next-intl/plugin";
import { securityHeaders } from "./src/lib/security/headers.mjs";

// next-intl (WO-03) — no i18n routing; request config resolves locale per request.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // WO-142 W0: emit a self-contained server bundle for the standalone Docker image
  // (AWS/Fargate migration prep). Ignored by Vercel's build adapter, so it's a no-op
  // for the current Vercel deploy. Works with outputFileTracingIncludes below.
  output: "standalone",
  experimental: {
    // Ensure unpdf's bundled pdfjs build is traced into the serverless functions
    // that parse PDFs (Gmail ingest cron + the inbox demo-ingest action).
    outputFileTracingIncludes: {
      "/api/cron/gmail": ["./node_modules/unpdf/**"],
      "/dashboard/inbox": ["./node_modules/unpdf/**"],
    },
  },
  // WO-316 W1 · security headers on every response (HSTS, X-Frame-Options,
  // X-Content-Type-Options, Referrer-Policy) plus CSP in REPORT-ONLY mode — the
  // policy is observed before it is enforced, so nothing can break on the flip.
  // Values live in src/lib/security/headers.mjs so the test asserts the same objects.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
  // WO-31 surface consolidation: copilot+drafting merged into /dashboard/assistant
  // (Ask/Draft tabs); lookup+research merged into /dashboard/search (Directory/
  // Judgments tabs). Keep old deep links working — query strings (?thread=/?matter=/
  // ?q=/?judge=) and the :id param are preserved automatically.
  async redirects() {
    return [
      { source: "/dashboard/copilot", destination: "/dashboard/assistant/ask", permanent: true },
      { source: "/dashboard/draft", destination: "/dashboard/assistant/draft", permanent: true },
      { source: "/dashboard/draft/:id", destination: "/dashboard/assistant/draft/:id", permanent: true },
      { source: "/dashboard/lookup", destination: "/dashboard/directory", permanent: true },
      { source: "/dashboard/research", destination: "/dashboard/search/judgments", permanent: true },
      { source: "/dashboard/research/judgment", destination: "/dashboard/search/judgments/judgment", permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
