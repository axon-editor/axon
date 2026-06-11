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
  // The renderer lives under src/renderer, but Axon's static assets live at
  // editor/public so they can be shared by the app icon, release packaging, and
  // the file-tree icon system. Without this explicit publicDir, Vite looks for
  // src/renderer/public during clean GitHub builds, which means packaged apps
  // can boot with missing Catppuccin SVGs even though a local dist folder still
  // appears to have them from an older build.
  publicDir: path.resolve(__dirname, "public"),
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
  },
  define: {
    "process.env.SPOTIFY_CLIENT_ID": JSON.stringify(
      process.env.SPOTIFY_CLIENT_ID ?? "",
    ),
  },
});
