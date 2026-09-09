import Foundation

@available(macOS 13.0, *)
enum PermissionFlowLocalizer {
  static func string(
    _ key: String,
    fallback: String,
    localeIdentifier: String?
  ) -> String {
    let bundle = localizedBundle(localeIdentifier: localeIdentifier) ?? .main
    return bundle.localizedString(forKey: key, value: fallback, table: nil)
  }

  private static func localizedBundle(localeIdentifier: String?) -> Bundle? {
    guard let localeIdentifier else { return nil }
    let languageCode = Locale(identifier: localeIdentifier).language.languageCode?.identifier
    let candidates = [localeIdentifier, languageCode].compactMap { $0 }
    for candidate in candidates {
      guard let path = Bundle.main.path(forResource: candidate, ofType: "lproj") else {
        continue
      }
      if let bundle = Bundle(path: path) {
        return bundle
      }
    }
    return nil
  }
}
