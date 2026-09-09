import Foundation
import SystemSettingsKit

@available(macOS 13.0, *)
public enum PermissionFlowPane: String, CaseIterable, Codable, Sendable {
  case appManagement
  case accessibility
  case bluetooth
  case developerTools
  case fullDiskAccess
  case inputMonitoring
  case mediaAppleMusic
  case microphone
  case screenRecording

  public var privacyAnchor: PrivacySecurityAnchor {
    switch self {
    case .appManagement:
      return .privacyAppBundles
    case .accessibility:
      return .privacyAccessibility
    case .bluetooth:
      return .privacyBluetooth
    case .developerTools:
      return .privacyDevTools
    case .fullDiskAccess:
      return .privacyAllFiles
    case .inputMonitoring:
      return .privacyListenEvent
    case .mediaAppleMusic:
      return .privacyMedia
    case .microphone:
      return .privacyMicrophone
    case .screenRecording:
      return .privacyScreenCapture
    }
  }

  public var supportsFloatingAuthorizationPanel: Bool {
    self != .microphone
  }

  public var settingsURL: URL {
    SystemSettingsDestination.privacy(anchor: privacyAnchor).url
  }

  func localizedTitle(localeIdentifier: String?) -> String {
    let key: String
    switch self {
    case .appManagement:
      key = "permission_flow.pane.app_management"
    case .accessibility:
      key = "permission_flow.pane.accessibility"
    case .bluetooth:
      key = "permission_flow.pane.bluetooth"
    case .developerTools:
      key = "permission_flow.pane.developer_tools"
    case .fullDiskAccess:
      key = "permission_flow.pane.full_disk_access"
    case .inputMonitoring:
      key = "permission_flow.pane.input_monitoring"
    case .mediaAppleMusic:
      key = "permission_flow.pane.media_apple_music"
    case .microphone:
      key = "permission_flow.pane.microphone"
    case .screenRecording:
      key = "permission_flow.pane.screen_recording"
    }
    return PermissionFlowLocalizer.string(
      key,
      fallback: rawValue,
      localeIdentifier: localeIdentifier
    )
  }
}
