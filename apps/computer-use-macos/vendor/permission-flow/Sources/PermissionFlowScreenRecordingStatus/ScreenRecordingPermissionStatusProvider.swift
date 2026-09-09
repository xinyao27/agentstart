import CoreGraphics
import PermissionFlow

@available(macOS 13.0, *)
public struct ScreenRecordingPermissionStatusProvider: PermissionStatusProviding {
  public var capability: PermissionStatusCapability { .preflightSupported }

  public init() {}

  public func authorizationState() -> PermissionAuthorizationState {
    CGPreflightScreenCaptureAccess() ? .granted : .notGranted
  }
}
