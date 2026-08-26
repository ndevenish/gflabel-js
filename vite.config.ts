import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Served from /<repo>/ on GitHub Pages, from / everywhere else.
  base: process.env.GITHUB_ACTIONS ? "/gflabel-js/" : "/",
  plugins: [react()],
  optimizeDeps: { exclude: ["replicad-opencascadejs"] },
  worker: { format: "es" },
  assetsInclude: ["**/*.wasm", "**/*.ttf"],
});
