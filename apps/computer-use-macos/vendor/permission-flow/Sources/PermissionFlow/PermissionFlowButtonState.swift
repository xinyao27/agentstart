import Foundation
import AgentStartComputerUseIcons

@available(macOS 13.0, *)
public struct PermissionFlowButtonState: Equatable, Sendable {
  public let titleKey: String
  public let icon: AgentStartComputerUseIconID
  public let isGranted: Bool

  public init(titleKey: String, icon: AgentStartComputerUseIconID, isGranted: Bool) {
    self.titleKey = titleKey
    self.icon = icon
    self.isGranted = isGranted
  }

  public static func make(from state: PermissionAuthorizationState) -> Self {
    switch state {
    case .granted:
      return .init(
        titleKey: "permission_flow.button.granted",
        icon: .granted,
        isGranted: true
      )
    case .notGranted:
      return .init(
        titleKey: "permission_flow.button.grant",
        icon: .forward,
        isGranted: false
      )
    case .unknown:
      return .init(
        titleKey: "permission_flow.button.open",
        icon: .forward,
        isGranted: false
      )
    case .checking:
      return .init(
        titleKey: "permission_flow.button.checking",
        icon: .pending,
        isGranted: false
      )
    }
  }
}
