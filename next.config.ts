import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: blob: http:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https: http:",
      "font-src 'self' https://fonts.gstatic.com data: https: http:",
      "img-src 'self' data: blob: https: http:",
      "connect-src 'self' https: http: wss: ws: *",
      "frame-ancestors *",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  crossOrigin: "anonymous",
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,
  // Next.js 14.2+ / 15 / 16 cross-origin dev origins
  allowedDevOrigins: [
    "*.run.app",
    "*.asia-east1.run.app",
    "*.googleusercontent.com",
    "localhost:3000",
    "127.0.0.1:3000",
    "ais-dev-asxab7wvyaat7aqdxjgbyk-358816037326.asia-east1.run.app",
    "ais-pre-asxab7wvyaat7aqdxjgbyk-358816037326.asia-east1.run.app",
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "*.run.app",
        "*.asia-east1.run.app",
        "*.googleusercontent.com",
        "localhost:3000",
        "127.0.0.1:3000",
        "ais-dev-asxab7wvyaat7aqdxjgbyk-358816037326.asia-east1.run.app",
        "ais-pre-asxab7wvyaat7aqdxjgbyk-358816037326.asia-east1.run.app",
      ],
    },
  },
  async headers() {
    return [
      {
        source: "/_next/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "*" },
        ],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
