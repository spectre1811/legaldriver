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
};

export default withNextIntl(nextConfig);
