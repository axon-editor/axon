export const AXON_WELCOME_TAB_PATH = "axon-welcome:";

const ONBOARDING_SEEN_KEY = "axon:onboardingSeen";

export function isWelcomeTabPath(tabPath: string) {
  return tabPath === AXON_WELCOME_TAB_PATH;
}

export function hasSeenAxonOnboarding() {
  return localStorage.getItem(ONBOARDING_SEEN_KEY) === "true";
}

export function markAxonOnboardingSeen() {
  // Onboarding is an app-level first-launch moment, not a workspace-level
  // restore state. Marking it as seen in localStorage keeps new folders,
  // switched workspace roots, CLI-opened folders, and stale sessions from
  // reopening the welcome tab after the user has already gone through it once.
  localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
}
