import AppKit
import Combine
import SystemSettingsKit

@available(macOS 13.0, *)
@MainActor
public final class PermissionFlowController: ObservableObject {
  private static weak var activeController: PermissionFlowController?
  private let systemSettingsBundleIdentifier = "com.apple.systempreferences"

  @Published public private(set) var droppedApps: [URL]
  @Published public private(set) var currentPane: PermissionFlowPane?
  @Published var isSettingsFrontmost = false
  @Published var isDraggingApp = false
  @Published public private(set) var localeIdentifier: String?

  public var onDrop: ((URL) -> Void)?

  private let configuration: PermissionFlowConfiguration
  private let tracker = SettingsWindowTracker()
  private var panel: FloatingDropPanel?
  private var pendingLaunchSourceFrame: CGRect?
  private var previousFrontmostApplicationPID: pid_t?
  private var previousFrontmostApplicationBundleIdentifier: String?
  private var cancellables = Set<AnyCancellable>()

  public init(configuration: PermissionFlowConfiguration = .init()) {
    self.configuration = configuration
    droppedApps = configuration.requiredAppURLs.uniqueAppURLs()
    localeIdentifier = configuration.localeIdentifier
    updateFrontmostAppState()
    bindTrackerCallbacks()
    observeFrontmostApplication()
  }

  public func authorize(
    pane: PermissionFlowPane,
    suggestedAppURLs: [URL] = [],
    sourceFrameInScreen: CGRect? = nil
  ) {
    closeOtherActivePanelIfNeeded()
    rememberPreviousFrontmostApplication()
    currentPane = pane
    pendingLaunchSourceFrame = sourceFrameInScreen
    mergeDroppedApps(with: suggestedAppURLs)
    SystemSettings.open(url: pane.settingsURL)
    guard pane.supportsFloatingAuthorizationPanel else { return }
    Self.activeController = self
    showPanel()
    tracker.startTracking(promptIfNeeded: configuration.promptForAccessibilityTrust)
  }

  public func showPanel() {
    if panel == nil {
      panel = FloatingDropPanel(controller: self)
    }
    guard let panel else { return }
    if let settingsFrame = tracker.currentFrame {
      presentPanel(panel, for: settingsFrame)
    } else if let pendingLaunchSourceFrame {
      panel.show(at: pendingLaunchSourceFrame)
    } else {
      panel.center()
      panel.show()
    }
  }

  public func closePanel(returnToPreviousApp: Bool = false) {
    tracker.stopTracking()
    panel?.close()
    panel = nil
    pendingLaunchSourceFrame = nil
    if Self.activeController === self {
      Self.activeController = nil
    }
    if returnToPreviousApp {
      reactivatePreviousFrontmostApplication()
    }
  }

  public func resetDroppedApps() {
    droppedApps = configuration.requiredAppURLs.uniqueAppURLs()
  }

  public func setLocaleIdentifier(_ localeIdentifier: String?) {
    guard self.localeIdentifier != localeIdentifier else { return }
    self.localeIdentifier = localeIdentifier
    panel?.updateLocaleIdentifier(localeIdentifier)
  }

  public func registerDroppedApp(_ url: URL) {
    guard url.pathExtension.lowercased() == "app" else { return }
    let normalizedURL = url.standardizedFileURL
    guard !droppedApps.contains(normalizedURL) else { return }
    droppedApps.append(normalizedURL)
    onDrop?(normalizedURL)
  }

  var preferredAppURL: URL? {
    if let first = droppedApps.first {
      return first
    }
    let bundleURL = Bundle.main.bundleURL.standardizedFileURL
    return bundleURL.pathExtension.lowercased() == "app" ? bundleURL : nil
  }

  func setPanelDragging(_ isDragging: Bool) {
    isDraggingApp = isDragging
    panel?.setDraggingPassthrough(isDragging)
  }

  func keepSettingsVisible() {
    SystemSettings.activate()
    panel?.orderFrontRegardless()
  }

  func reopenCurrentSettingsPane() {
    guard let currentPane else { return }
    SystemSettings.open(url: currentPane.settingsURL)
    panel?.orderFrontRegardless()
  }

  private func mergeDroppedApps(with urls: [URL]) {
    for url in urls.uniqueAppURLs() {
      registerDroppedApp(url)
    }
  }

  private func bindTrackerCallbacks() {
    tracker.onFrameChange = { [weak self] frame in
      guard let self else { return }
      self.presentPanel(self.panel, for: frame)
    }
    tracker.onTrackingEnded = { [weak self] in
      self?.closePanel()
    }
  }

  private func observeFrontmostApplication() {
    NSWorkspace.shared.notificationCenter
      .publisher(for: NSWorkspace.didActivateApplicationNotification)
      .receive(on: RunLoop.main)
      .sink { [weak self] _ in
        self?.updateFrontmostAppState()
      }
      .store(in: &cancellables)
  }

  private func closeOtherActivePanelIfNeeded() {
    if let activeController = Self.activeController, activeController !== self {
      activeController.closePanel()
    }
  }

  private func rememberPreviousFrontmostApplication() {
    let application = NSWorkspace.shared.frontmostApplication
    guard application?.bundleIdentifier != systemSettingsBundleIdentifier else { return }
    previousFrontmostApplicationPID = application?.processIdentifier
    previousFrontmostApplicationBundleIdentifier = application?.bundleIdentifier
  }

  private func reactivatePreviousFrontmostApplication() {
    defer {
      previousFrontmostApplicationPID = nil
      previousFrontmostApplicationBundleIdentifier = nil
    }
    if let previousFrontmostApplicationPID,
      let application = NSRunningApplication(
        processIdentifier: previousFrontmostApplicationPID
      )
    {
      application.activate()
      return
    }
    guard let previousFrontmostApplicationBundleIdentifier else { return }
    NSRunningApplication.runningApplications(
      withBundleIdentifier: previousFrontmostApplicationBundleIdentifier
    )
    .first?
    .activate()
  }

  private func presentPanel(_ panel: FloatingDropPanel?, for settingsFrame: CGRect) {
    guard let panel else { return }
    if let pendingLaunchSourceFrame {
      panel.present(from: pendingLaunchSourceFrame, to: settingsFrame)
      self.pendingLaunchSourceFrame = nil
    } else {
      panel.snap(to: settingsFrame)
    }
  }

  private func updateFrontmostAppState() {
    isSettingsFrontmost =
      NSWorkspace.shared.frontmostApplication?.bundleIdentifier
      == systemSettingsBundleIdentifier
  }
}

@available(macOS 13.0, *)
extension Array where Element == URL {
  fileprivate func uniqueAppURLs() -> [URL] {
    var seen = Set<String>()
    return compactMap { url in
      let normalizedURL = url.standardizedFileURL
      guard normalizedURL.pathExtension.lowercased() == "app" else { return nil }
      return seen.insert(normalizedURL.path).inserted ? normalizedURL : nil
    }
  }

  fileprivate func contains(_ url: URL) -> Bool {
    contains { candidate in
      candidate.standardizedFileURL.path == url.standardizedFileURL.path
    }
  }
}
