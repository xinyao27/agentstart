import Foundation

@available(macOS 13.0, *)
public enum PermissionFlow {
  @MainActor
  public static func makeController(
    configuration: PermissionFlowConfiguration = .init()
  ) -> PermissionFlowController {
    PermissionFlowController(configuration: configuration)
  }
}
