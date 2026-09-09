import AppKit
@preconcurrency import ApplicationServices
import CoreGraphics

@available(macOS 13.0, *)
@MainActor
final class SettingsWindowTracker {
  private let bundleIdentifier = "com.apple.systempreferences"
  private let pollInterval: TimeInterval = 1.0 / 30.0
  private let missingAppThreshold = 12

  var onFrameChange: ((CGRect) -> Void)?
  var onTrackingEnded: (() -> Void)?
  private(set) var currentFrame: CGRect?

  private var pollTimer: Timer?
  private var hasActiveTrackingTarget = false
  private var missingAppPollCount = 0

  func startTracking(promptIfNeeded: Bool) {
    if promptIfNeeded {
      let options = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
      _ = AXIsProcessTrustedWithOptions(options)
    }
    stopTracking()
    pollTimer = Timer.scheduledTimer(withTimeInterval: pollInterval, repeats: true) {
      [weak self] _ in
      Task { @MainActor [weak self] in
        self?.updateTrackedFrame()
      }
    }
    pollTimer?.tolerance = pollInterval * 0.25
    updateTrackedFrame()
  }

  func stopTracking() {
    pollTimer?.invalidate()
    pollTimer = nil
    currentFrame = nil
    hasActiveTrackingTarget = false
    missingAppPollCount = 0
  }

  private func updateTrackedFrame() {
    guard let application = runningSettingsApplication() else {
      finishTrackingIfNeededBecauseAppExited()
      return
    }
    hasActiveTrackingTarget = true
    missingAppPollCount = 0

    let frame =
      accessibilityFrame(for: application.processIdentifier)
      ?? windowServerFrame(for: application.processIdentifier)
    guard let frame, frame != currentFrame else { return }
    currentFrame = frame
    onFrameChange?(frame)
  }

  private func accessibilityFrame(for processIdentifier: pid_t) -> CGRect? {
    guard AXIsProcessTrusted() else { return nil }
    let application = AXUIElementCreateApplication(processIdentifier)
    guard
      let window = elementValue(for: kAXMainWindowAttribute, element: application)
        ?? elementValue(for: kAXFocusedWindowAttribute, element: application)
    else {
      return nil
    }
    guard let position = pointValue(for: kAXPositionAttribute, element: window),
      let size = sizeValue(for: kAXSizeAttribute, element: window)
    else {
      return nil
    }
    return appKitFrame(fromGlobalTopLeftFrame: CGRect(origin: position, size: size))
  }

  private func elementValue(for key: String, element: AXUIElement) -> AXUIElement? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success,
      let value,
      CFGetTypeID(value) == AXUIElementGetTypeID()
    else {
      return nil
    }
    return unsafeBitCast(value, to: AXUIElement.self)
  }

  private func pointValue(for key: String, element: AXUIElement) -> CGPoint? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success,
      let value,
      CFGetTypeID(value) == AXValueGetTypeID()
    else {
      return nil
    }
    let axValue = unsafeBitCast(value, to: AXValue.self)
    guard AXValueGetType(axValue) == .cgPoint else { return nil }
    var point = CGPoint.zero
    return AXValueGetValue(axValue, .cgPoint, &point) ? point : nil
  }

  private func sizeValue(for key: String, element: AXUIElement) -> CGSize? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success,
      let value,
      CFGetTypeID(value) == AXValueGetTypeID()
    else {
      return nil
    }
    let axValue = unsafeBitCast(value, to: AXValue.self)
    guard AXValueGetType(axValue) == .cgSize else { return nil }
    var size = CGSize.zero
    return AXValueGetValue(axValue, .cgSize, &size) ? size : nil
  }

  private func runningSettingsApplication() -> NSRunningApplication? {
    NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier)
      .max { lhs, rhs in
        (lhs.activationPolicy == .prohibited ? 0 : 1)
          < (rhs.activationPolicy == .prohibited ? 0 : 1)
      }
  }

  private func windowServerFrame(for processIdentifier: pid_t) -> CGRect? {
    guard
      let windows = CGWindowListCopyWindowInfo(
        [.optionOnScreenOnly, .excludeDesktopElements],
        kCGNullWindowID
      ) as? [[String: Any]]
    else {
      return nil
    }
    return
      windows
      .filter { window in
        guard let ownerPID = window[kCGWindowOwnerPID as String] as? pid_t else {
          return false
        }
        let layer = window[kCGWindowLayer as String] as? Int ?? 0
        let alpha = window[kCGWindowAlpha as String] as? Double ?? 1
        return ownerPID == processIdentifier && layer == 0 && alpha > 0
      }
      .compactMap { window -> CGRect? in
        guard let bounds = window[kCGWindowBounds as String] as? NSDictionary,
          let frame = CGRect(dictionaryRepresentation: bounds)
        else {
          return nil
        }
        let convertedFrame = appKitFrame(fromGlobalTopLeftFrame: frame)
        guard convertedFrame.width > 320, convertedFrame.height > 240 else {
          return nil
        }
        return convertedFrame
      }
      .max { lhs, rhs in
        lhs.width * lhs.height < rhs.width * rhs.height
      }
  }

  private func appKitFrame(fromGlobalTopLeftFrame frame: CGRect) -> CGRect {
    let screens = NSScreen.screens.compactMap { screen -> (CGRect, CGRect)? in
      guard
        let number = screen.deviceDescription[
          NSDeviceDescriptionKey("NSScreenNumber")
        ] as? NSNumber
      else {
        return nil
      }
      return (screen.frame, CGDisplayBounds(CGDirectDisplayID(number.uint32Value)))
    }
    guard
      let matchedScreen =
        screens
        .filter({ $0.1.intersects(frame) })
        .max(by: { lhs, rhs in
          lhs.1.intersection(frame).width * lhs.1.intersection(frame).height
            < rhs.1.intersection(frame).width * rhs.1.intersection(frame).height
        })
    else {
      return frame
    }
    let localX = frame.minX - matchedScreen.1.minX
    let localY = frame.minY - matchedScreen.1.minY
    return CGRect(
      x: matchedScreen.0.minX + localX,
      y: matchedScreen.0.maxY - localY - frame.height - 3,
      width: frame.width,
      height: frame.height
    )
  }

  private func finishTrackingIfNeededBecauseAppExited() {
    guard hasActiveTrackingTarget || currentFrame != nil else { return }
    missingAppPollCount += 1
    guard missingAppPollCount >= missingAppThreshold else { return }
    stopTracking()
    onTrackingEnded?()
  }
}
