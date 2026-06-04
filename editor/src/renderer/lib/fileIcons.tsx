import { publicAsset } from "./assets";
import {
  resolveFileIcon,
  resolveFolderIcon,
} from "./catppuccinIconMappings";

function SvgIcon({ src, size = 16 }: { src: string; size?: number }) {
  return (
    <img
      src={src}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-block",
      }}
      alt=""
    />
  );
}

const base = publicAsset("icons/");

export function getFileIcon(filename: string, size = 16) {
  return <SvgIcon src={`${base}${resolveFileIcon(filename)}`} size={size} />;
}

export function getFolderIcon(name: string, expanded: boolean, size = 16) {
  return (
    <SvgIcon src={`${base}${resolveFolderIcon(name, expanded)}`} size={size} />
  );
}
