/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import SettingsField from "../controls/SettingsField";
import SettingsSection from "../controls/SettingsSection";
import SettingsToggle from "../controls/SettingsToggle";

// macOS-only page for the Finder Sync extension. The toggle is not part of the
// settings draft because it is a direct IPC call, not a persisted AxonSettings
// field: the switch writes the small JSON preference the extension reads on
// every context-menu open, so changes take effect without a restart. On
// non-macOS surfaces the whole page renders nothing (the IPC still answers,
// but the packaged app only ever embeds the extension inside the mac bundle).
export default function FinderSettingsSection() {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.axon
      .getFinderSyncEnabled()
      .then((value) => {
        if (cancelled) return;
        setEnabled(value);
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not read the Finder preference.",
        );
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    setError(null);
    window.axon
      .setFinderSyncEnabled(next)
      .then((saved) => setEnabled(saved))
      .catch((err) => {
        setEnabled(previous);
        setError(
          err instanceof Error ? err.message : "Could not save the Finder preference.",
        );
      });
  };

  return (
    <SettingsSection>
      <SettingsField
        rowKey="finder-open-in-axon"
        label="Open folders in Axon from the Finder"
        description='Adds an "Open in Axon" item to the Finder context menu for folders. Applies to the packaged app; the first time, enable the Axon extension under System Settings > General > Login Items & Extensions.'
      >
        {error ? (
          <div className="text-[11px] text-[var(--axon-danger-foreground)]">{error}</div>
        ) : (
          <SettingsToggle
            checked={enabled}
            disabled={!ready}
            onChange={handleChange}
            label={enabled ? "Added to the Finder menu" : "Not shown in the Finder menu"}
          />
        )}
      </SettingsField>
    </SettingsSection>
  );
}