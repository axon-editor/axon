import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const fontDirectory = path.resolve(
  scriptDirectory,
  "..",
  "dist",
  "renderer",
  "fonts",
  "monaspace-nerd",
);
const keptWeights = new Set(["Regular", "Bold"]);

try {
  const entries = await fs.readdir(fontDirectory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile()) return;
      const weight = /-([^-]+)\.otf$/i.exec(entry.name)?.[1] ?? "";
      if (keptWeights.has(weight)) return;
      await fs.rm(path.join(fontDirectory, entry.name));
    }),
  );
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
