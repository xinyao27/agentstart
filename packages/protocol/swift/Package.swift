// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "YiruProtocol",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(
            name: "YiruProtocol",
            targets: ["YiruProtocol"]
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
            name: "YiruProtocol",
            dependencies: [
                .product(name: "SwiftProtobuf", package: "swift-protobuf"),
            ],
            path: "Sources/YiruProtocol"
        ),
    ]
)
