(() => {
    const parameters = new URLSearchParams(window.location.search);
    const colors = [
        ["--axon-boot-background", parameters.get("axonBootBackground")],
        ["--axon-boot-foreground", parameters.get("axonBootForeground")],
        ["--axon-boot-accent", parameters.get("axonBootAccent")],
    ];

    for (const [property, value] of colors) {
        if (!value || !/^#[0-9a-f]{6}$/i.test(value)) continue;
        document.documentElement.style.setProperty(property, value);
    }

    const appearance = parameters.get("axonBootAppearance");
    if (appearance === "dark" || appearance === "light") {
        document.documentElement.style.colorScheme = appearance;
    }
})();
