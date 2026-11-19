import type { NextConfig } from "next";

// Browser security headers for every page. Camera, microphone and location are
// only for this site (live capture and "are you here" checks); no framing.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // Big static files (globe images, cursor, map worker) are cached by browsers for a day
    // and refreshed in the background for a week, so repeat visits load instantly.
    const longCache = [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/textures/:file*", headers: longCache },
      { source: "/cursors/:file*", headers: longCache },
      { source: "/maplibre-gl-worker.js", headers: longCache },
    ];
  },
  // Every page depends on who is signed in, so pages render per request.
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
