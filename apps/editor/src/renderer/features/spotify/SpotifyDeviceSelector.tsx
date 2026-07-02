// Small Spotify Connect device picker for the sidebar and player surfaces.
// Device IDs are session-scoped, so the component only displays live devices
// from Spotify and leaves persistence to Spotify itself.
import { RefreshCw, Speaker } from "lucide-react";
import type { SpotifyDevice } from "../../../shared/spotify";
import Tooltip from "../../shared/components/Tooltip";
import SearchSelect, { type SearchSelectItem } from "../../../base/components/SearchSelect";

interface Props {
  devices: SpotifyDevice[];
  selectedDeviceId: string | null;
  loading: boolean;
  compact?: boolean;
  onSelectDevice: (deviceId: string | null) => void;
  onRefreshDevices: () => Promise<void>;
}

function deviceLabel(device: SpotifyDevice) {
  return `${device.name}${device.is_active ? " active" : ""}`;
}

const NO_DEVICE_VALUE = "__none";

export default function SpotifyDeviceSelector({
  devices,
  selectedDeviceId,
  loading,
  compact = false,
  onSelectDevice,
  onRefreshDevices,
}: Props) {
  const selectableDevices = devices.filter(
    (device) => device.id && !device.is_restricted,
  );
  const items: SearchSelectItem<string>[] = selectableDevices.map((device) => ({
      value: device.id ?? NO_DEVICE_VALUE,
      label: deviceLabel(device),
      description: device.type,
    }));
  const placeholder =
    selectableDevices.length > 0
      ? "Choose device"
      : loading
        ? "Loading devices"
        : "Open Spotify on a device";

  return (
    <div
      className={`flex items-center gap-2 ${compact ? "px-0" : "px-3 py-2"}`}
    >
      <Speaker size={12} className="shrink-0 text-[#586478]" />
      <div className="min-w-0 flex-1">
        <SearchSelect
          value={selectedDeviceId ?? NO_DEVICE_VALUE}
          items={items}
          onChange={(value) =>
            onSelectDevice(value === NO_DEVICE_VALUE ? null : value)
          }
          ariaLabel="Spotify playback device"
          placeholder={placeholder}
          emptyLabel={loading ? "Loading devices" : "No devices found"}
        />
      </div>
      <Tooltip label="Refresh Spotify devices" side="top">
        <button
          type="button"
          onClick={() => void onRefreshDevices()}
          aria-label="Refresh Spotify devices"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#151923] hover:text-[#1db954]"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </Tooltip>
    </div>
  );
}
