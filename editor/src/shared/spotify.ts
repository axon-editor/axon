// Spotify feature shared contracts, IPC payload types used by both
// the main process handlers and the renderer. Keeping them here means
// neither side has to guess at the shape of a response.

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
}

export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  images: SpotifyImage[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  uri: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: SpotifyImage[];
  tracks: { total: number };
  uri: string;
  owner: { display_name: string };
}

export interface SpotifyPlaybackState {
  is_playing: boolean;
  progress_ms: number;
  item: SpotifyTrack | null;
  device: {
    id: string;
    name: string;
    type: string;
    volume_percent: number;
  } | null;
  shuffle_state: boolean;
  repeat_state: "off" | "track" | "context";
  context: { uri: string; type: string } | null;
}

export interface SpotifyDevice {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
}

export interface SpotifyDevicesResult {
  ok: boolean;
  devices: SpotifyDevice[];
  message?: string;
}

export interface SpotifyPlaylistTracksResult {
  items: SpotifyTrack[];
  total: number;
  next: string | null;
}

export interface SpotifyAuthResult {
  ok: boolean;
  message: string;
}

export interface SpotifyStatusResult {
  connected: boolean;
  configured: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface SpotifyPlaylistsResult {
  ok: boolean;
  playlists: SpotifyPlaylist[];
  message?: string;
}

export interface SpotifyPlaybackResult {
  ok: boolean;
  state: SpotifyPlaybackState | null;
  message?: string;
}

export interface SpotifyActionResult {
  ok: boolean;
  message: string;
}

export interface SpotifyPlayTrackRequest {
  trackUri?: string;
  contextUri?: string;
  deviceId?: string | null;
}
