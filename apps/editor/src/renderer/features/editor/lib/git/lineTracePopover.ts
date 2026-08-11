import { type GitBlameLine } from "@axon-editor/shared/git";

export interface LineTracePopover {
  dispose: () => void;
  hide: () => void;
  update: (line: GitBlameLine) => void;
}

function setPosition(
  popover: HTMLDivElement,
  clientX: number,
  clientY: number,
) {
  const gap = 12;
  const viewportPadding = 10;
  const bounds = popover.getBoundingClientRect();
  const availableRight = window.innerWidth - clientX - gap;
  const availableBelow = window.innerHeight - clientY - gap;
  const left =
    availableRight >= bounds.width
      ? clientX + gap
      : clientX - bounds.width - gap;
  const top =
    availableBelow >= bounds.height
      ? clientY + gap
      : clientY - bounds.height - gap;

  popover.style.left = `${Math.max(
    viewportPadding,
    Math.min(left, window.innerWidth - bounds.width - viewportPadding),
  )}px`;
  popover.style.top = `${Math.max(
    viewportPadding,
    Math.min(top, window.innerHeight - bounds.height - viewportPadding),
  )}px`;
}

export function createLineTracePopover(
  anchor: HTMLSpanElement,
): LineTracePopover {
  const popover = document.createElement("div");
  const identity = document.createElement("div");
  const avatar = document.createElement("img");
  const author = document.createElement("div");
  const summary = document.createElement("div");
  const metadata = document.createElement("div");
  popover.className = "axon-line-trace-popover";
  popover.setAttribute("role", "tooltip");
  identity.className = "axon-line-trace-popover__identity";
  avatar.className = "axon-line-trace-popover__avatar";
  avatar.alt = "";
  const hideAvatar = () => {
    avatar.hidden = true;
  };
  avatar.addEventListener("error", hideAvatar);
  author.className = "axon-line-trace-popover__author";
  summary.className = "axon-line-trace-popover__summary";
  metadata.className = "axon-line-trace-popover__metadata";
  identity.append(avatar, author);
  popover.append(identity, summary, metadata);
  document.body.appendChild(popover);

  let hoverTimer: number | null = null;
  let pointerOverAnchor = false;
  let pointerPosition = { x: 0, y: 0 };
  const hide = () => {
    pointerOverAnchor = false;
    if (hoverTimer !== null) window.clearTimeout(hoverTimer);
    hoverTimer = null;
    delete popover.dataset.visible;
  };
  const show = (event: MouseEvent) => {
    pointerOverAnchor = true;
    pointerPosition = { x: event.clientX, y: event.clientY };
    if (hoverTimer !== null) window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => {
      hoverTimer = null;
      if (!pointerOverAnchor || !anchor.isConnected) return;
      popover.dataset.visible = "true";
      setPosition(popover, pointerPosition.x, pointerPosition.y);
    }, 2_000);
  };
  const move = (event: MouseEvent) => {
    pointerPosition = { x: event.clientX, y: event.clientY };
    if (popover.dataset.visible !== "true") return;
    setPosition(popover, event.clientX, event.clientY);
  };
  const trackDocumentPointer = (event: MouseEvent) => {
    if (!pointerOverAnchor && hoverTimer === null) return;
    const target = event.target;
    if (target instanceof Node && anchor.contains(target)) return;

    // Monaco can detach or relocate a content widget while the pointer is on
    // it. Browsers do not guarantee a mouseleave event for a detached node, so
    // the document-level pointer check closes a popover that would otherwise
    // remain stranded over the editor.
    hide();
  };
  const hideWhenDocumentIsHidden = () => {
    if (document.visibilityState !== "visible") hide();
  };

  anchor.addEventListener("mouseenter", show);
  anchor.addEventListener("mousemove", move);
  anchor.addEventListener("mouseleave", hide);
  document.addEventListener("mousemove", trackDocumentPointer, true);
  document.addEventListener("visibilitychange", hideWhenDocumentIsHidden);
  window.addEventListener("blur", hide);
  window.addEventListener("scroll", hide, true);

  return {
    update(line) {
      if (line.authorAvatarUrl) {
        avatar.src = line.authorAvatarUrl;
        avatar.hidden = false;
      } else {
        avatar.removeAttribute("src");
        avatar.hidden = true;
      }
      author.textContent = line.authorEmail
        ? `${line.authorName || "Unknown author"} <${line.authorEmail}>`
        : line.authorName || "Unknown author";
      summary.textContent = line.summary || "No commit summary";
      const committedAt =
        line.authorTime > 0
          ? new Date(line.authorTime * 1000).toLocaleString()
          : "Unknown date";
      metadata.textContent = `${line.shortHash} · ${committedAt}`;
    },
    hide,
    dispose() {
      hide();
      anchor.removeEventListener("mouseenter", show);
      anchor.removeEventListener("mousemove", move);
      anchor.removeEventListener("mouseleave", hide);
      document.removeEventListener("mousemove", trackDocumentPointer, true);
      document.removeEventListener(
        "visibilitychange",
        hideWhenDocumentIsHidden,
      );
      window.removeEventListener("blur", hide);
      window.removeEventListener("scroll", hide, true);
      avatar.removeEventListener("error", hideAvatar);
      popover.remove();
    },
  };
}
