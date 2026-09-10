// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "AgentStartComputerUseMacOS",
  platforms: [
    .macOS(.v14)
  ],
  products: [
    .library(
      name: "AgentStartComputerUseMacOSCore",
      targets: ["AgentStartComputerUseMacOSCore"]
    ),
    .executable(
      name: "agentstart-computer-use-macos",
      targets: ["AgentStartComputerUseMacOS"]
    ),
  ],
  targets: [
    .target(
      name: "AgentStartComputerUseMacOSCore",
      path: "Sources/AgentStartComputerUseMacOSCore"
    ),
    .target(
      name: "AgentStartComputerUseIcons",
      path: "Sources/AgentStartComputerUseIcons"
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
      dependencies: ["SystemSettingsKit", "AgentStartComputerUseIcons"],
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
      name: "AgentStartComputerUseMacOS",
      dependencies: [
        "AgentStartComputerUseMacOSCore",
        "AgentStartComputerUseIcons",
        "PermissionFlow",
        "PermissionFlowScreenRecordingStatus",
      ],
      path: "Sources/AgentStartComputerUseMacOS"
    ),
  ]
)
