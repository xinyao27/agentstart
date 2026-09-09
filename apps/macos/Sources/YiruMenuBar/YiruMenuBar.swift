import AppKit

@main
struct YiruMenuBar {
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
  private var statusItem: NSStatusItem?
  private var status: DaemonStatus?
  private var ownsDaemon = false
  private var isBusy = false
  private var isQuitting = false
  private var lastError: String?
  private var polling: Task<Void, Never>?
  private var startup: Task<Void, Never>?

  func applicationDidFinishLaunching(_ notification: Notification) {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    item.button?.image = Bundle.module.image(forResource: "yiru-menu-barTemplate")
    item.button?.image?.size = NSSize(width: 22, height: 14)
    item.button?.image?.isTemplate = true
    item.button?.toolTip = translate("Yiru")
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
    } catch { lastError = error.localizedDescription }
    isBusy = false
    await refresh()
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
    add(translate("Open Yiru"), action: #selector(openBrowser), to: menu)
    add(
      ownsDaemon ? translate("Quit Yiru…") : translate("Quit Menu Bar"), action: #selector(quit),
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
    guard let probe = URL(string: "https://yiru.dev"),
      let browser = NSWorkspace.shared.urlForApplication(toOpen: probe),
      let identifier = Bundle(url: browser)?.bundleIdentifier,
      identifier == "company.thebrowser.dia" || identifier == "com.google.Chrome"
        || identifier.hasPrefix("com.google.Chrome.")
    else {
      presentError(
        translate(
          "Use Dia or Google Chrome as your default browser with the Yiru extension installed, then try again."
        ))
      return
    }
    guard
      let url = URL(string: "chrome-extension://mfgmfiabfncmdekmikepemddejoeihbf/workspace.html")
    else { return }
    NSWorkspace.shared.open([url], withApplicationAt: browser, configuration: .init()) {
      [weak self] _, error in
      guard let error else { return }
      Task { @MainActor in
        self?.presentError(error.localizedDescription)
      }
    }
  }

  @objc private func showError() {
    presentError(lastError ?? translate("No error details are available."), canRetry: true)
  }

  private func presentError(_ message: String, canRetry: Bool = false) {
    let alert = NSAlert()
    alert.messageText = translate("Yiru Needs Attention")
    alert.informativeText = message
    alert.addButton(withTitle: translate("OK"))
    if canRetry { alert.addButton(withTitle: translate("Retry")) }
    NSApp.activate(ignoringOtherApps: true)
    if alert.runModal() == .alertSecondButtonReturn { beginStart() }
  }

  @objc private func quit() {
    if ownsDaemon {
      let alert = NSAlert()
      alert.messageText = translate("Quit Yiru?")
      alert.informativeText = translate(
        "This stops the daemon and its running terminals and agents.")
      alert.addButton(withTitle: translate("Cancel"))
      alert.addButton(withTitle: translate("Quit Yiru"))
      NSApp.activate(ignoringOtherApps: true)
      guard alert.runModal() == .alertSecondButtonReturn else { return }
    }
    NSApp.terminate(nil)
  }
}
