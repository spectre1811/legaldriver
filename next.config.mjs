import createNextIntlPlugin from "next-intl/plugin";

// next-intl (WO-03) — no i18n routing; request config resolves locale per request.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Ensure unpdf's bundled pdfjs build is traced into the serverless functions
    // that parse PDFs (Gmail ingest cron + the inbox demo-ingest action).
    outputFileTracingIncludes: {
      "/api/cron/gmail": ["./node_modules/unpdf/**"],
      "/dashboard/inbox": ["./node_modules/unpdf/**"],
    },
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
      { source: "/dashboard/lookup", destination: "/dashboard/search/directory", permanent: true },
      { source: "/dashboard/research", destination: "/dashboard/search/judgments", permanent: true },
      { source: "/dashboard/research/judgment", destination: "/dashboard/search/judgments/judgment", permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
