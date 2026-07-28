import {
  resolveFileIcon,
  resolveFolderIcon,
} from "./catppuccinIconMappings";
import { getCatppuccinIconAsset } from "./iconAssetPaths";

function SvgIcon({ src, size = 16 }: { src: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-block",
        backgroundColor: "currentColor",
        maskImage: `url("${src}")`,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: `url("${src}")`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

export function getFileIcon(filename: string, size = 16) {
  return (
    <SvgIcon src={getCatppuccinIconAsset(resolveFileIcon(filename))} size={size} />
  );
}

export function getFolderIcon(name: string, expanded: boolean, size = 16) {
  return (
    <SvgIcon
      src={getCatppuccinIconAsset(resolveFolderIcon(name, expanded))}
      size={size}
    />
  );
}
