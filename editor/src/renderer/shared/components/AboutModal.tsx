import { useEffect, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { publicAsset } from "../lib/assets";
import CommandModal from "./CommandModal";
import { type UpdateInfo } from "../../../shared/updates";

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
}

interface AboutModalProps {
  updateInfo: UpdateInfo | null;
  onOpenUpdatePage: () => void;
  onClose: () => void;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--axon-panel-border)] py-2 last:border-b-0">
      <span className="text-[11px] uppercase tracking-normal text-[var(--axon-editor-foreground)] opacity-45">
        {label}
      </span>
      <span className="text-[12px] text-[var(--axon-editor-foreground)]">{value}</span>
    </div>
  );
}

export default function AboutModal({
  updateInfo,
  onOpenUpdatePage,
  onClose,
}: AboutModalProps) {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.axon
      .getAppInfo()
      .then(setAppInfo)
      .catch((err) => {
        console.error("failed to load app info:", err);
      });
  }, []);

  const versionText = appInfo
    ? [
        `${appInfo.name} ${appInfo.version}`,
        `Electron ${appInfo.electron}`,
        `Chrome ${appInfo.chrome}`,
        `Node ${appInfo.node}`,
        `Platform ${appInfo.platform}`,
      ].join("\n")
    : "Axon";

  const handleCopy = async () => {
    await window.axon.copyText(versionText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <CommandModal title="about axon" onClose={onClose} width="w-[460px]">
      <div className="p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)]">
            <img
              src={publicAsset("axon.png")}
              alt=""
              className="h-11 w-11 object-contain"
              draggable={false}
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold leading-tight text-[var(--axon-editor-foreground)]">
              Axon
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-65">
              A focused editor workspace built around panes, terminals, themes,
              and local project flow.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3">
          <InfoRow label="version" value={appInfo?.version ?? "loading..."} />
          {updateInfo?.updateAvailable ? (
            <InfoRow label="latest" value={updateInfo.latestVersion} />
          ) : null}
          <InfoRow
            label="electron"
            value={appInfo?.electron ?? "loading..."}
          />
          <InfoRow label="chrome" value={appInfo?.chrome ?? "loading..."} />
          <InfoRow label="node" value={appInfo?.node ?? "loading..."} />
          <InfoRow label="platform" value={appInfo?.platform ?? "loading..."} />
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-[var(--axon-panel-border)] pt-4">
          <span className="text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
            {updateInfo?.updateAvailable
              ? "A newer Axon release is available."
              : "Axon is current."}
          </span>
          <div className="flex items-center gap-2">
            {updateInfo?.updateAvailable ? (
              <button
                type="button"
                onClick={onOpenUpdatePage}
                className="flex h-8 cursor-pointer items-center gap-2 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-3 text-[12px] text-[var(--axon-syntax-function)] transition-colors hover:border-[var(--axon-syntax-function)] hover:bg-[var(--axon-panel-overlay-hover)]"
              >
                <Download size={13} />
                update
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleCopy}
              className="flex h-8 cursor-pointer items-center gap-2 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:border-[var(--axon-syntax-function)] hover:bg-[var(--axon-panel-overlay-hover)]"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "copied" : "copy info"}
            </button>
          </div>
        </div>
      </div>
    </CommandModal>
  );
}
