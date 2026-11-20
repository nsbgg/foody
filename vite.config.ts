import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      includeAssets: [
        "icon.svg",
        "icon-192.png",
        "icon-512.png",
        "icon-maskable.png",
      ],
      manifest: {
        name: "Foodie – Gemeinsam gut essen",
        short_name: "Foodie",
        description: "Wochenplan, Rezeptstapel und Kochmodus",
        lang: "de",
        theme_color: "#256347",
        background_color: "#f5f7f4",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png,woff2}"] },
    }),
  ],
  server: {
    proxy: {
      // Preserve the browser's authority so the backend's same-origin check
      // also works for writes forwarded through the development server.
      "/api": { target: "http://127.0.0.1:4307", changeOrigin: false },
    },
  },
});
