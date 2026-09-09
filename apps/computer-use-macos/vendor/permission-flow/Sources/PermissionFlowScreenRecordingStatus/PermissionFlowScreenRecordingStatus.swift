import PermissionFlow

@available(macOS 13.0, *)
@MainActor
public enum PermissionFlowScreenRecordingStatus {
  public static func register() {
    PermissionStatusRegistry.register(
      provider: ScreenRecordingPermissionStatusProvider(),
      for: .screenRecording
    )
  }
}
