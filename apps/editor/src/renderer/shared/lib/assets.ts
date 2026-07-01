// Vite serves public assets from the configured base path. In development that
// base is "/", but the packaged Electron app loads index.html from file:// and
// uses "./" so assets must be resolved relative to the built renderer folder.
//
// Keeping this in one helper prevents components from accidentally hardcoding
// root-relative paths like /axon.png again, which work in dev but disappear in
// release builds because file:///axon.png points at the filesystem root.
export function publicAsset(path: string) {
  const base = import.meta.env.BASE_URL || "./";
  const cleanBase = base.endsWith("/") ? base : `${base}/`;
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;

  return `${cleanBase}${cleanPath}`;
}

