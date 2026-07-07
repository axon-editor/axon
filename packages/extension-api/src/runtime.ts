/// <reference lib="es2022" />

export interface Disposable {
  dispose(): void;
}

export interface ExtensionContext {
  extensionId: string;
  extensionPath: string;
  globalStoragePath: string;
  workspaceStoragePath: string | null;
  subscriptions: Disposable[];
}

export interface CommandRegistry {
  registerCommand(
    commandId: string,
    handler: (...args: unknown[]) => unknown | Promise<unknown>,
  ): Disposable;
  executeCommand<T = unknown>(commandId: string, ...args: unknown[]): Promise<T>;
}

export interface ViewRegistry {
  registerSidebarView(viewId: string, provider: ExtensionViewProvider): Disposable;
  registerPanelView(viewId: string, provider: ExtensionViewProvider): Disposable;
}

export interface ExtensionViewProvider {
  render(surface: ExtensionViewSurface): void | Disposable;
}

export interface ExtensionViewSurface {
  mount(element: unknown): void;
  unmount(): void;
}

export interface TerminalRegistry {
  registerTerminalProfile(
    profileId: string,
    provider: ExtensionTerminalProfileProvider,
  ): Disposable;
}

export interface ExtensionTerminalProfileProvider {
  createProfile(): ExtensionTerminalProfile | Promise<ExtensionTerminalProfile>;
}

export interface ExtensionTerminalProfile {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface DebugRegistry {
  registerDebugProvider(
    debugType: string,
    provider: ExtensionDebugProvider,
  ): Disposable;
}

export interface ExtensionDebugProvider {
  resolveConfiguration(
    configuration: Record<string, unknown>,
  ): Record<string, unknown> | Promise<Record<string, unknown>>;
}

export interface WorkspaceIndexRegistry {
  registerWorkspaceIndexProvider(
    providerId: string,
    provider: ExtensionWorkspaceIndexProvider,
  ): Disposable;
}

export interface ExtensionWorkspaceIndexProvider {
  indexWorkspace(request: ExtensionWorkspaceIndexRequest): Promise<void> | void;
}

export interface ExtensionWorkspaceIndexRequest {
  workspacePath: string;
  signal?: AbortSignal;
}

export interface AxonExtensionApi {
  commands: CommandRegistry;
  views: ViewRegistry;
  terminals: TerminalRegistry;
  debug: DebugRegistry;
  workspace: WorkspaceIndexRegistry;
}

export interface AxonExtensionModule {
  activate?(
    context: ExtensionContext,
    api: AxonExtensionApi,
  ): void | Disposable | Promise<void | Disposable>;
  deactivate?(): void | Promise<void>;
}
