// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "AgentStartMenuBar",
  defaultLocalization: "en",
  platforms: [.macOS(.v13)],
  products: [.executable(name: "AgentStartMenuBar", targets: ["AgentStartMenuBar"])],
  targets: [.executableTarget(name: "AgentStartMenuBar", resources: [.process("Resources")])]
)
