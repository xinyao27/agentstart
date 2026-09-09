// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "YiruComputerUseMacOS",
  platforms: [
    .macOS(.v14)
  ],
  products: [
    .library(
      name: "YiruComputerUseMacOSCore",
      targets: ["YiruComputerUseMacOSCore"]
    ),
    .executable(
      name: "yiru-computer-use-macos",
      targets: ["YiruComputerUseMacOS"]
    ),
  ],
  targets: [
    .target(
      name: "YiruComputerUseMacOSCore",
      path: "Sources/YiruComputerUseMacOSCore"
    ),
    .target(
      name: "YiruComputerUseIcons",
      path: "Sources/YiruComputerUseIcons"
    ),
    .target(
      name: "SystemSettingsKit",
      path: "vendor/permission-flow/Sources/SystemSettingsKit",
      swiftSettings: [
        .swiftLanguageMode(.v5)
      ]
    ),
    .target(
      name: "PermissionFlow",
      dependencies: ["SystemSettingsKit", "YiruComputerUseIcons"],
      path: "vendor/permission-flow/Sources/PermissionFlow",
      swiftSettings: [
        // Why: upstream main requires Swift 6.2, while the release runner uses Swift 6.
        .swiftLanguageMode(.v5)
      ]
    ),
    .target(
      name: "PermissionFlowScreenRecordingStatus",
      dependencies: ["PermissionFlow"],
      path: "vendor/permission-flow/Sources/PermissionFlowScreenRecordingStatus",
      swiftSettings: [
        .swiftLanguageMode(.v5)
      ]
    ),
    .executableTarget(
      name: "YiruComputerUseMacOS",
      dependencies: [
        "YiruComputerUseMacOSCore",
        "YiruComputerUseIcons",
        "PermissionFlow",
        "PermissionFlowScreenRecordingStatus",
      ],
      path: "Sources/YiruComputerUseMacOS"
    ),
  ]
)
