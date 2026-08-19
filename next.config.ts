import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https:",
      "font-src 'self' https://fonts.gstatic.com data: https:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https: wss: ws: *",
      "frame-ancestors *",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,
  experimental: {
    serverActions: {
      allowedOrigins: [
        "*.run.app",
        "*.asia-east1.run.app",
        "*.googleusercontent.com",
        "localhost:3000",
        "127.0.0.1:3000",
      ],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
