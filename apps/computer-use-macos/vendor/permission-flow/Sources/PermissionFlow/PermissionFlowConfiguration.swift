import Foundation

@available(macOS 13.0, *)
public struct PermissionFlowConfiguration: Sendable {
  public var requiredAppURLs: [URL]
  public var promptForAccessibilityTrust: Bool
  public var localeIdentifier: String?

  public init(
    requiredAppURLs: [URL] = [],
    promptForAccessibilityTrust: Bool = false,
    localeIdentifier: String? = nil
  ) {
    self.requiredAppURLs = requiredAppURLs
    self.promptForAccessibilityTrust = promptForAccessibilityTrust
    self.localeIdentifier = localeIdentifier
  }
}
