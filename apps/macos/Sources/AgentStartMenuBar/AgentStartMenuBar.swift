import AppKit

private enum BrowserChannel: String {
  case fast
  case webStore
}

private enum AgentStartBrowser {
  static let fastExtensionId = "mfgmfiabfncmdekmikepemddejoeihbf"
  static let webStoreExtensionId = "ljgpbhfigjepmdeaggfdagchkgaogglp"
  static let webStoreItemURL =
    "https://chromewebstore.google.com/detail/agentstart/ljgpbhfigjepmdeaggfdagchkgaogglp"
}

@main
struct AgentStartMenuBar {
  @MainActor static func main() {
    let application = NSApplication.shared
    let delegate = MenuBarApplication()
    application.delegate = delegate
    application.setActivationPolicy(.accessory)
    withExtendedLifetime(delegate) { application.run() }
  }
}

@MainActor
final class MenuBarApplication: NSObject, NSApplicationDelegate, NSMenuDelegate {
  private let daemon = DaemonProcess()
  private let extensionInstaller = ExtensionInstaller()
  private var statusItem: NSStatusItem?
  private var status: DaemonStatus?
  private var fastExtensionDirectory: URL?
  private var fastExtensionError: String?
  private var ownsDaemon = false
  private var isBusy = false
  private var isQuitting = false
  private var lastError: String?
  private var polling: Task<Void, Never>?
  private var startup: Task<Void, Never>?

  private static let browserChannelKey = "browserChannel"
  private static let browserOnboardingShownKey = "browserOnboardingShown"

