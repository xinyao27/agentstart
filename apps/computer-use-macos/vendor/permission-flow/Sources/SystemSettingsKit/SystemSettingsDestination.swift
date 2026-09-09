import Foundation

@available(macOS 13.0, *)
public enum PrivacySecurityAnchor: String, CaseIterable, Sendable {
  case privacyAccessibility = "Privacy_Accessibility"
  case privacyAllFiles = "Privacy_AllFiles"
  case privacyAppBundles = "Privacy_AppBundles"
  case privacyBluetooth = "Privacy_Bluetooth"
  case privacyDevTools = "Privacy_DevTools"
  case privacyListenEvent = "Privacy_ListenEvent"
  case privacyMedia = "Privacy_Media"
  case privacyMicrophone = "Privacy_Microphone"
  case privacyScreenCapture = "Privacy_ScreenCapture"
}

@available(macOS 13.0, *)
public struct SystemSettingsDestination: Hashable, Sendable {
  public let url: URL
  public let paneIdentifier: String?
  public let anchor: String?

  public init(url: URL, paneIdentifier: String? = nil, anchor: String? = nil) {
    self.url = url
    self.paneIdentifier = paneIdentifier
    self.anchor = anchor
  }

  public init(paneIdentifier: String, anchor: String? = nil) {
    let encodedAnchor = anchor?.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)
    let value: String
    if let encodedAnchor, !encodedAnchor.isEmpty {
      value = "x-apple.systempreferences:\(paneIdentifier)?\(encodedAnchor)"
    } else {
      value = "x-apple.systempreferences:\(paneIdentifier)"
    }
    self.init(
      url: URL(string: value)!,
      paneIdentifier: paneIdentifier,
      anchor: anchor
    )
  }

  public static func privacy(anchor: PrivacySecurityAnchor) -> Self {
    Self(
      paneIdentifier: "com.apple.settings.PrivacySecurity.extension",
      anchor: anchor.rawValue
    )
  }
}
