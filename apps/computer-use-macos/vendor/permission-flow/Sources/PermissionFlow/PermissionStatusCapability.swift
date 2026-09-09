import Foundation

@available(macOS 13.0, *)
public enum PermissionStatusCapability: String, CaseIterable, Codable, Sendable {
  case preflightSupported
  case unsupported
}
