import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import CommandModal from "./CommandModal";

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
}

interface AboutModalProps {
  onClose: () => void;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#1b2030] py-2 last:border-b-0">
      <span className="text-[11px] uppercase tracking-normal text-[#586478]">
        {label}
      </span>
      <span className="text-[12px] text-[#c8d0e0]">{value}</span>
    </div>
  );
}

export default function AboutModal({ onClose }: AboutModalProps) {
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
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-[#222838] bg-[#0a0c12]">
            <img
              src="/axon.png"
              alt=""
              className="h-11 w-11 object-contain"
              draggable={false}
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold leading-tight text-white">
              Axon
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-[#9aa4b8]">
              A focused editor workspace built around panes, terminals, themes,
              and local project flow.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-md border border-[#222838] bg-[#0a0c12] px-3">
          <InfoRow label="version" value={appInfo?.version ?? "loading..."} />
          <InfoRow
            label="electron"
            value={appInfo?.electron ?? "loading..."}
          />
          <InfoRow label="chrome" value={appInfo?.chrome ?? "loading..."} />
          <InfoRow label="node" value={appInfo?.node ?? "loading..."} />
          <InfoRow label="platform" value={appInfo?.platform ?? "loading..."} />
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-[#222838] pt-4">
          <span className="text-[11px] text-[#586478]">Axon</span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex h-8 items-center gap-2 rounded border border-[#222838] bg-[#14161e] px-3 text-[12px] text-[#c8d0e0] transition-colors hover:border-[#80c8e0] hover:text-white cursor-pointer"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "copied" : "copy info"}
          </button>
        </div>
      </div>
    </CommandModal>
  );
}
