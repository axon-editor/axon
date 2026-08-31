(() => {
    function renderBootFailure(reason) {
        // This script executes before the renderer's module graph. A static
        // import or module-evaluation failure therefore cannot prevent this
        // handler from replacing the splash with an actionable error. Once
        // React owns the document, its normal boundaries and logging remain
        // responsible so a later recoverable error does not destroy the UI.
        if (document.body.classList.contains("axon-react-ready")) return;

        const root = document.getElementById("root");
        if (!root) return;

        const message =
            reason instanceof Error
                ? reason.message
                : typeof reason === "string" && reason.trim()
                  ? reason
                  : "The renderer failed before Axon could start.";
        const surface = document.createElement("div");
        const card = document.createElement("div");
        const title = document.createElement("div");
        const detail = document.createElement("div");

        surface.className = "axon-startup-failure";
        card.className = "axon-startup-failure__card";
        title.className = "axon-startup-failure__title";
        detail.className = "axon-startup-failure__message";
        title.textContent = "Axon could not load the renderer";
        detail.textContent = message;
        card.append(title, detail);
        surface.append(card);
        root.replaceChildren(surface);
    }

    window.addEventListener("error", (event) => {
        renderBootFailure(event.error ?? event.message);
    });
    window.addEventListener("unhandledrejection", (event) => {
        renderBootFailure(event.reason);
    });
})();
