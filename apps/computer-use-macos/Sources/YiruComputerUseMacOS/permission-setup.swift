import AppKit
import Combine
import PermissionFlow
import PermissionFlowScreenRecordingStatus
import SwiftUI
import YiruComputerUseIcons

private func translate(_ key: String, fallback: String) -> String {
  Bundle.main.localizedString(forKey: key, value: fallback, table: nil)
}

@MainActor
final class ComputerUsePermissionRuntime: NSObject, NSApplicationDelegate {
  private let initialPermission: ComputerUsePermission?
  private var windowController: ComputerUsePermissionWindowController?

  init(initialPermission: ComputerUsePermission?) {
    self.initialPermission = initialPermission
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    PermissionFlowScreenRecordingStatus.register()
    let controller = ComputerUsePermissionWindowController(
      initialPermission: initialPermission
    )
    windowController = controller
    controller.showWindow(nil)
    controller.window?.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }
}

@MainActor
final class ComputerUsePermissionWindowController: NSWindowController {
  init(initialPermission: ComputerUsePermission?) {
    let windowSize = NSSize(width: 540, height: 410)
    let window = NSWindow(
      contentRect: NSRect(origin: .zero, size: windowSize),
      styleMask: [.titled, .closable, .miniaturizable, .fullSizeContentView],
      backing: .buffered,
      defer: false
    )
    let permissionView = ComputerUsePermissionsView(
      initialPermission: initialPermission
    )
    super.init(window: window)

    window.title = translate(
      "computer-use.window.enable-title",
      fallback: "Enable Yiru Computer Use"
    )
    window.titleVisibility = .hidden
    window.titlebarAppearsTransparent = true
    window.titlebarSeparatorStyle = .none
    window.isMovableByWindowBackground = true
    window.isReleasedWhenClosed = false
    window.isOpaque = false
    window.backgroundColor = .clear
    window.center()

    let hostingView = NSHostingView(rootView: permissionView)
    hostingView.autoresizingMask = [.width, .height]
    #if compiler(>=6.2)
      if #available(macOS 26.0, *) {
        let glassView = NSGlassEffectView()
        glassView.style = .regular
        glassView.cornerRadius = 16
        glassView.contentView = hostingView
        window.contentView = glassView
      } else {
        Self.installFallbackMaterial(hostingView: hostingView, in: window)
      }
    #else
      Self.installFallbackMaterial(hostingView: hostingView, in: window)
    #endif
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError()
  }

  private static func installFallbackMaterial(hostingView: NSView, in window: NSWindow) {
    let materialView = NSVisualEffectView()
    materialView.material = .underWindowBackground
    materialView.blendingMode = .behindWindow
    materialView.state = .active
    hostingView.frame = materialView.bounds
    materialView.addSubview(hostingView)
    window.contentView = materialView
  }
}

@MainActor
struct ComputerUsePermissionsView: View {
  let initialPermission: ComputerUsePermission?

  @StateObject private var flowController: PermissionFlowController
  @State private var authorizationStates: [ComputerUsePermission: PermissionAuthorizationState] =
    [:]
  @State private var didLaunchInitialPermission = false

  private let statusTimer = Timer.publish(
    every: 0.8,
    on: .main,
    in: .common
  )
  .autoconnect()

  init(initialPermission: ComputerUsePermission?) {
    self.initialPermission = initialPermission
    let configuration = PermissionFlowConfiguration(
      requiredAppURLs: [Bundle.main.bundleURL],
      promptForAccessibilityTrust: false,
      localeIdentifier: Bundle.main.preferredLocalizations.first
    )
    _flowController = StateObject(
      wrappedValue: PermissionFlow.makeController(configuration: configuration)
    )
  }

  var body: some View {
    VStack(spacing: 24) {
      header
      permissionRows
    }
    .padding(.horizontal, 30)
    .padding(.top, 32)
    .padding(.bottom, 28)
    .frame(width: 540, height: 410)
    .onAppear(perform: refreshAuthorizationStates)
    .onReceive(statusTimer) { _ in
      refreshAuthorizationStates()
    }
    .onReceive(
      NotificationCenter.default.publisher(
        for: NSApplication.didBecomeActiveNotification
      )
    ) { _ in
      refreshAuthorizationStates()
    }
    .task {
      await launchInitialPermissionIfNeeded()
    }
  }

