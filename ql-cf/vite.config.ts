import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["lynq-mark.svg", "lynq-icon-192.png", "lynq-icon-512.png"],
      manifest: {
        id: "/lyn-co/",
        name: "LynQ Staff & Admin",
        short_name: "LynQ",
        description: "LynQ staff and administration workspace.",
        start_url: "/lyn-co/login",
        scope: "/lyn-co/",
        display: "standalone",
        background_color: "#f3f3f3",
        theme_color: "#f3f3f3",
        icons: [
          {
            src: "/lynq-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/lynq-icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/lynq-mark.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
  },
});