import AppKit
import FinderSync
import Foundation

// Axon's Finder Sync extension. It lives inside Axon.app/Contents/PlugIns and
// is loaded directly by the Finder. Unlike most extensions it has no host view;
// it exists to add an "Open in Axon" item to the Finder's context menu for
// folder selections, then hand the chosen folder to the running Axon app via
// the --axon-open-folder CLI argument that the normal open-file pipeline reads.
//
// Whether the menu item appears is decided at menu-open time by reading a small
// JSON preference the macOS settings page writes through IPC. That is what makes
// the toggle work at runtime: Launch Services cannot change the declared
// document types of a signed app, but the extension decides its own menu.

final class AxonFinderSync: FIFinderSync {
    // The main process writes this file into the user-data directory. Finder
    // Sync extensions are not sandboxed unless the developer opts in, so
    // reading the Application Support directory directly is fine. Both the
    // packaged profile (Axon) and the dev profile (Axon Development) are
    // probed so a dev machine can test the extension against a packaged app
    // without overwriting a released build's preference.
    private static let preferenceFileName = "finder-open-in-axon.json"

    private var preferenceFileURLs: [URL] {
        FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .flatMap { root in
                ["Axon", "Axon Development"].map {
                    root.appendingPathComponent($0).appendingPathComponent(
                        Self.preferenceFileName
                    )
                }
            }
    }

    private var isEnabled: Bool {
        // Missing preference means the feature is on: the extension ships
        // enabled so a fresh install gets the context menu item right away.
        let candidates = preferenceFileURLs
        for url in candidates {
            guard let data = try? Data(contentsOf: url) else { continue }
            guard let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                continue
            }
            if let enabled = payload["enabled"] as? Bool {
                return enabled
            }
        }
        return true
    }

    private var selectedFolderPath: String? {
        guard let url = FIFinderSyncController.default().selectedItemURLs()?.first else {
            return nil
        }
        let values = try? url.resourceValues(forKeys: [URLResourceKey.isDirectoryKey])
        guard values?.isDirectory == true else { return nil }
        return url.path
    }

    private var hostApplicationURL: URL? {
        let appexBundle = Bundle.main.bundleURL
        // Axon.app/Contents/PlugIns/AxonFinderSync.appex -> Axon.app
        let hostURL = appexBundle
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        if FileManager.default.fileExists(atPath: hostURL.path) {
            return hostURL
        }
        return NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.gorden.axon")
    }

    override func menu(for menu: FIMenuKind) -> NSMenu? {
        guard isEnabled, menu == .contextualMenuForItems, selectedFolderPath != nil else {
            return nil
        }

        let item = NSMenuItem(title: "Open in Axon", action: #selector(openInAxon(_:)), keyEquivalent: "")
        item.target = self

        let menuItems = NSMenu()
        menuItems.addItem(item)
        return menuItems
    }

    @objc private func openInAxon(_ sender: Any?) {
        guard let folderPath = selectedFolderPath, let hostURL = hostApplicationURL else {
            NSSound.beep()
            return
        }

        let configuration = NSWorkspace.OpenConfiguration()
        configuration.arguments = ["--axon-open-folder", folderPath]
        configuration.activates = true
        NSWorkspace.shared.openApplication(at: hostURL, configuration: configuration)
    }
}