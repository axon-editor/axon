import { type GitBlameLine } from "../../../../shared/git";

export interface LineTracePopover {
  dispose: () => void;
  update: (line: GitBlameLine) => void;
}

function setPosition(popover: HTMLDivElement, clientX: number, clientY: number) {
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
  let pointerPosition = { x: 0, y: 0 };
  const show = (event: MouseEvent) => {
    pointerPosition = { x: event.clientX, y: event.clientY };
    if (hoverTimer !== null) window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => {
      hoverTimer = null;
      popover.dataset.visible = "true";
      setPosition(popover, pointerPosition.x, pointerPosition.y);
    }, 2_000);
  };
  const move = (event: MouseEvent) => {
    pointerPosition = { x: event.clientX, y: event.clientY };
    if (popover.dataset.visible !== "true") return;
    setPosition(popover, event.clientX, event.clientY);
  };
  const hide = () => {
    if (hoverTimer !== null) window.clearTimeout(hoverTimer);
    hoverTimer = null;
    delete popover.dataset.visible;
  };

  anchor.addEventListener("mouseenter", show);
  anchor.addEventListener("mousemove", move);
  anchor.addEventListener("mouseleave", hide);

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
    dispose() {
      if (hoverTimer !== null) window.clearTimeout(hoverTimer);
      anchor.removeEventListener("mouseenter", show);
      anchor.removeEventListener("mousemove", move);
      anchor.removeEventListener("mouseleave", hide);
      avatar.removeEventListener("error", hideAvatar);
      popover.remove();
    },
  };
}
