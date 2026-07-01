// These constants keep extension contribution keys centralized. The manifest
// types already describe the shape, but app code still needs stable string
// names when it maps a manifest into menus, themes, language services, views,
// and future host activation events. Keeping the names here prevents the
// workbench from drifting into private aliases that third-party packages cannot
// know about.
export const AXON_CONTRIBUTION_POINTS = {
  commands: "commands",
  themes: "themes",
  iconThemes: "iconThemes",
  icons: "icons",
  languages: "languages",
  snippets: "snippets",
  views: "views",
  agents: "agents",
  terminalProfiles: "terminalProfiles",
  taskProviders: "taskProviders",
  debuggerProviders: "debuggerProviders",
  languagePacks: "languagePacks",
} as const;

export type AxonContributionPoint =
  (typeof AXON_CONTRIBUTION_POINTS)[keyof typeof AXON_CONTRIBUTION_POINTS];

// These roots describe where the host should look, not where extension authors
// must edit their code. A package can be authored at the repository root, copied
// into the marketplace root for listing, then installed into the user root as a
// stable runtime snapshot.
export const AXON_EXTENSION_REGISTRY_ROOTS = {
  builtin: "extensions/builtin",
  marketplace: "extensions/marketplace",
  user: "$userData/extensions",
  workspace: ".axon/extensions",
} as const;
