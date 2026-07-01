export function createHtmlPreviewClientScript(serverId: string) {
  const encodedServerId = JSON.stringify(serverId);

  return `
<script data-axon-html-preview>
(() => {
  const serverId = ${encodedServerId};
  const send = (payload) => {
    fetch("/__axon_preview/console", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serverId, ...payload }),
    }).catch(() => {});
  };
  const format = (value) => {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  };
  ["log", "info", "warn", "error"].forEach((level) => {
    const original = console[level];
    console[level] = (...args) => {
      original.apply(console, args);
      send({ level, message: args.map(format).join(" "), source: location.href });
    };
  });
  window.addEventListener("error", (event) => {
    const target = event.target;
    if (target && target !== window && "tagName" in target) {
      const source = target.src || target.href || "";
      send({ level: "error", message: "Failed to load " + target.tagName.toLowerCase(), source });
      return;
    }
    send({
      level: "error",
      message: event.message || "Runtime error",
      source: event.filename || location.href,
      line: event.lineno,
      column: event.colno,
    });
  }, true);
  window.addEventListener("unhandledrejection", (event) => {
    send({ level: "error", message: "Unhandled promise rejection: " + format(event.reason), source: location.href });
  });
  const events = new EventSource("/__axon_preview/events");
  events.onmessage = () => location.reload();
})();
</script>`;
}

export function injectHtmlPreviewClient(html: string, serverId: string) {
  const script = createHtmlPreviewClientScript(serverId);
  if (html.includes("data-axon-html-preview")) return html;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${script}</head>`);
  }
  if (html.includes("</body>")) {
    return html.replace("</body>", `${script}</body>`);
  }
  return `${html}${script}`;
}
