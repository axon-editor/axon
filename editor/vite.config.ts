import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  // Packaged Electron loads the renderer from file://, not from a web server.
  // Vite's default "/" asset base makes index.html request /assets/... from
  // the filesystem root, which leaves the packaged app on a blank screen. A
  // relative base keeps JS, CSS, workers, and fonts next to index.html in both
  // local production builds and signed/unsigned release artifacts.
  base: "./",
  plugins: [react(), tailwindcss()],
  root: "src/renderer",
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
  },
});