  private var allPermissionsGranted: Bool {
    ComputerUsePermission.allCases.allSatisfy(isGranted)
  }

  private var header: some View {
    VStack(spacing: 7) {
      Image(nsImage: NSApp.applicationIconImage)
        .resizable()
        .scaledToFit()
        .frame(width: 58, height: 58)
        .shadow(color: Color.black.opacity(0.1), radius: 8, y: 3)
        .padding(.bottom, 4)
      Text(
        allPermissionsGranted
          ? translate(
            "computer-use.window.ready-title",
            fallback: "Computer Use is Ready"
          )
          : translate(
            "computer-use.window.enable-title",
            fallback: "Enable Yiru Computer Use"
          )
      )
      .font(.system(size: 22, weight: .semibold))
      Text(
        allPermissionsGranted
          ? translate(
            "computer-use.window.ready-description",
            fallback: "Yiru can use local apps when you ask."
          )
          : translate(
            "computer-use.window.enable-description",
            fallback: """
              Yiru Computer Use needs these permissions to use apps on your Mac.
              These permissions are only used when you ask Yiru to perform tasks.
              """
          )
      )
      .font(.system(size: 14))
      .foregroundStyle(.secondary)
      .multilineTextAlignment(.center)
      .lineSpacing(3)
      .frame(maxWidth: 430)
    }
  }

  @ViewBuilder
  private var permissionRows: some View {
    #if compiler(>=6.2)
      if #available(macOS 26.0, *) {
        GlassEffectContainer(spacing: 12) {
          permissionRowList
        }
      } else {
        permissionRowList
      }
    #else
      permissionRowList
    #endif
  }

  private var permissionRowList: some View {
    VStack(spacing: 12) {
      ForEach(ComputerUsePermission.allCases) { permission in
        ComputerUsePermissionRow(
          permission: permission,
          authorizationState: authorizationStates[permission] ?? .checking
        ) {
          request(permission, animateFromPointer: true)
        }
      }
    }
  }

  private func isGranted(_ permission: ComputerUsePermission) -> Bool {
    authorizationStates[permission] == .granted
  }

  private func refreshAuthorizationStates() {
    var nextStates: [ComputerUsePermission: PermissionAuthorizationState] = [:]
    for permission in ComputerUsePermission.allCases {
      nextStates[permission] =
        PermissionStatusRegistry
        .provider(for: permission.pane)
        .authorizationState()
    }
    authorizationStates = nextStates
    if didLaunchInitialPermission,
      let initialPermission,
      nextStates[initialPermission] == .granted
    {
      NSApp.terminate(nil)
    }
  }

  private func launchInitialPermissionIfNeeded() async {
    guard let initialPermission, !didLaunchInitialPermission else { return }
    didLaunchInitialPermission = true
    refreshAuthorizationStates()
    guard !isGranted(initialPermission) else {
      NSApp.terminate(nil)
      return
    }
    try? await Task.sleep(for: .milliseconds(180))
    request(initialPermission, animateFromPointer: false)
  }

  private func request(
    _ permission: ComputerUsePermission,
    animateFromPointer: Bool
  ) {
    let sourceFrame: CGRect?
    if animateFromPointer {
      let mouse = NSEvent.mouseLocation
      sourceFrame = CGRect(
        x: mouse.x - 16,
        y: mouse.y - 16,
        width: 32,
        height: 32
      )
    } else {
      sourceFrame = nil
    }
    flowController.authorize(
      pane: permission.pane,
      suggestedAppURLs: [Bundle.main.bundleURL],
      sourceFrameInScreen: sourceFrame
    )
  }
}

@MainActor
private struct ComputerUsePermissionRow: View {
  let permission: ComputerUsePermission
  let authorizationState: PermissionAuthorizationState
  let requestPermission: () -> Void

