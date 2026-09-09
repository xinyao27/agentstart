import Foundation

struct DaemonStatus: Decodable, Sendable {
  let state: String
  let pid: Int32?
  let endpoint: String?
  let reachable: Bool?
}

actor DaemonProcess {
  private let executable: URL
  private var ownedProcess: Process?

  init() {
    executable = Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/yiru")
  }

  var ownsDaemon: Bool { ownedProcess?.isRunning == true }

  func status() async throws -> DaemonStatus {
    let data = try await command(["status", "--probe", "--json"])
    return try JSONDecoder().decode(DaemonStatus.self, from: data)
  }

  func start() async throws {
    if try await status().state == "running" { return }
    try Task.checkCancellation()
    let process = Process()
    process.executableURL = executable
    process.arguments = ["daemon"]
    process.standardInput = FileHandle.nullDevice
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    try process.run()
    ownedProcess = process
    let deadline = ContinuousClock.now.advanced(by: .seconds(10))
    while ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(100))
      let current = try await status()
      if current.state == "running" {
        if current.pid != process.processIdentifier { ownedProcess = nil }
        if current.reachable == true { return }
      }
      if !process.isRunning { throw DaemonFailure.start }
    }
    throw DaemonFailure.timeout
  }

  func installBrowserConnection() async throws {
    _ = try await command(["native-messaging", "install", "--silent"])
  }

  func stopOwnedDaemon() async throws {
    guard let process = ownedProcess, process.isRunning else { return }
    process.terminate()
    let deadline = ContinuousClock.now.advanced(by: .seconds(10))
    while process.isRunning {
      if ContinuousClock.now >= deadline { throw DaemonFailure.stop }
      try await Task.sleep(for: .milliseconds(100))
    }
    ownedProcess = nil
  }

  private func command(_ arguments: [String]) async throws -> Data {
    let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    FileManager.default.createFile(
      atPath: file.path, contents: nil, attributes: [.posixPermissions: 0o600])
    let output = try FileHandle(forWritingTo: file)
    defer {
      try? output.close()
      try? FileManager.default.removeItem(at: file)
    }
    let process = Process()
    process.executableURL = executable
    process.arguments = arguments
    process.standardInput = FileHandle.nullDevice
    process.standardOutput = output
    process.standardError = FileHandle.nullDevice
    try process.run()
    defer { if process.isRunning { process.terminate() } }
    let deadline = ContinuousClock.now.advanced(by: .seconds(10))
    while process.isRunning {
      if ContinuousClock.now >= deadline {
        process.terminate()
        throw DaemonFailure.timeout
      }
      try await Task.sleep(for: .milliseconds(50))
    }
    guard process.terminationStatus == 0 else { throw DaemonFailure.command }
    return try Data(contentsOf: file)
  }
}

enum DaemonFailure: LocalizedError {
  case start, timeout, command, stop

  var errorDescription: String? {
    switch self {
    case .start: return translate("The daemon could not start. Open Yiru again to retry.")
    case .timeout: return translate("The daemon did not respond in time.")
    case .command: return translate("The daemon command failed.")
    case .stop:
      return translate(
        "The daemon is still stopping. Yiru will stay open; try quitting again shortly.")
    }
  }
}

func translate(_ key: String) -> String {
  NSLocalizedString(key, bundle: .module, comment: "")
}
