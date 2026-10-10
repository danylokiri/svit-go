import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  server: {
    // Forward API calls to the Express backend so the app works behind a
    // single public tunnel (cloudflared/ngrok) — one origin, no CORS.
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
    },
    // Accept requests with a *.trycloudflare.com / ngrok Host header.
    allowedHosts: true,
  },
  plugins: [
    react(),
    // Service Worker + manifest — turns SvitGo into an installable PWA.
    // - registerType: "autoUpdate" pulls a new SW silently after deploy
    // - workbox precaches the JS/CSS shell so a repeat visitor with no
    //   network still sees the home page (then APIs fail gracefully)
    // - runtimeCaching adds a stale-while-revalidate strategy for tour
    //   images so they stay instant after first view
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "logo.svg", "logo-full.svg"],
      manifest: {
        name: "SvitGo — AI travel agent",
        short_name: "SvitGo",
        description: "Find your dream trip in 30 seconds.",
        theme_color: "#5B8FF9",
        background_color: "#FBF6EE",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        // Don't precache the world.json blob — it's heavy and loads lazily.
        globIgnores: ["**/world.json"],
        runtimeCaching: [
          // Tour images — cache-first, 30 days
          {
            urlPattern: /\/tours\/.*\.(webp|jpg|jpeg|png)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "tour-images",
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * 86400 },
            },
          },
          // GET /api/tours/map-data — stale-while-revalidate, 1h
          {
            urlPattern: /\/api\/tours\/map-data$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "map-data",
              expiration: { maxAgeSeconds: 3600 },
            },
          },
          // Google Fonts — long cache, immutable
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxAgeSeconds: 365 * 86400 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
