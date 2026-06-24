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

export default nextConfig;
