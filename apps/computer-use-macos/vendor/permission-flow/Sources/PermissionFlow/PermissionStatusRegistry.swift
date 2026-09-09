import AVFoundation
import ApplicationServices
import Foundation

@available(macOS 13.0, *)
public protocol PermissionStatusProviding: Sendable {
  var capability: PermissionStatusCapability { get }
  func authorizationState() -> PermissionAuthorizationState
}

@available(macOS 13.0, *)
public struct AccessibilityPermissionStatusProvider: PermissionStatusProviding {
  public var capability: PermissionStatusCapability { .preflightSupported }

  public init() {}

  public func authorizationState() -> PermissionAuthorizationState {
    AXIsProcessTrusted() ? .granted : .notGranted
  }
}

@available(macOS 13.0, *)
public struct MicrophonePermissionStatusProvider: PermissionStatusProviding {
  public var capability: PermissionStatusCapability { .preflightSupported }

  public init() {}

  public func authorizationState() -> PermissionAuthorizationState {
    Self.authorizationState(for: AVCaptureDevice.authorizationStatus(for: .audio))
  }

  public func requestAuthorization(
    completion: @escaping @Sendable (PermissionAuthorizationState) -> Void
  ) {
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .audio) { isGranted in
        completion(isGranted ? .granted : .notGranted)
      }
    case let status:
      completion(Self.authorizationState(for: status))
    }
  }

  private static func authorizationState(
    for status: AVAuthorizationStatus
  ) -> PermissionAuthorizationState {
    switch status {
    case .authorized:
      return .granted
    case .denied, .restricted, .notDetermined:
      return .notGranted
    @unknown default:
      return .unknown
    }
  }
}

@available(macOS 13.0, *)
public struct UnsupportedPermissionStatusProvider: PermissionStatusProviding {
  public var capability: PermissionStatusCapability { .unsupported }

  public init() {}

  public func authorizationState() -> PermissionAuthorizationState {
    .unknown
  }
}

@available(macOS 13.0, *)
@MainActor
public enum PermissionStatusRegistry {
  private static var providers: [PermissionFlowPane: any PermissionStatusProviding] = [
    .accessibility: AccessibilityPermissionStatusProvider(),
    .microphone: MicrophonePermissionStatusProvider(),
  ]

  public static func register(
    provider: any PermissionStatusProviding,
    for pane: PermissionFlowPane
  ) {
    providers[pane] = provider
  }

  public static func provider(
    for pane: PermissionFlowPane
  ) -> any PermissionStatusProviding {
    providers[pane] ?? UnsupportedPermissionStatusProvider()
  }
}
