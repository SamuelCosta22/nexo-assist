import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
