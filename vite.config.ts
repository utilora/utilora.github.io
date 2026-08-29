import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  base: "/",
  publicDir: false,
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "tools", dest: "." },
        { src: "admin", dest: "." },
        { src: "account", dest: "." },
        { src: "login", dest: "." },
        { src: "feedback", dest: "." },
        { src: "policies", dest: "." },
        { src: "pro/app.js", dest: "pro" },
        { src: "pro/pro.css", dest: "pro" },
        { src: "assets", dest: "." },
        { src: "favicon.svg", dest: "." },
        { src: "icon-192.png", dest: "." },
        { src: "icon-512.png", dest: "." },
        { src: "robots.txt", dest: "." },
        { src: "sitemap.xml", dest: "." },
        { src: "site.webmanifest", dest: "." },
        { src: "sw.js", dest: "." },
        { src: "Utilora.url", dest: "." }
      ]
    })
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        pro: resolve(import.meta.dirname, "pro/index.html")
      }
    }
  },
  test: {
    environment: "jsdom",
    include: ["src/tests/**/*.test.ts"]
  }
});