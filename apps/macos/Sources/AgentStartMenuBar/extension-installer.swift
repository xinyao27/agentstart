import Foundation

struct FastExtensionInstallResult {
  let directory: URL
}

struct ExtensionInstaller {
  private let fileManager = FileManager.default

  func syncBundledExtension() throws -> FastExtensionInstallResult {
    guard let resourceRoot = Bundle.main.resourceURL else {
      throw ExtensionInstallerFailure.bundleResourcesUnavailable
    }
    let source = resourceRoot.appendingPathComponent("AgentStartExtension", isDirectory: true)
    guard fileManager.fileExists(atPath: source.path) else {
      throw ExtensionInstallerFailure.bundledExtensionMissing
    }

    let applicationSupport = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let destinationParent = applicationSupport.appendingPathComponent("AgentStart", isDirectory: true)
    try fileManager.createDirectory(at: destinationParent, withIntermediateDirectories: true)

    let destination = destinationParent.appendingPathComponent("ChromeExtension", isDirectory: true)
    let staging = destinationParent.appendingPathComponent(
      String(format: ".ChromeExtension-staging-%@", UUID().uuidString),
      isDirectory: true
    )
    let backup = destinationParent.appendingPathComponent(
      String(format: ".ChromeExtension-backup-%@", UUID().uuidString),
      isDirectory: true
    )

    do {
      try fileManager.copyItem(at: source, to: staging)
      if fileManager.fileExists(atPath: destination.path) {
        try fileManager.moveItem(at: destination, to: backup)
      }
      try fileManager.moveItem(at: staging, to: destination)
      if fileManager.fileExists(atPath: backup.path) {
        try fileManager.removeItem(at: backup)
      }
    } catch {
      try? fileManager.removeItem(at: staging)
      if !fileManager.fileExists(atPath: destination.path),
        fileManager.fileExists(atPath: backup.path)
      {
        try? fileManager.moveItem(at: backup, to: destination)
      }
      throw ExtensionInstallerFailure.copyFailed(error.localizedDescription)
    }

    return FastExtensionInstallResult(directory: destination)
  }
}

enum ExtensionInstallerFailure: LocalizedError {
  case bundleResourcesUnavailable
  case bundledExtensionMissing
  case copyFailed(String)

  var errorDescription: String? {
    switch self {
    case .bundleResourcesUnavailable:
      return translate("AgentStart could not find its bundled resources.")
    case .bundledExtensionMissing:
      return translate(
        "The Fast Chrome extension is not included in this app build. Download a complete AgentStart installer and try again."
      )
    case .copyFailed(let detail):
      return translate("AgentStart could not prepare the Fast Chrome extension: %@").replacingOccurrences(
        of: "%@",
        with: detail
      )
    }
  }
}
