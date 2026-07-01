import { app, BrowserWindow } from "electron";
import { getClientId } from "./api";
import { exchangeCodeForTokens } from "./auth";

interface SpotifyProtocolDependencies {
  sendToRenderer: (channel: string, payload?: unknown) => void;
}

function isSpotifyCallbackUrl(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname === "spotify-callback";
  } catch {
    return false;
  }
}

async function exchangeSpotifyCallbackCode(rawUrl: string) {
  const parsedUrl = new URL(rawUrl);
  if (parsedUrl.hostname !== "spotify-callback") return false;

  const code = parsedUrl.searchParams.get("code");
  if (!code) return false;

  const clientId = getClientId();
  if (!clientId) return false;

  await exchangeCodeForTokens(clientId, code);
  return true;
}

export function registerSpotifyProtocolClient() {
  // Axon owns axon:// links so Spotify can redirect OAuth back to the desktop
  // app. This registration must stay in the main process because the OS routes
  // custom protocol URLs to the app bundle, not to the renderer.
  app.setAsDefaultProtocolClient("axon");
}

export function registerSpotifyOpenUrlHandler({
  sendToRenderer,
}: SpotifyProtocolDependencies) {
  // macOS delivers axon://spotify-callback as an open-url app event. This has
  // to be registered before app.whenReady because OAuth callbacks can arrive
  // while Electron is still booting.
  app.on("open-url", async (event, openedUrl) => {
    event.preventDefault();
    if (!isSpotifyCallbackUrl(openedUrl)) return;

    try {
      const exchanged = await exchangeSpotifyCallbackCode(openedUrl);
      if (!exchanged) return;

      const window = BrowserWindow.getAllWindows().find((candidate) => {
        return !candidate.isDestroyed() && !candidate.webContents.isDestroyed();
      });
      if (window) {
        try {
          window.webContents.send("spotify:connected");
        } catch {
          sendToRenderer("spotify:connected");
        }
      } else {
        sendToRenderer("spotify:connected");
      }
    } catch (err) {
      console.error("[spotify] open-url token exchange failed:", err);
    }
  });
}

export async function handleSpotifySecondInstanceArg(
  argv: string[],
  { sendToRenderer }: SpotifyProtocolDependencies,
) {
  const deepLink = argv.find((arg) => isSpotifyCallbackUrl(arg));
  if (!deepLink) return false;

  try {
    const exchanged = await exchangeSpotifyCallbackCode(deepLink);
    if (exchanged) sendToRenderer("spotify:connected");
  } catch (err) {
    console.error("[spotify] second-instance token exchange failed:", err);
  }

  return true;
}

export async function handleSpotifyProtocolRequest(
  requestUrl: URL,
  { sendToRenderer }: SpotifyProtocolDependencies,
) {
  if (requestUrl.hostname !== "spotify-callback") return null;

  try {
    const exchanged = await exchangeSpotifyCallbackCode(requestUrl.toString());
    if (exchanged) sendToRenderer("spotify:connected");
  } catch (err) {
    console.error("[spotify] token exchange failed:", err);
  }

  // The system browser opened this redirect. Returning a tiny close page keeps
  // the browser from showing an unknown-protocol error after Axon has already
  // stored the token.
  return new Response(
    `<html><head><title>Axon</title></head><body>
      <script>window.close()</script>
      <p style="font-family:sans-serif;color:#888;text-align:center;margin-top:40px">
        Connected to Spotify. You can close this tab.
      </p>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
