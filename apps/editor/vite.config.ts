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
  resolve: {
    alias: {
      "@axon-editor": path.resolve(__dirname, "src"),
      "@axon-builtin-terminal": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "terminal",
        "workbench",
      ),
      "@axon-builtin-agent": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "agent",
        "workbench",
      ),
      "@axon/protocol": path.resolve(
        __dirname,
        "..",
        "..",
        "node_modules",
        "@axon",
        "protocol",
        "dist",
        "index.js",
      ),
      "@xterm/addon-fit": path.resolve(
        __dirname,
        "node_modules",
        "@xterm",
        "addon-fit",
        "lib",
        "addon-fit.js",
      ),
      "@xterm/addon-web-links": path.resolve(
        __dirname,
        "node_modules",
        "@xterm",
        "addon-web-links",
        "lib",
        "addon-web-links.js",
      ),
      "@xterm/xterm": path.resolve(
        __dirname,
        "node_modules",
        "@xterm",
        "xterm",
      ),
      "lucide-react": path.resolve(
        __dirname,
        "node_modules",
        "lucide-react",
        "dist",
        "esm",
        "lucide-react.mjs",
      ),
      react: path.resolve(__dirname, "node_modules", "react"),
      "react/jsx-runtime": path.resolve(
        __dirname,
        "node_modules",
        "react",
        "jsx-runtime.js",
      ),
      "react-markdown": path.resolve(
        __dirname,
        "node_modules",
        "react-markdown",
        "index.js",
      ),
      "remark-gfm": path.resolve(
        __dirname,
        "node_modules",
        "remark-gfm",
        "index.js",
      ),
    },
  },
  server: {
    fs: {
      // The renderer entry still lives in src/renderer because index.html and
      // browser-only assets are rooted there, but production IDE modules now
      // live beside it in src/workbench and src/platform. Vite's dev server
      // enforces a filesystem allow-list when serving transformed modules, so
      // without allowing src as a whole the Electron window can load the static
      // splash while the imported workbench module is refused before React
      // mounts.
      allow: [
        path.resolve(__dirname, "src"),
        path.resolve(__dirname, "..", "..", "extensions", "builtin"),
      ],
    },
  },
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
