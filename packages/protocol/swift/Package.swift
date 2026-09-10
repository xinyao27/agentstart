// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "AgentStartProtocol",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(
            name: "AgentStartProtocol",
            targets: ["AgentStartProtocol"]
        ),
    ],
    dependencies: [
        .package(
            url: "https://github.com/apple/swift-protobuf.git",
            exact: "1.38.1"
        ),
    ],
    targets: [
        .target(
            name: "AgentStartProtocol",
            dependencies: [
                .product(name: "SwiftProtobuf", package: "swift-protobuf"),
            ],
            path: "Sources/AgentStartProtocol"
        ),
    ]
)
