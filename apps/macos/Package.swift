// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "YiruMenuBar",
  defaultLocalization: "en",
  platforms: [.macOS(.v13)],
  products: [.executable(name: "YiruMenuBar", targets: ["YiruMenuBar"])],
  targets: [.executableTarget(name: "YiruMenuBar", resources: [.process("Resources")])]
)
