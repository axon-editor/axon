// Reusable modal shell used by CommandPalette, FolderPicker, and OpenFile.
// Renders a centered overlay with a consistent dark style.
// Children render inside the modal body.
// Closes on outside click or Escape key.
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface Props {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}

export default function CommandModal({
  title,
  onClose,
  children,
  width = "w-[560px]",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      <div
        ref={ref}
        className={`${width} bg-[#14161e] border border-[#222838] rounded-lg shadow-2xl overflow-hidden`}
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#222838]">
            <span className="text-[12px] text-[#9aa4b8] font-medium">
              {title}
            </span>
            <button
              onClick={onClose}
              className="text-[#586478] hover:text-white transition-colors cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
