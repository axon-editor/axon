import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";

const workspaceRoot = path.resolve(__dirname, "..", "..");
const editorNodeModules = path.resolve(__dirname, "node_modules");
const workspaceNodeModules = path.resolve(workspaceRoot, "node_modules");

function dependencyPath(...segments: string[]) {
  const editorPath = path.resolve(editorNodeModules, ...segments);
  if (fs.existsSync(editorPath)) return editorPath;

  // npm workspaces are allowed to hoist direct dependencies to the repository
  // root. Vite resolves aliases before Node's normal package lookup can climb
  // parent folders, so a hardcoded app-level node_modules path makes renderer
  // builds depend on the exact local install layout. Falling back to the
  // workspace node_modules keeps dev, CI, and release installs using the same
  // dependency contract.
  return path.resolve(workspaceNodeModules, ...segments);
}

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
      "@axon-builtin-search": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "search",
        "workbench",
      ),
      "@axon-builtin-markdown": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "markdown",
        "workbench",
      ),
      "@axon-builtin-html-preview": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "html-preview",
        "workbench",
      ),
      "@axon-builtin-media-preview": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "media-preview",
        "workbench",
      ),
      "@axon-builtin-tasks": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "tasks",
        "workbench",
      ),
      "@axon-builtin-spotify": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "spotify",
        "workbench",
      ),
      "@axon-builtin-language-tools": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "language-tools",
        "workbench",
      ),
      "@axon-builtin-settings": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "settings",
        "workbench",
      ),
      "@axon-builtin-git": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "git",
        "workbench",
      ),
      "@axon-builtin-testing": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "testing",
        "workbench",
      ),
      "@axon-builtin-debugger": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "debugger",
        "workbench",
      ),
      "@axon-builtin-problems": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "problems",
        "workbench",
      ),
      "@axon/protocol": path.resolve(
        workspaceNodeModules,
        "@axon",
        "protocol",
        "dist",
        "index.js",
      ),
      "@xterm/addon-canvas": dependencyPath(
        "@xterm",
        "addon-canvas",
        "lib",
        "addon-canvas.js",
      ),
      "@xterm/addon-fit": dependencyPath(
        "@xterm",
        "addon-fit",
        "lib",
        "addon-fit.js",
      ),
      "@xterm/addon-web-links": dependencyPath(
        "@xterm",
        "addon-web-links",
        "lib",
        "addon-web-links.js",
      ),
      "@xterm/xterm": dependencyPath("@xterm", "xterm"),
      "@monaco-editor/react": dependencyPath(
        "@monaco-editor",
        "react",
        "dist",
        "index.mjs",
      ),
      "monaco-editor": dependencyPath("monaco-editor"),
      "lucide-react": dependencyPath(
        "lucide-react",
        "dist",
        "esm",
        "lucide-react.mjs",
      ),
      react: dependencyPath("react"),
      "react-dom": path.resolve(
        workspaceNodeModules,
        "react-dom",
      ),
      "react-dom/client": path.resolve(
        workspaceNodeModules,
        "react-dom",
        "client.js",
      ),
      "react/jsx-runtime": path.resolve(
        workspaceNodeModules,
        "react",
        "jsx-runtime.js",
      ),
      "react-markdown": dependencyPath("react-markdown", "index.js"),
      "rehype-raw": dependencyPath("rehype-raw", "index.js"),
      "remark-gfm": dependencyPath("remark-gfm", "index.js"),
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
        path.resolve(__dirname, "node_modules"),
        workspaceNodeModules,
        path.resolve(__dirname, "..", "..", "extensions", "builtin"),
      ],
    },
  },
  optimizeDeps: {
    // Monaco worker entrypoints are not normal ESM dependencies in Axon. The
    // renderer imports them with `?worker` so Vite returns a Worker constructor
    // as the default export. If dev pre-bundling optimizes Monaco into
    // node_modules/.vite/deps first, Chromium receives the optimized worker
    // module directly and startup fails with "does not provide an export named
    // default", leaving Electron on the boot splash. Excluding Monaco keeps the
    // worker plugin in control of those imports.
    exclude: ["monaco-editor"],
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
