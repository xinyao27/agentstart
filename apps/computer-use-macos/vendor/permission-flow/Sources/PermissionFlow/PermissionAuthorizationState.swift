import Foundation

@available(macOS 13.0, *)
public enum PermissionAuthorizationState: String, CaseIterable, Codable, Sendable {
  case granted
  case notGranted
  case unknown
  case checking
}
