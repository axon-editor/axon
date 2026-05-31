// Renders a preview for image and video files instead of loading
// them into Monaco. Uses the axon:// custom protocol to load
// local files securely without file:// restrictions.
import { ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { useState } from "react";
import Tooltip from "../Tooltip";

interface Props {
  filePath: string;
}

const imageExtensions = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "tiff",
];
const videoExtensions = ["mp4", "webm", "mov", "avi", "mkv", "ogv"];

export function isMediaFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return imageExtensions.includes(ext) || videoExtensions.includes(ext);
}

export function isVideoFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return videoExtensions.includes(ext);
}

export default function MediaPreview({ filePath }: Props) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const isVideo = isVideoFile(filePath);
  const filename = filePath.split("/").pop() ?? filePath;

  // convert absolute path to axon:// protocol URL
  const src = `axon://local${filePath}`;

  return (
    <div className="w-full h-full flex flex-col bg-[#0e1018]">
      {!isVideo && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#222838] bg-[#0a0c12] shrink-0">
          <span className="text-[11px] text-[#586478] truncate flex-1">
            {filename}
          </span>
          <Tooltip label="Zoom in" side="bottom">
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
              aria-label="Zoom in"
              className="text-[#586478] hover:text-white transition-colors cursor-pointer p-1"
            >
              <ZoomIn size={13} />
            </button>
          </Tooltip>
          <Tooltip label="Zoom out" side="bottom">
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
              aria-label="Zoom out"
              className="text-[#586478] hover:text-white transition-colors cursor-pointer p-1"
            >
              <ZoomOut size={13} />
            </button>
          </Tooltip>
          <Tooltip label="Rotate" side="bottom">
            <button
              onClick={() => setRotation((r) => (r + 90) % 360)}
              aria-label="Rotate"
              className="text-[#586478] hover:text-white transition-colors cursor-pointer p-1"
            >
              <RotateCw size={13} />
            </button>
          </Tooltip>
          <span className="text-[11px] text-[#364050]">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      )}

      <div className="flex-1 overflow-auto flex items-center justify-center p-8">
        {isVideo ? (
          <video
            src={src}
            controls
            className="max-w-full max-h-full rounded"
            style={{ outline: "none" }}
          />
        ) : (
          <img
            src={src}
            alt={filename}
            draggable={false}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: "center",
              transition: "transform 0.15s ease",
              imageRendering: zoom > 2 ? "pixelated" : "auto",
              maxWidth: zoom <= 1 ? "100%" : "none",
              maxHeight: zoom <= 1 ? "100%" : "none",
            }}
          />
        )}
      </div>
    </div>
  );
}
