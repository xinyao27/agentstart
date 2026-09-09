import SwiftUI

public enum YiruComputerUseIconID: String, CaseIterable, Hashable, Sendable {
  case settings
  case close
  case drag
  case dragDirection
  case accessibility
  case screenshots
  case granted
  case forward
  case pending
  case checkmark

  fileprivate var systemName: String {
    switch self {
    case .settings:
      "gearshape"
    case .close:
      "xmark.circle"
    case .drag:
      "hand.draw"
    case .dragDirection:
      "arrow.up"
    case .accessibility:
      "accessibility"
    case .screenshots:
      "camera"
    case .granted:
      "checkmark.seal"
    case .forward:
      "arrow.right.circle"
    case .pending:
      "clock"
    case .checkmark:
      "checkmark.circle"
    }
  }
}

@MainActor
public struct YiruComputerUseIcon: View {
  private let icon: YiruComputerUseIconID
  private let size: CGFloat

  public init(_ icon: YiruComputerUseIconID, size: CGFloat = 18) {
    self.icon = icon
    self.size = size
  }

  public var body: some View {
    Image(systemName: icon.systemName)
      .resizable()
      .scaledToFit()
      .frame(width: size, height: size)
  }
}
