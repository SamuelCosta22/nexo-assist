import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  logging: {
    incomingRequests: {
      // Quiet the dev terminal: only the screens' background refreshes (polling) are
      // hidden; chat messages (POST), pages and errors are still logged.
      ignore: [
        /^\/api\/(console\/)?conversations(\/[^/]+)?(\/tickets)?$/,
        /^\/api\/conversations$/,
      ],
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // Cache Components / partial prefetching are intentionally OFF: every screen
  // is authenticated and per-user, so there is nothing safe to cache or
  // prerender. See "Decisões de arquitetura" in the README.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
