import AppKit
import QuartzCore
import SwiftUI

@available(macOS 13.0, *)
@MainActor
final class FloatingDropPanel: NSPanel {
  private weak var panelController: PermissionFlowController?
  private let hostingView: NSHostingView<AnyView>
  private let sizingView: NSHostingView<AnyView>
  private let initialPanelWidth: CGFloat = 420
  private let sidebarWidth: CGFloat = 230
  private let screenInset: CGFloat = 12
  private let minimumPanelHeight: CGFloat = 96
  private let sizingHeightLimit: CGFloat = 4096
  private let animationDuration: TimeInterval = 0.72
  private let animationResponse: Double = 0.72
  private let minimumLaunchScale: CGFloat = 0.58

  private var launchTimer: Timer?
  private var launchStartTime: CFTimeInterval = 0
  private var launchFromFrame = NSRect.zero
  private var launchToFrame = NSRect.zero
  private var isAnimatingLaunch = false
  private var localeIdentifier: String?

  init(controller: PermissionFlowController) {
    panelController = controller
    localeIdentifier = controller.localeIdentifier
    let panelView = Self.makePanelView(
      controller: controller,
      localeIdentifier: controller.localeIdentifier
    )
    hostingView = NSHostingView(rootView: panelView)
    sizingView = NSHostingView(rootView: panelView)
    super.init(
      contentRect: CGRect(
        origin: .zero,
        size: CGSize(width: initialPanelWidth, height: minimumPanelHeight)
      ),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false
    )
    level = .floating
    isReleasedWhenClosed = false
    isOpaque = false
    backgroundColor = .clear
    hasShadow = true
    collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    isMovableByWindowBackground = false
    hidesOnDeactivate = false
    animationBehavior = .utilityWindow
    hostingView.translatesAutoresizingMaskIntoConstraints = false
    if #available(macOS 13.3, *) {
      hostingView.sizingOptions = []
    }
    contentView = hostingView
    setContentSize(
      CGSize(
        width: initialPanelWidth,
        height: measuredPanelHeight(for: initialPanelWidth)
      )
    )
  }

  func updateLocaleIdentifier(_ localeIdentifier: String?) {
    guard self.localeIdentifier != localeIdentifier,
      let panelController
    else {
      return
    }
    self.localeIdentifier = localeIdentifier
    let panelView = Self.makePanelView(
      controller: panelController,
      localeIdentifier: localeIdentifier
    )
    hostingView.rootView = panelView
    sizingView.rootView = panelView
    setContentSize(
      CGSize(width: frame.width, height: measuredPanelHeight(for: frame.width))
    )
  }

  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }

  override func becomeKey() {
    super.becomeKey()
    panelController?.keepSettingsVisible()
  }

  override func becomeMain() {
    super.becomeMain()
    panelController?.keepSettingsVisible()
  }

  override func sendEvent(_ event: NSEvent) {
    if event.type == .leftMouseDown || event.type == .rightMouseDown {
      panelController?.keepSettingsVisible()
    }
    super.sendEvent(event)
  }

  func show() {
    orderFrontRegardless()
  }

  func show(at sourceFrameInScreen: CGRect) {
    stopLaunchAnimation()
    isAnimatingLaunch = false
    alphaValue = 1
    setContentSize(
      CGSize(width: frame.width, height: measuredPanelHeight(for: frame.width))
    )
    setFrame(launchSourceFrame(for: sourceFrameInScreen), display: false)
    orderFrontRegardless()
  }

  func present(from sourceFrameInScreen: CGRect, to settingsFrame: CGRect) {
    stopLaunchAnimation()
    let targetFrame = targetFrame(for: settingsFrame)
    guard !sourceFrameInScreen.isEmpty else {
      isAnimatingLaunch = false
      alphaValue = 1
      setFrame(targetFrame, display: false)
      orderFrontRegardless()
      return
    }
    isAnimatingLaunch = true
    launchFromFrame = launchSourceFrame(for: sourceFrameInScreen)
    launchToFrame = targetFrame
    launchStartTime = CACurrentMediaTime()
    alphaValue = 0.9
    setFrame(launchFromFrame, display: false)
    orderFrontRegardless()
    stepLaunchAnimation()
    let timer = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
      Task { @MainActor [weak self] in
        self?.stepLaunchAnimation()
      }
    }
    RunLoop.main.add(timer, forMode: .common)
    launchTimer = timer
  }

  func setDraggingPassthrough(_ isDragging: Bool) {
    ignoresMouseEvents = isDragging
    alphaValue = isDragging ? 0.72 : 1
    if isDragging {
      orderBack(nil)
    } else {
      orderFrontRegardless()
    }
  }

  func snap(to settingsFrame: CGRect) {
    let target = targetFrame(for: settingsFrame)
    if isAnimatingLaunch {
      launchToFrame = target
      return
    }
    stopLaunchAnimation()
    setFrame(target, display: false)
    orderFrontRegardless()
  }

  private func targetFrame(for settingsFrame: CGRect) -> CGRect {
    let screenFrame =
      NSScreen.screens
      .first(where: { $0.frame.intersects(settingsFrame) })?
      .visibleFrame ?? settingsFrame
    let contentMinX = settingsFrame.minX + sidebarWidth
    let availableContentWidth = max(240, settingsFrame.width - sidebarWidth)
    let width = min(availableContentWidth, screenFrame.width - (screenInset * 2))
    let height = measuredPanelHeight(for: width)
    var origin = CGPoint(x: contentMinX, y: settingsFrame.minY - height)
    origin.x = max(
      screenFrame.minX + screenInset,
      min(origin.x, screenFrame.maxX - width - screenInset)
    )
    origin.y = max(
      screenFrame.minY + screenInset,
      min(origin.y, screenFrame.maxY - height - screenInset)
    )
    return CGRect(origin: origin, size: CGSize(width: width, height: height))
  }

  private func launchSourceFrame(for sourceFrameInScreen: CGRect) -> CGRect {
    let launchSize = CGSize(
      width: max(sourceFrameInScreen.width, frame.width * minimumLaunchScale),
      height: max(sourceFrameInScreen.height, frame.height * minimumLaunchScale)
    )
    return CGRect(
      x: sourceFrameInScreen.midX - (launchSize.width * 0.5),
      y: sourceFrameInScreen.midY - (launchSize.height * 0.5),
      width: launchSize.width,
      height: launchSize.height
    )
  }

  private func measuredPanelHeight(for width: CGFloat) -> CGFloat {
    sizingView.setFrameSize(NSSize(width: width, height: sizingHeightLimit))
    sizingView.layoutSubtreeIfNeeded()
    return max(minimumPanelHeight, sizingView.fittingSize.height)
  }

  private func stepLaunchAnimation() {
    let elapsed = max(0, CACurrentMediaTime() - launchStartTime)
    if elapsed >= animationDuration {
      isAnimatingLaunch = false
      stopLaunchAnimation()
      alphaValue = 1
      setFrame(launchToFrame, display: true)
      return
    }
    let progress = springProgress(at: elapsed)
    alphaValue = 0.9 + (0.1 * progress)
    setFrame(
      curvedFrame(from: launchFromFrame, to: launchToFrame, progress: progress),
      display: true
    )
  }

  private func stopLaunchAnimation() {
    launchTimer?.invalidate()
    launchTimer = nil
  }

  private func springProgress(at elapsed: TimeInterval) -> CGFloat {
    let omega = (2 * Double.pi) / animationResponse
    let progress = 1 - exp(-omega * elapsed) * (1 + (omega * elapsed))
    return min(max(progress, 0), 1)
  }

  private func curvedFrame(from: CGRect, to: CGRect, progress: CGFloat) -> CGRect {
    let size = CGSize(
      width: from.width + ((to.width - from.width) * progress),
      height: from.height + ((to.height - from.height) * progress)
    )
    let startCenter = CGPoint(x: from.midX, y: from.midY)
    let endCenter = CGPoint(x: to.midX, y: to.midY)
    let midpoint = CGPoint(
      x: (startCenter.x + endCenter.x) * 0.5,
      y: max(startCenter.y, endCenter.y)
    )
    let distance = hypot(endCenter.x - startCenter.x, endCenter.y - startCenter.y)
    let controlPoint = CGPoint(
      x: midpoint.x,
      y: midpoint.y + min(140, max(44, distance * 0.18))
    )
    let inverse = 1 - progress
    let center = CGPoint(
      x: (inverse * inverse * startCenter.x)
        + (2 * inverse * progress * controlPoint.x)
        + (progress * progress * endCenter.x),
      y: (inverse * inverse * startCenter.y)
        + (2 * inverse * progress * controlPoint.y)
        + (progress * progress * endCenter.y)
    )
    return CGRect(
      x: center.x - (size.width * 0.5),
      y: center.y - (size.height * 0.5),
      width: size.width,
      height: size.height
    )
  }

  private static func makePanelView(
    controller: PermissionFlowController,
    localeIdentifier: String?
  ) -> AnyView {
    let view = PermissionFlowPanelView(controller: controller)
    guard let localeIdentifier else { return AnyView(view) }
    return AnyView(view.environment(\.locale, .init(identifier: localeIdentifier)))
  }
}
