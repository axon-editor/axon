import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
} from "lucide-react";
import { type HtmlPreviewTarget } from "@axon-editor/shared/htmlPreview";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";

interface Props {
  filePath: string;
  folderPath: string | null;
}

interface DevicePreset {
  id: string;
  label: string;
  width: number | null;
  height: number | null;
  icon: typeof Monitor;
}

const DEVICE_PRESETS: DevicePreset[] = [
  { id: "responsive", label: "Responsive", width: null, height: null, icon: Monitor },
  { id: "phone", label: "Phone", width: 390, height: 844, icon: Smartphone },
  { id: "tablet", label: "Tablet", width: 820, height: 1180, icon: Tablet },
  { id: "desktop", label: "Desktop", width: 1440, height: 900, icon: Monitor },
];

export default function HtmlPreview({ filePath, folderPath }: Props) {
  const [target, setTarget] = useState<HtmlPreviewTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [deviceId, setDeviceId] = useState("responsive");

  const device = useMemo(
    () =>
      DEVICE_PRESETS.find((preset) => preset.id === deviceId) ??
      DEVICE_PRESETS[0],
    [deviceId],
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTarget(null);

    window.axon
      .getHtmlPreviewTarget(filePath, folderPath)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok || !result.target) {
          setError(result.message ?? "HTML preview could not start.");
          return;
        }
        setTarget(result.target);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "HTML preview could not start.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, folderPath]);

  const previewUrl = useMemo(() => {
    if (!target) return "";
    const separator = target.url.includes("?") ? "&" : "?";
    return `${target.url}${separator}axonReload=${reloadNonce}`;
  }, [target, reloadNonce]);

  const openInBrowser = async () => {
    try {
      const result = await window.axon.openHtmlPreviewInBrowser(
        filePath,
        folderPath,
      );
      if (!result.ok) setError(result.message ?? "Could not open preview.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not open preview.",
      );
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--axon-editor-background)]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-3">
        <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--axon-editor-foreground)] opacity-55">
          {filePath}
        </span>
        <div className="flex items-center rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-0.5">
          {DEVICE_PRESETS.map((preset) => {
            const Icon = preset.icon;
            return (
              <Tooltip key={preset.id} label={preset.label} side="bottom">
                <button
                  type="button"
                  aria-label={preset.label}
                  onClick={() => setDeviceId(preset.id)}
                  className={`flex h-7 w-8 cursor-pointer items-center justify-center rounded transition-colors ${
                    preset.id === device.id
                      ? "bg-[var(--axon-syntax-function)] text-[var(--axon-editor-background)]"
                      : "text-[var(--axon-editor-foreground)] opacity-55 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
                  }`}
                >
                  <Icon size={14} />
                </button>
              </Tooltip>
            );
          })}
        </div>
        <Tooltip label="Reload preview" side="bottom">
          <button
            type="button"
            aria-label="Reload preview"
            onClick={() => setReloadNonce((value) => value + 1)}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <RefreshCw size={14} />
          </button>
        </Tooltip>
        <Tooltip label="Open in browser" side="bottom">
          <button
            type="button"
            aria-label="Open in browser"
            onClick={() => void openInBrowser()}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <ExternalLink size={14} />
          </button>
        </Tooltip>
      </div>

      {error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-60">
          {error}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto bg-[var(--axon-editor-background)] p-4">
          <div
            className="mx-auto h-full min-h-[320px] overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-white shadow-[0_18px_50px_rgba(0,0,0,0.28)]"
            style={{
              width: device.width ? `${device.width}px` : "100%",
              height: device.height ? `${device.height}px` : "100%",
              maxWidth: "100%",
            }}
          >
            {previewUrl ? (
              <iframe
                key={previewUrl}
                title="HTML preview"
                src={previewUrl}
                className="h-full w-full bg-white"
                // The iframe is pointed at Axon's localhost preview server.
                // Scripts need to run so real pages behave normally, but the
                // page still stays isolated from the Electron renderer and can
                // only report console output through the injected preview API.
                sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
                preparing preview...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