  func applicationDidFinishLaunching(_ notification: Notification) {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    item.button?.image = Bundle.module.image(forResource: "agentstart-menu-barTemplate")
    item.button?.image?.size = NSSize(width: 18, height: 18)
    item.button?.image?.isTemplate = false
    item.button?.toolTip = translate("AgentStart")
    statusItem = item
    renderMenu()
    beginStart()
    polling = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(3))
        guard !Task.isCancelled, let self else { return }
        await self.refresh()
      }
    }
  }

  func menuWillOpen(_ menu: NSMenu) { Task { await refresh() } }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool
  {
    beginStart()
    return false
  }

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    if isQuitting { return .terminateLater }
    isQuitting = true
    startup?.cancel()
    Task {
      await startup?.value
      do {
        try await daemon.stopOwnedDaemon()
        polling?.cancel()
        sender.reply(toApplicationShouldTerminate: true)
      } catch {
        isQuitting = false
        lastError = error.localizedDescription
        sender.reply(toApplicationShouldTerminate: false)
        renderMenu()
        showError()
      }
    }
    return .terminateLater
  }

  private func refresh() async {
    do { status = try await daemon.status() } catch {
      status = nil
      lastError = error.localizedDescription
    }
    ownsDaemon = await daemon.ownsDaemon
    renderMenu()
  }

  private func startDaemon() async {
    lastError = nil
    renderMenu()
    do {
      try await daemon.start()
      try await daemon.installBrowserConnection()
      do {
        fastExtensionDirectory = try extensionInstaller.syncBundledExtension().directory
        fastExtensionError = nil
      } catch {
        // Why: a partial app build should not prevent the daemon from serving Web Store users.
        fastExtensionDirectory = nil
        fastExtensionError = error.localizedDescription
      }
    } catch { lastError = error.localizedDescription }
    isBusy = false
    await refresh()
    if lastError == nil {
      showStartupBrowserOnboardingIfNeeded()
    }
  }

  private func renderMenu() {
    let menu = NSMenu()
    menu.delegate = self
    let label =
      isBusy
      ? translate("Starting daemon…")
      : status?.reachable == true
        ? translate("Daemon is connected")
        : status?.state == "running"
          ? translate("Daemon is running but not responding") : translate("Daemon is not running")
    add(
      lastError == nil ? label : translate("Daemon needs attention…"),
      action: #selector(statusAction), to: menu,
      enabled: !isBusy && (lastError != nil || status?.reachable != true))
    add(translate("Open AgentStart"), action: #selector(openBrowser), to: menu)
    add(
      translate("Set up Chrome extension"), action: #selector(setupBrowserExtension), to: menu)
    add(
      ownsDaemon ? translate("Quit AgentStart…") : translate("Quit Menu Bar"), action: #selector(quit),
      to: menu)
    statusItem?.menu = menu
    statusItem?.button?.appearsDisabled = status?.reachable != true
  }

  private func add(_ title: String, action: Selector, to menu: NSMenu, enabled: Bool = true) {
    let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
    item.target = self
    item.isEnabled = enabled
    menu.autoenablesItems = false
    menu.addItem(item)
  }

  private func beginStart() {
    guard !isQuitting, !isBusy else { return }
    isBusy = true
    startup = Task { await startDaemon() }
  }

  @objc private func statusAction() {
    if lastError != nil { showError() } else { beginStart() }
  }

  @objc private func openBrowser() {
    guard let probe = URL(string: "https://github.com/xinyao27/agentstart"),
      let browser = NSWorkspace.shared.urlForApplication(toOpen: probe),
      let identifier = Bundle(url: browser)?.bundleIdentifier,
      identifier == "company.thebrowser.dia" || identifier == "com.google.Chrome"
        || identifier.hasPrefix("com.google.Chrome.")
    else {
      presentError(
        translate(
          "Use Dia or Google Chrome as your default browser with the AgentStart extension installed, then try again."
        ))
      return
    }
    let channel = BrowserChannel(
      rawValue: UserDefaults.standard.string(forKey: Self.browserChannelKey) ?? ""
    ) ?? .fast
    let extensionId =
      channel == .webStore ? AgentStartBrowser.webStoreExtensionId : AgentStartBrowser.fastExtensionId
    guard let url = URL(string: "chrome-extension://\(extensionId)/workspace.html") else { return }
    NSWorkspace.shared.open([url], withApplicationAt: browser, configuration: .init()) {
      [weak self] _, error in
      guard let error else { return }
      Task { @MainActor in
        self?.presentError(error.localizedDescription)
      }
    }
  }

  @objc private func setupBrowserExtension() {
    UserDefaults.standard.set(true, forKey: Self.browserOnboardingShownKey)
    showBrowserSetup()
  }

  private func showStartupBrowserOnboardingIfNeeded() {
    guard !UserDefaults.standard.bool(forKey: Self.browserOnboardingShownKey) else { return }
    UserDefaults.standard.set(true, forKey: Self.browserOnboardingShownKey)
    showBrowserSetup()
  }

  private func showBrowserSetup() {
    let choice = NSAlert()
    choice.messageText = translate("Set up the AgentStart browser extension")
    choice.informativeText = translate(
      "AgentStart has started the daemon and installed the Native Messaging connection. Choose how Chrome should receive the extension."
    )
    choice.addButton(withTitle: translate("Chrome Web Store"))
    choice.addButton(withTitle: translate("Fast install (Load unpacked)"))
    choice.addButton(withTitle: translate("Skip for now"))
    NSApp.activate(ignoringOtherApps: true)

    switch choice.runModal() {
    case .alertFirstButtonReturn:
      showWebStoreSetup()
    case .alertSecondButtonReturn:
      showFastExtensionSetup()
    default:
      return
    }
  }

  private func showWebStoreSetup() {
    UserDefaults.standard.set(BrowserChannel.webStore.rawValue, forKey: Self.browserChannelKey)
    let alert = NSAlert()
    alert.messageText = translate("Install from Chrome Web Store")
    alert.informativeText = translate(
      "Open the AgentStart listing, click Add to Chrome, and approve the requested permissions. The store version updates automatically after review."
    )
    alert.addButton(withTitle: translate("Open Chrome Web Store"))
    alert.addButton(withTitle: translate("I have installed it"))
    alert.addButton(withTitle: translate("Cancel"))
    NSApp.activate(ignoringOtherApps: true)

    switch alert.runModal() {
    case .alertFirstButtonReturn:
      openWebStore()
      showWebStoreInstallConfirmation()
    case .alertSecondButtonReturn:
      showConnectionInstructions(channel: .webStore)
    default:
      return
    }
  }

  private func showWebStoreInstallConfirmation() {
    let alert = NSAlert()
    alert.messageText = translate("Finish the Chrome Web Store installation")
    alert.informativeText = translate(
      "After Chrome finishes adding AgentStart, return here and confirm. The app will then open the workspace so you can check the connection."
    )
    alert.addButton(withTitle: translate("I have installed it"))
    alert.addButton(withTitle: translate("Not yet"))
    NSApp.activate(ignoringOtherApps: true)
    if alert.runModal() == .alertFirstButtonReturn {
      showConnectionInstructions(channel: .webStore)
    }
  }

  private func showFastExtensionSetup() {
    UserDefaults.standard.set(BrowserChannel.fast.rawValue, forKey: Self.browserChannelKey)
    guard let directory = prepareFastExtension() else { return }

    let manager = NSAlert()
    manager.messageText = translate("Install the Fast extension once")
    manager.informativeText = localized(
      "Fast extension steps:\n1. Open Chrome's extension manager and turn on Developer mode.\n2. Choose Load unpacked.\n3. Select this folder:\n%@",
      directory.path
    )
    manager.addButton(withTitle: translate("Open extension manager"))
    manager.addButton(withTitle: translate("Skip for now"))
    NSApp.activate(ignoringOtherApps: true)

    guard manager.runModal() == .alertFirstButtonReturn else { return }
    openChromeExtensions()

    let folder = NSAlert()
    folder.messageText = translate("Choose the AgentStart extension folder")
    folder.informativeText = localized(
      "In Chrome, click Load unpacked and select:\n%@\nKeep this folder selected. AgentStart will update it with future app releases.",
      directory.path
    )
    folder.addButton(withTitle: translate("Open extension folder"))
    folder.addButton(withTitle: translate("I have loaded it"))
    folder.addButton(withTitle: translate("Cancel"))
    NSApp.activate(ignoringOtherApps: true)

    switch folder.runModal() {
    case .alertFirstButtonReturn:
      NSWorkspace.shared.activateFileViewerSelecting([directory])
      showConnectionInstructions(channel: .fast)
    case .alertSecondButtonReturn:
      showConnectionInstructions(channel: .fast)
    default:
      return
    }
  }

  private func prepareFastExtension() -> URL? {
    if let fastExtensionDirectory { return fastExtensionDirectory }
    do {
      let result = try extensionInstaller.syncBundledExtension()
      fastExtensionDirectory = result.directory
      fastExtensionError = nil
      return result.directory
    } catch {
      fastExtensionError = error.localizedDescription
      presentError(
        fastExtensionError ?? translate("The Fast extension could not be prepared."),
        canRetry: true
      )
      return nil
    }
  }

  private func showConnectionInstructions(channel: BrowserChannel) {
    let alert = NSAlert()
    alert.messageText = translate("Connect AgentStart to Chrome")
    alert.informativeText =
      channel == .fast
      ? translate(
        "AgentStart is ready to connect. Keep this app running, make sure the Fast extension is enabled, then open AgentStart from the extension. After a future app update, open chrome://extensions and click Reload for AgentStart."
      )
      : translate(
        "AgentStart is ready to connect. Keep this app running, make sure the Web Store extension is enabled, then open AgentStart from the extension. Native Messaging is installed automatically by this app."
      )
    alert.addButton(withTitle: translate("Open AgentStart"))
    alert.addButton(withTitle: translate("Done"))
    NSApp.activate(ignoringOtherApps: true)
    if alert.runModal() == .alertFirstButtonReturn {
      openBrowser()
    }
  }

  private func openWebStore() {
    guard let url = URL(string: AgentStartBrowser.webStoreItemURL) else { return }
    openSupportedBrowser(url)
  }

  private func openSupportedBrowser(_ url: URL) {
    guard let browser = NSWorkspace.shared.urlForApplication(toOpen: url),
      let identifier = Bundle(url: browser)?.bundleIdentifier,
      identifier == "company.thebrowser.dia" || identifier == "com.google.Chrome"
        || identifier.hasPrefix("com.google.Chrome.")
    else {
      presentError(translate("Use Google Chrome or Dia to install and use the AgentStart extension."))
      return
    }
    NSWorkspace.shared.open([url], withApplicationAt: browser, configuration: .init()) {
      [weak self] _, error in
      guard let error else { return }
      Task { @MainActor in self?.presentError(error.localizedDescription) }
    }
  }

  private func openChromeExtensions() {
    guard let chrome = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.google.Chrome"),
      let url = URL(string: "chrome://extensions")
    else {
      presentError(translate("Google Chrome is not installed. Install Chrome, then try again."))
      return
    }
    NSWorkspace.shared.open([url], withApplicationAt: chrome, configuration: .init()) {
      [weak self] _, error in
      guard let error else { return }
      Task { @MainActor in self?.presentError(error.localizedDescription) }
    }
  }

  private func localized(_ key: String, _ value: String) -> String {
    translate(key).replacingOccurrences(of: "%@", with: value)
  }

  @objc private func showError() {
    presentError(lastError ?? translate("No error details are available."), canRetry: true)
  }

  private func presentError(_ message: String, canRetry: Bool = false) {
    let alert = NSAlert()
    alert.messageText = translate("AgentStart Needs Attention")
    alert.informativeText = message
    alert.addButton(withTitle: translate("OK"))
    if canRetry { alert.addButton(withTitle: translate("Retry")) }
    NSApp.activate(ignoringOtherApps: true)
    if alert.runModal() == .alertSecondButtonReturn { beginStart() }
  }

  @objc private func quit() {
    if ownsDaemon {
      let alert = NSAlert()
      alert.messageText = translate("Quit AgentStart?")
      alert.informativeText = translate(
        "This stops the daemon and its running terminals and agents.")
      alert.addButton(withTitle: translate("Cancel"))
      alert.addButton(withTitle: translate("Quit AgentStart"))
      NSApp.activate(ignoringOtherApps: true)
      guard alert.runModal() == .alertSecondButtonReturn else { return }
    }
    NSApp.terminate(nil)
  }
}
