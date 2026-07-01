import { type ExtensionInfo } from "@axon/extension-api";

export interface ExtensionRuntimeSummary {
  executableCount: number;
  declarativeCount: number;
  mode: "declarative" | "isolated-process";
  message: string;
}

export function summarizeExtensionRuntime(
  extensions: ExtensionInfo[],
): ExtensionRuntimeSummary {
  const executableCount = extensions.filter(
    (extension) => extension.hostKind === "isolated-process" && extension.enabled,
  ).length;
  const declarativeCount = extensions.filter(
    (extension) => extension.hostKind === "declarative" && extension.enabled,
  ).length;

  // This is the first executable-extension wiring point. Axon now separates
  // declarative manifests from packages that declare a `main` entry, so the host
  // can route those packages into an isolated runtime instead of pretending they
  // are just metadata. The actual process sandbox can build on this summary
  // without changing extension discovery again.
  return {
    executableCount,
    declarativeCount,
    mode: executableCount > 0 ? "isolated-process" : "declarative",
    message:
      executableCount > 0
        ? `${executableCount} executable extension package${executableCount === 1 ? "" : "s"} registered for isolated activation.`
        : "Declarative extension contributions are active.",
  };
}
