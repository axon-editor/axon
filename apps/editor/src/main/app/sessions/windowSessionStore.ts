import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { app, ipcMain } from "electron";

interface StoredWindowSession {
  updatedAt: number;
  value: unknown;
}

interface StoredWindowSessions {
  lastSessionId: string | null;
  sessions: Record<string, StoredWindowSession>;
  version: 1;
}

const MAX_SAVED_WINDOW_SESSIONS = 10;
const MAX_SESSION_BYTES = 2 * 1024 * 1024;

function emptyStore(): StoredWindowSessions {
  return { lastSessionId: null, sessions: {}, version: 1 };
}

export class WindowSessionStore {
  private readonly sessionIdByRenderer = new Map<number, string>();
  private stored: StoredWindowSessions | null = null;

  constructor(
    private readonly storagePath = path.join(
      app.getPath("userData"),
      "window-sessions.json",
    ),
    private readonly now: () => number = Date.now,
  ) {}

  assignRenderer(rendererId: number, restore: boolean) {
    const stored = this.loadStore();
    const restorableId = stored.lastSessionId;
    const sessionId =
      restore && restorableId && stored.sessions[restorableId]
        ? restorableId
        : randomUUID();
    this.sessionIdByRenderer.set(rendererId, sessionId);
    return sessionId;
  }

  load(rendererId: number) {
    const sessionId = this.requireSessionId(rendererId);
    return this.loadStore().sessions[sessionId]?.value ?? null;
  }

  save(rendererId: number, value: unknown) {
    if (!value || typeof value !== "object") {
      throw new Error("Window session must be an object.");
    }
    const serializedValue = JSON.stringify(value);
    if (Buffer.byteLength(serializedValue, "utf8") > MAX_SESSION_BYTES) {
      throw new Error("Window session is too large to persist.");
    }

    const sessionId = this.requireSessionId(rendererId);
    const stored = this.loadStore();
    stored.sessions[sessionId] = { updatedAt: this.now(), value };
    stored.lastSessionId = sessionId;

    // Closed windows can leave useful restore points, but an unlimited history
    // would let layout metadata grow forever. Keeping the most recent entries
    // preserves multi-window continuity while bounding the app-owned file.
    const retainedIds = Object.entries(stored.sessions)
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
      .slice(0, MAX_SAVED_WINDOW_SESSIONS)
      .map(([id]) => id);
    const retained = new Set(retainedIds);
    for (const id of Object.keys(stored.sessions)) {
      if (!retained.has(id)) delete stored.sessions[id];
    }
    this.persist();
  }

  clear(rendererId: number) {
    const sessionId = this.requireSessionId(rendererId);
    const stored = this.loadStore();
    delete stored.sessions[sessionId];
    if (stored.lastSessionId === sessionId) {
      stored.lastSessionId =
        Object.entries(stored.sessions).sort(
          (left, right) => right[1].updatedAt - left[1].updatedAt,
        )[0]?.[0] ?? null;
    }
    this.persist();
  }

  releaseRenderer(rendererId: number) {
    this.sessionIdByRenderer.delete(rendererId);
  }

  private requireSessionId(rendererId: number) {
    const sessionId = this.sessionIdByRenderer.get(rendererId);
    if (!sessionId) throw new Error("Window session is not registered.");
    return sessionId;
  }

  private loadStore() {
    if (this.stored) return this.stored;
    try {
      const parsed = JSON.parse(
        fs.readFileSync(this.storagePath, "utf8"),
      ) as Partial<StoredWindowSessions>;
      this.stored = {
        lastSessionId:
          typeof parsed.lastSessionId === "string"
            ? parsed.lastSessionId
            : null,
        sessions:
          parsed.sessions && typeof parsed.sessions === "object"
            ? parsed.sessions
            : {},
        version: 1,
      };
    } catch {
      this.stored = emptyStore();
    }
    return this.stored;
  }

  private persist() {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    const temporaryPath = `${this.storagePath}.tmp`;
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify(this.loadStore(), null, 2),
      "utf8",
    );
    fs.renameSync(temporaryPath, this.storagePath);
  }
}

export function registerWindowSessionHandlers(store: WindowSessionStore) {
  ipcMain.handle("session:load", (event) => store.load(event.sender.id));
  ipcMain.handle("session:save", (event, value: unknown) =>
    store.save(event.sender.id, value),
  );
  ipcMain.handle("session:clear", (event) => store.clear(event.sender.id));
}
