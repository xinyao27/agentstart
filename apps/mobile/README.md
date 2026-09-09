# Yiru for iOS

Yiru 唯一的移动端客户端，基于原生 iOS 26。

技术基线：

- iOS / iPadOS 26 起
- Xcode 26.5（与 CI 和发布工作流一致）
- Swift 6 language mode，Swift 6.3 编译器，完整 strict concurrency
- SwiftUI、Observation、NavigationStack 与系统 Liquid Glass
- 固定版本 SwiftTerm 1.18.0，通过 Yiru 自有 `TerminalSurface` adapter 嵌入
- Terminal 控制面与 multiplex frame 常量由 `packages/protocol/proto` 的 Protobuf schema 生成
- URLSession WebSocket、CryptoKit 与固定版本 Swift-sodium 组成的 E2EE v2 transport
- XcodeGen 生成工程，`.xcodeproj` 不入库

SwiftTerm 的 Swift Package 包含 Metal shader resource。首次构建前安装与当前 Xcode 匹配的
Apple Metal Toolchain；当前 renderer 默认走 Core Graphics，是否启用 Metal 由后续性能数据决定：

```sh
xcodebuild -downloadComponent MetalToolchain
```

常用命令：

```sh
vp run yiru-mobile#project:generate
vp run yiru-mobile#dev
vp run yiru-mobile#check
```

代码结构和依赖规则见 [ARCHITECTURE.md](./ARCHITECTURE.md)，视觉规则见
[DESIGN.md](./DESIGN.md)，签名和 TestFlight 流程见 [RELEASE.md](./RELEASE.md)。