  var body: some View {
    rowSurface
  }

  @ViewBuilder
  private var rowSurface: some View {
    #if compiler(>=6.2)
      if #available(macOS 26.0, *) {
        rowContent
          .glassEffect(.regular, in: .rect(cornerRadius: 15))
      } else {
        fallbackRowSurface
      }
    #else
      fallbackRowSurface
    #endif
  }

  private var fallbackRowSurface: some View {
    rowContent
      .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 15))
      .overlay(
        RoundedRectangle(cornerRadius: 15)
          .strokeBorder(
            Color(nsColor: .separatorColor).opacity(0.45),
            lineWidth: 1
          )
      )
      .shadow(color: Color.black.opacity(0.07), radius: 7, y: 2)
  }

  private var rowContent: some View {
    HStack(alignment: .center, spacing: 14) {
      ZStack {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill(Color(nsColor: .quaternaryLabelColor).opacity(0.55))
          .frame(width: 42, height: 42)
        YiruComputerUseIcon(permission.icon, size: 19)
          .foregroundStyle(.secondary)
          .accessibilityHidden(true)
      }
      VStack(alignment: .leading, spacing: 4) {
        Text(permission.title)
          .font(.system(size: 16, weight: .semibold))
        Text(permission.detail)
          .font(.system(size: 13))
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      permissionControl
    }
    .padding(.horizontal, 16)
    .frame(height: 74)
  }

  @ViewBuilder
  private var permissionControl: some View {
    switch authorizationState {
    case .granted:
      Label {
        Text(translate("permission.status.done", fallback: "Done"))
      } icon: {
        YiruComputerUseIcon(.checkmark, size: 16)
      }
      .font(.system(size: 13, weight: .medium))
      .foregroundStyle(.secondary)
    case .checking:
      Label {
        Text(translate("permission.status.checking", fallback: "Checking"))
      } icon: {
        YiruComputerUseIcon(.pending, size: 16)
      }
      .font(.system(size: 13, weight: .medium))
      .foregroundStyle(.secondary)
    case .notGranted, .unknown:
      Button(translate("permission.action.allow", fallback: "Allow")) {
        requestPermission()
      }
      .controlSize(.regular)
      .accessibilityLabel(
        String(
          format: translate(
            "permission.action.allow-accessibility-label",
            fallback: "Allow %@ in System Settings"
          ),
          permission.title
        )
      )
    }
  }
}

enum ComputerUsePermission: String, CaseIterable, Identifiable {
  case accessibility
  case screenshots

  var id: String { rawValue }

  static func parse(_ value: String?) -> ComputerUsePermission? {
    switch value {
    case "accessibility":
      return .accessibility
    case "screenshots", "screen", "screen-recording":
      return .screenshots
    default:
      return nil
    }
  }

  var pane: PermissionFlowPane {
    switch self {
    case .accessibility:
      return .accessibility
    case .screenshots:
      return .screenRecording
    }
  }

  var title: String {
    switch self {
    case .accessibility:
      return translate("permission.accessibility.title", fallback: "Accessibility")
    case .screenshots:
      return translate("computer-use.screenshots.title", fallback: "Screenshots")
    }
  }

  var detail: String {
    switch self {
    case .accessibility:
      return translate(
        "computer-use.accessibility.description",
        fallback: "Read app interface trees and perform requested actions."
      )
    case .screenshots:
      return translate(
        "computer-use.screenshots.description",
        fallback: "Capture app windows so agents can inspect visual state."
      )
    }
  }

  var icon: YiruComputerUseIconID {
    switch self {
    case .accessibility:
      return .accessibility
    case .screenshots:
      return .screenshots
    }
  }
}

@MainActor
func runPermissionFlowSetup(initialPermissionValue: String? = nil) {
  let app = NSApplication.shared
  let delegate = ComputerUsePermissionRuntime(
    initialPermission: ComputerUsePermission.parse(initialPermissionValue)
  )
  app.delegate = delegate
  // Why: setup must foreground reliably; the long-running agent path stays accessory-only.
  app.setActivationPolicy(.regular)
  app.run()
}
