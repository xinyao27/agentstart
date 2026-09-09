import AppKit
import Foundation

@available(macOS 13.0, *)
@MainActor
public enum SystemSettings {
  private static let bundleIdentifier = "com.apple.systempreferences"

  @discardableResult
  public static func open(_ destination: SystemSettingsDestination) -> Bool {
    open(url: destination.url)
  }

  @discardableResult
  public static func open(url: URL) -> Bool {
    if let applicationURL = NSWorkspace.shared.urlForApplication(
      withBundleIdentifier: bundleIdentifier
    ) {
      NSWorkspace.shared.openApplication(
        at: applicationURL,
        configuration: NSWorkspace.OpenConfiguration()
      )
    }
    let didOpen = NSWorkspace.shared.open(url)
    activate()
    return didOpen
  }

  public static func activate() {
    NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier)
      .first?
      .activate()
  }
}
