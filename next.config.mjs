/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // pdfjs-dist (via pdf-parse) loads font/cmap data files at runtime; Vercel's
    // serverless file-tracing drops them by default → empty text extraction.
    // Force them into the bundles of routes that parse PDFs.
    outputFileTracingIncludes: {
      "/api/cron/gmail": ["./node_modules/pdf-parse/**", "./node_modules/pdfjs-dist/**"],
      "/dashboard/inbox": ["./node_modules/pdf-parse/**", "./node_modules/pdfjs-dist/**"],
    },
  },
};

export default nextConfig;
