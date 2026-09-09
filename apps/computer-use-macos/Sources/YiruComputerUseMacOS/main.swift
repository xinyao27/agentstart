import AppKit
import ApplicationServices
import CoreGraphics
import Darwin
import Foundation
import ImageIO
import YiruComputerUseMacOSCore
import ScreenCaptureKit

private let providerName = "yiru-computer-use-macos"
private let providerVersion = "1.0.0"
private let providerProtocolVersion = 1

struct Request: Decodable {
    let id: Int
    let method: String
    let params: [String: JSONValue]?
    let token: String?
}

enum JSONValue: Decodable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    var string: String? {
        if case let .string(value) = self { return value }
        return nil
    }

    var number: Double? {
        if case let .number(value) = self { return value }
        return nil
    }

    var bool: Bool? {
        if case let .bool(value) = self { return value }
        return nil
    }
}

enum ProviderError: Error {
    case coded(String, String)

    var code: String {
        switch self {
        case let .coded(code, _):
            return code
        }
    }

    var message: String {
        switch self {
        case let .coded(_, message):
            return message
        }
    }
}

struct AppDescriptor {
    let name: String
    let bundleId: String?
    let pid: pid_t
    let app: NSRunningApplication

    var needsManualAccessibilityMode: Bool {
        // Chromium/Electron apps often need this private AX mode, but applying it
        // broadly can corrupt native Cocoa app trees into app-root-only nodes.
        guard let bundleId = bundleId?.lowercased() else {
            return false
        }
        return bundleId.hasPrefix("com.google.chrome") ||
            bundleId.hasPrefix("com.microsoft.edgemac") ||
            bundleId.hasPrefix("com.brave.browser") ||
            bundleId.hasPrefix("com.operasoftware.opera") ||
            bundleId.hasPrefix("com.vivaldi.vivaldi") ||
            bundleId == "com.github.electron" ||
            bundleId == "com.tinyspeck.slackmacgap" ||
            bundleId == "com.spotify.client" ||
            bundleId == "com.hnc.discord" ||
            bundleId == "com.microsoft.teams2" ||
            bundleId == "notion.id"
    }

    var isKnownBrowser: Bool {
        let bundle = bundleId?.lowercased() ?? ""
        let appName = name.lowercased()
        return bundle == "com.apple.safari" ||
            bundle == "org.mozilla.firefox" ||
            bundle == "company.thebrowser.browser" ||
            bundle == "app.zen-browser.zen" ||
            bundle.hasPrefix("com.google.chrome") ||
            bundle.hasPrefix("com.microsoft.edgemac") ||
            bundle.hasPrefix("com.brave.browser") ||
            bundle.hasPrefix("com.operasoftware.opera") ||
            bundle.hasPrefix("com.vivaldi.vivaldi") ||
            appName == "safari" ||
            appName == "firefox" ||
            appName == "arc" ||
            appName == "zen" ||
            appName.contains("chrome") ||
            appName.contains("chromium") ||
            appName.contains("edge") ||
            appName.contains("brave") ||
            appName.contains("opera") ||
            appName.contains("vivaldi")
    }
}

final class ElementRecord {
    let index: Int
    let element: AXUIElement
    let localFrame: CGRect?
    let actions: [String]
    let signature: String

    init(index: Int, element: AXUIElement, localFrame: CGRect?, actions: [String], signature: String) {
        self.index = index
        self.element = element
        self.localFrame = localFrame
        self.actions = actions
        self.signature = signature
    }
}

struct Snapshot {
    let id: String
    let app: AppDescriptor
    let windowTitle: String
    let windowBounds: CGRect
    let windowId: CGWindowID
    let windowLayer: Int
    let treeText: String
    let focusedElementId: Int?
    let screenshot: ScreenshotPayload?
    let screenshotStatus: ScreenshotStatus
    let screenshotScale: CGSize
    let screenshotEngine: String?
    let elements: [Int: ElementRecord]
    let truncated: Bool
    let maxDepthReached: Bool

    func withoutScreenshotPayload() -> Snapshot {
        Snapshot(
            id: id,
            app: app,
            windowTitle: windowTitle,
            windowBounds: windowBounds,
            windowId: windowId,
            windowLayer: windowLayer,
            treeText: treeText,
            focusedElementId: focusedElementId,
            screenshot: nil,
            screenshotStatus: .skipped,
            screenshotScale: CGSize(width: 1, height: 1),
            screenshotEngine: nil,
            elements: elements,
            truncated: truncated,
            maxDepthReached: maxDepthReached
        )
    }
}

struct ScreenshotPayload {
    let data: String
    let width: Int
    let height: Int
    let scale: Double
}

struct CapturedImage {
    let image: CGImage
    let engine: String
}

enum ScreenshotStatus {
    case captured
    case skipped
    case failed(String)
}

private struct CachedSnapshotEntry {
    let snapshotId: String
    let keys: [String]
    let createdAt: Date
}

final class Provider {
    private var snapshots: [String: Snapshot] = [:]
    private var snapshotEntries: [CachedSnapshotEntry] = []

    func handle(method: String, params: [String: JSONValue]) throws -> Any {
        switch method {
        case "handshake":
            return providerHandshake()
        case "listApps":
            return ["apps": listApps().map(renderListedApp)]
        case "listWindows":
            return try listWindows(params: params)
        case "getAppState":
            return try renderSnapshot(observe(params: params))
        case "click":
            return try actionResult(params: params) { try click(params: params) }
        case "performSecondaryAction":
            return try actionResult(params: params) { try performSecondaryAction(params: params) }
        case "setValue":
            return try actionResult(params: params) { try setValue(params: params) }
        case "typeText":
            return try actionResult(params: params) { try typeText(params: params) }
        case "pressKey":
            return try actionResult(params: params) { try pressKey(params: params) }
        case "hotkey":
            return try actionResult(params: params) { try hotkey(params: params) }
        case "pasteText":
            return try actionResult(params: params) { try pasteText(params: params) }
        case "scroll":
            return try actionResult(params: params) { try scroll(params: params) }
        case "drag":
            return try actionResult(params: params) { try drag(params: params) }
        default:
            throw ProviderError.coded("invalid_argument", "unknown method '\(method)'")
        }
    }

    private func actionResult(params: [String: JSONValue], action runAction: () throws -> [String: Any]) throws -> [String: Any] {
        var action = try runAction()
        do {
            return try renderActionResult(action: action, snapshot: observe(params: params))
        } catch let error as ProviderError where (error.code == "window_not_found" || error.code == "window_stale") && hasRequestedWindowSelector(params) {
            var fallbackParams = params
            fallbackParams.removeValue(forKey: "windowId")
            fallbackParams.removeValue(forKey: "windowIndex")
            if action["verification"] == nil {
                action["verification"] = ["state": "unverified", "reason": "window_changed"]
            }
            return try renderActionResult(action: action, snapshot: observe(params: fallbackParams))
        }
    }

    private func observe(params: [String: JSONValue]) throws -> Snapshot {
        let query = try requiredString(params, "app")
        let windowId = try requestedWindowId(params)
        let windowIndex = try requestedWindowIndex(params)
        let app = try resolveApp(query)
        if params["restoreWindow"]?.bool == true {
            recoverWindow(app)
        }
        let snapshot = try buildSnapshot(
            app: app,
            includeScreenshot: params["noScreenshot"]?.bool != true,
            windowId: windowId,
            windowIndex: windowIndex,
            restoreWindow: params["restoreWindow"]?.bool == true
        )
        // Why: cached snapshots only validate element identity for follow-up
        // actions; retaining MB-scale screenshot base64 in the long-lived agent grows memory.
        rememberSnapshot(
            query: query,
            app: app,
            snapshot: snapshot.withoutScreenshotPayload(),
            params: params,
            windowIndex: windowIndex
        )
        return snapshot
    }

    private func rememberSnapshot(
        query: String,
        app: AppDescriptor,
        snapshot cachedSnapshot: Snapshot,
        params: [String: JSONValue],
        windowIndex: Int?
    ) {
        let keys = [query, app.name, app.bundleId ?? "", "pid:\(app.pid)"]
            .filter { !$0.isEmpty }
            .map { $0.lowercased() }
        let namespace = snapshotNamespace(params)
        var storedKeys: [String] = []
        let canonicalWindowKey = snapshotCanonicalWindowIdKey(cachedSnapshot.windowId)
        if !isExplicitSnapshotNamespace(namespace) {
            snapshots[canonicalWindowKey.lowercased()] = cachedSnapshot
            storedKeys.append(canonicalWindowKey.lowercased())
        }
        snapshots[namespacedSnapshotKey(namespace, canonicalWindowKey)] = cachedSnapshot
        storedKeys.append(namespacedSnapshotKey(namespace, canonicalWindowKey))
        if let windowIndex {
            let canonicalWindowIndexKey = snapshotCanonicalWindowIndexKey(windowIndex)
            if !isExplicitSnapshotNamespace(namespace) {
                snapshots[canonicalWindowIndexKey.lowercased()] = cachedSnapshot
                storedKeys.append(canonicalWindowIndexKey.lowercased())
            }
            snapshots[namespacedSnapshotKey(namespace, canonicalWindowIndexKey)] = cachedSnapshot
            storedKeys.append(namespacedSnapshotKey(namespace, canonicalWindowIndexKey))
        }
        for key in keys {
            if !isExplicitSnapshotNamespace(namespace) {
                snapshots[key] = cachedSnapshot
                storedKeys.append(key)
                snapshots[snapshotWindowKey(key, cachedSnapshot.windowId)] = cachedSnapshot
                storedKeys.append(snapshotWindowKey(key, cachedSnapshot.windowId))
                if let windowIndex {
                    snapshots[snapshotWindowIndexKey(key, windowIndex)] = cachedSnapshot
                    storedKeys.append(snapshotWindowIndexKey(key, windowIndex))
                }
            }
            snapshots[namespacedSnapshotKey(namespace, key)] = cachedSnapshot
            storedKeys.append(namespacedSnapshotKey(namespace, key))
            let namespacedWindowKey = namespacedSnapshotKey(
                namespace,
                snapshotWindowKey(key, cachedSnapshot.windowId)
            )
            snapshots[namespacedWindowKey] = cachedSnapshot
            storedKeys.append(namespacedWindowKey)
            if let windowIndex {
                let namespacedWindowIndexKey = namespacedSnapshotKey(
                    namespace,
                    snapshotWindowIndexKey(key, windowIndex)
                )
                snapshots[namespacedWindowIndexKey] = cachedSnapshot
                storedKeys.append(namespacedWindowIndexKey)
            }
        }
        snapshotEntries.append(
            CachedSnapshotEntry(snapshotId: cachedSnapshot.id, keys: storedKeys, createdAt: Date())
        )
        pruneSnapshotCache()
    }

    private func pruneSnapshotCache() {
        let now = Date()
        while let oldest = snapshotEntries.first,
              ComputerSnapshotCachePolicy.shouldPrune(
                  entryCount: snapshotEntries.count,
                  createdAt: oldest.createdAt,
                  now: now
              ) {
            let expired = snapshotEntries.removeFirst()
            for key in expired.keys where snapshots[key]?.id == expired.snapshotId {
                snapshots.removeValue(forKey: key)
            }
        }
    }

    private func currentSnapshot(params: [String: JSONValue]) throws -> Snapshot {
        pruneSnapshotCache()
        let cached = try cachedSnapshot(params: params)
        // Why: cached AX frames can be stale after a window move or resize, and
        // stale geometry can turn an intended action into a misclick.
        let snapshot = try observe(params: params.merging(["noScreenshot": .bool(true)]) { _, replacement in replacement })
        try validateRequestedElements(cached: cached, current: snapshot, params: params)
        return snapshot
    }

    private func currentKeyboardSnapshot(params: [String: JSONValue]) throws -> Snapshot {
        // Why: AX text replacement/select-all do not post global input, so only
        // synthetic fallback paths require the target window to be focused.
        try currentSnapshot(params: params.merging(["noScreenshot": .bool(true)]) { _, replacement in replacement })
    }

    private func cachedSnapshot(params: [String: JSONValue]) throws -> Snapshot? {
        guard let query = params["app"]?.string, !query.isEmpty else { return nil }
        let namespace = snapshotNamespace(params)
        if let targetWindowId = try requestedWindowId(params) {
            let canonicalKey = snapshotCanonicalWindowIdKey(targetWindowId)
            if let cached = snapshots[namespacedSnapshotKey(namespace, canonicalKey)] {
                return cached
            }
            if !isExplicitSnapshotNamespace(namespace), let cached = snapshots[canonicalKey.lowercased()] {
                return cached
            }
            let windowKey = snapshotWindowKey(query.lowercased(), targetWindowId)
            if let cached = snapshots[namespacedSnapshotKey(namespace, windowKey)] {
                return cached
            }
            if !isExplicitSnapshotNamespace(namespace), let cached = snapshots[windowKey] {
                return cached
            }
            return nil
        }
        if let targetWindowIndex = try requestedWindowIndex(params) {
            let canonicalKey = snapshotCanonicalWindowIndexKey(targetWindowIndex)
            if let cached = snapshots[namespacedSnapshotKey(namespace, canonicalKey)] {
                return cached
            }
            if !isExplicitSnapshotNamespace(namespace), let cached = snapshots[canonicalKey.lowercased()] {
                return cached
            }
            let windowKey = snapshotWindowIndexKey(query.lowercased(), targetWindowIndex)
            if let cached = snapshots[namespacedSnapshotKey(namespace, windowKey)] {
                return cached
            }
            if !isExplicitSnapshotNamespace(namespace), let cached = snapshots[windowKey] {
                return cached
            }
            return nil
        }
        let key = query.lowercased()
        return snapshots[namespacedSnapshotKey(namespace, key)] ??
            (isExplicitSnapshotNamespace(namespace) ? nil : snapshots[key])
    }

    private func validateRequestedElements(cached: Snapshot?, current: Snapshot, params: [String: JSONValue]) throws {
        let requestedIndexes = try ["elementIndex", "fromElementIndex", "toElementIndex"].compactMap { key -> Int? in
            guard params[key]?.number != nil else { return nil }
            return try optionalInteger(params, key)
        }
        guard !requestedIndexes.isEmpty else { return }
        guard let cached else {
            throw ProviderError.coded("element_not_found", "element indexes require a fresh get-app-state snapshot for this app/window")
        }
        for index in requestedIndexes {
            guard let expected = cached.elements[index], let actual = current.elements[index] else {
                throw ProviderError.coded("element_not_found", "element \(index) is stale; run get-app-state again and use a fresh element index")
            }
            guard expected.signature == actual.signature else {
                throw ProviderError.coded("element_not_found", "element \(index) changed since the last snapshot; run get-app-state again and use a fresh element index")
            }
        }
    }

    private func ensureWindowStillAvailable(_ snapshot: Snapshot) throws {
        guard WindowCapture.candidates(pid: snapshot.app.pid).contains(where: { $0.windowId == snapshot.windowId }) else {
            throw ProviderError.coded("window_stale", "window \(Int(snapshot.windowId)) is no longer available; run get-app-state again to refresh the target window")
        }
    }

    private func listApps() -> [AppDescriptor] {
        var seen = Set<String>()
        return NSWorkspace.shared.runningApplications
            .filter { !$0.isTerminated && $0.activationPolicy == .regular }
            .compactMap { app in
                guard let name = app.localizedName, !name.isEmpty else { return nil }
                let pid = app.processIdentifier
                guard pid > 0, pidIsLive(pid) else { return nil }
                let key = (app.bundleIdentifier ?? "pid:\(pid)").lowercased()
                guard seen.insert(key).inserted else { return nil }
                return AppDescriptor(name: name, bundleId: app.bundleIdentifier, pid: pid, app: app)
            }
            .sorted { lhs, rhs in
                if lhs.app.isActive != rhs.app.isActive {
                    return lhs.app.isActive && !rhs.app.isActive
                }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
    }

    private func renderListedApp(_ app: AppDescriptor) -> [String: Any] {
        [
            "name": app.name,
            "bundleId": jsonNullable(app.bundleId),
            "pid": Int(app.pid),
            "isRunning": true,
            "lastUsedAt": NSNull(),
            "useCount": NSNull(),
        ]
    }

    private func providerHandshake() -> [String: Any] {
        [
            "platform": "darwin",
            "provider": providerName,
            "providerVersion": providerVersion,
            "protocolVersion": providerProtocolVersion,
            "supports": [
                "apps": [
                    "list": true,
                    "bundleIds": true,
                    "pids": true,
                ],
                "windows": [
                    "list": true,
                    "targetById": true,
                    "targetByIndex": true,
                    "focus": false,
                    "moveResize": false,
                ],
                "observation": [
                    "screenshot": true,
                    "annotatedScreenshot": false,
                    "elementFrames": true,
                    "ocr": false,
                ],
                "actions": [
                    "click": true,
                    "typeText": true,
                    "pressKey": true,
                    "hotkey": true,
                    "pasteText": true,
                    "scroll": true,
                    "drag": true,
                    "setValue": true,
                    "performAction": true,
                ],
                "surfaces": [
                    "menus": false,
                    "dialogs": false,
                    "dock": false,
                    "menubar": false,
                ],
            ],
        ]
    }

    private func resolveApp(_ query: String) throws -> AppDescriptor {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw ProviderError.coded("invalid_argument", "app query must not be empty")
        }
        if let pid = parsePid(trimmed) {
            if let app = appByPid(pid) {
                try rejectBlockedApp(app)
                return app
            }
            throw ProviderError.coded("app_not_found", "app '\(trimmed)' not found")
        }
        if blockedBundleIds.contains(trimmed) {
            throw ProviderError.coded("app_blocked", "app '\(trimmed)' is blocked for safety")
        }
        if let app = listApps().first(where: { matches($0, query: trimmed) }) {
            try rejectBlockedApp(app)
            return app
        }
        throw ProviderError.coded("app_not_found", "app '\(trimmed)' not found")
    }

    private func rejectBlockedApp(_ app: AppDescriptor) throws {
        if let bundle = app.bundleId, blockedBundleIds.contains(bundle) {
            throw ProviderError.coded("app_blocked", "app '\(bundle)' is blocked for safety")
        }
    }

    private func listWindows(params: [String: JSONValue]) throws -> [String: Any] {
        let app = try resolveApp(try requiredString(params, "app"))
        let windows = WindowCapture.candidates(pid: app.pid)
            .filter { $0.layer == 0 }
            .enumerated()
            .map { index, candidate -> [String: Any] in
                [
                    "index": index,
                    "app": [
                        "name": app.name,
                        "bundleId": jsonNullable(app.bundleId),
                        "pid": Int(app.pid),
                    ],
                    "id": Int(candidate.windowId),
                    "title": candidate.title ?? "",
                    "x": Int(candidate.bounds.origin.x.rounded()),
                    "y": Int(candidate.bounds.origin.y.rounded()),
                    "width": Int(candidate.bounds.width.rounded()),
                    "height": Int(candidate.bounds.height.rounded()),
                    "isMinimized": false,
                    "isOffscreen": !candidate.isOnScreen,
                    "screenIndex": jsonNullable(screenIndex(for: candidate.bounds)),
                    "isMain": NSNull(),
                    "platform": [
                        "layer": candidate.layer,
                        "alpha": candidate.alpha,
                    ],
                ]
            }
        return [
            "app": renderListedApp(app),
            "windows": windows,
        ]
    }

    private func appByPid(_ pid: pid_t) -> AppDescriptor? {
        guard let app = NSRunningApplication(processIdentifier: pid),
              !app.isTerminated,
              let name = app.localizedName
        else {
            return nil
        }
        return AppDescriptor(name: name, bundleId: app.bundleIdentifier, pid: pid, app: app)
    }

    private func buildSnapshot(
        app: AppDescriptor,
        includeScreenshot: Bool,
        windowId: CGWindowID?,
        windowIndex: Int?,
        restoreWindow: Bool
    ) throws -> Snapshot {
        guard accessibilityTrusted() else {
            // Why: agents retry failed observations. Only the explicit setup flow
            // should open macOS privacy prompts/settings; runtime calls stay quiet.
            throw ProviderError.coded(
                "permission_denied",
                "Accessibility permission is required for Yiru Computer Use. Run `yiru computer permissions` or open Settings > Computer Use, grant Accessibility to Yiru Computer Use, then retry."
            )
        }
        let appElement = AXUIElementCreateApplication(app.pid)
        enableManualAccessibilityIfNeeded(appElement, app: app)
        let windowCandidates = WindowCapture.candidates(pid: app.pid)
        let focused = try focusedWindow(
            appElement: appElement,
            app: app,
            visibleWindowCount: windowCandidates.count,
            allowRecovery: restoreWindow
        )
        let focusedTitle = stringAttribute(focused, kAXTitleAttribute as String) ?? app.name
        let canCaptureScreenshot = includeScreenshot && screenCaptureTrusted()
        guard let capture = WindowCapture.resolve(
            candidates: windowCandidates,
            titleHint: focusedTitle,
            windowId: windowId,
            windowIndex: windowIndex,
            captureImage: canCaptureScreenshot
        ) else {
            throw ProviderError.coded("window_not_found", "app '\(app.name)' has no on-screen window")
        }
        guard let window = matchingWindow(appElement: appElement, capture: capture, focused: focused, explicitTarget: windowId != nil || windowIndex != nil) else {
            throw ProviderError.coded("window_not_found", "could not match accessibility window to requested window; run get-app-state again or retry without a window selector")
        }
        let title = stringAttribute(window, kAXTitleAttribute as String) ?? capture.title ?? app.name
        let renderer = TreeRenderer(
            windowBounds: capture.bounds,
            focused: focusedElement(appElement: appElement),
            compactBrowserTabs: app.isKnownBrowser
        )
        renderer.render(window)
        let screenshot = includeScreenshot ? capture.screenshotPayload() : nil
        let screenshotStatus: ScreenshotStatus = if screenshot != nil {
            .captured
        } else if includeScreenshot && !canCaptureScreenshot {
            .failed("Screen Recording permission is required for Yiru Computer Use; grant permission or pass --no-screenshot to inspect accessibility state only.")
        } else if includeScreenshot {
            .failed("window screenshot capture returned no image; retry with --no-screenshot if accessibility state is sufficient.")
        } else {
            .skipped
        }
        return Snapshot(
            id: UUID().uuidString,
            app: app,
            windowTitle: title,
            windowBounds: capture.bounds,
            windowId: capture.windowId,
            windowLayer: capture.layer,
            treeText: renderTreeText(app: app, title: title, bounds: capture.bounds, lines: renderer.lines, focused: renderer.focusedSummary),
            focusedElementId: renderer.focusedElementId,
            screenshot: screenshot,
            screenshotStatus: screenshotStatus,
            screenshotScale: screenshotScale(screenshot: screenshot, bounds: capture.bounds),
            screenshotEngine: capture.image?.engine,
            elements: renderer.records,
            truncated: renderer.truncated,
            maxDepthReached: renderer.maxDepthReached
        )
    }

    private func renderSnapshot(_ snapshot: Snapshot) -> [String: Any] {
        var screenshot: Any = NSNull()
        if let payload = snapshot.screenshot {
            screenshot = [
                "data": payload.data,
                "format": "png",
                "width": payload.width,
                "height": payload.height,
                "scale": payload.scale,
            ]
        }
        return [
            "snapshot": [
                "id": snapshot.id,
                "app": [
                    "name": snapshot.app.name,
                    "bundleId": jsonNullable(snapshot.app.bundleId),
                    "pid": Int(snapshot.app.pid),
                ],
                "window": [
                    "id": Int(snapshot.windowId),
                    "title": snapshot.windowTitle,
                    "x": Int(snapshot.windowBounds.origin.x.rounded()),
                    "y": Int(snapshot.windowBounds.origin.y.rounded()),
                    "width": Int(snapshot.windowBounds.width.rounded()),
                    "height": Int(snapshot.windowBounds.height.rounded()),
                    "isMinimized": false,
                    "isOffscreen": false,
                    "screenIndex": jsonNullable(screenIndex(for: snapshot.windowBounds)),
                    "platform": [
                        "layer": snapshot.windowLayer,
                    ],
                ],
                "coordinateSpace": "window",
                "treeText": snapshot.treeText,
                "elementCount": snapshot.elements.count,
                "focusedElementId": snapshot.focusedElementId as Any,
                "truncation": [
                    "truncated": snapshot.truncated,
                    "maxNodes": TreeRenderer.maxNodes,
                    "maxDepth": TreeRenderer.maxDepth,
                    "maxDepthReached": snapshot.maxDepthReached,
                ],
            ],
            "screenshot": screenshot,
            "screenshotStatus": renderScreenshotStatus(snapshot.screenshotStatus, snapshot: snapshot),
        ]
    }

    private func renderActionResult(action: [String: Any], snapshot: Snapshot) -> [String: Any] {
        var result = renderSnapshot(snapshot)
        var metadata = action
        metadata["targetWindowId"] = Int(snapshot.windowId)
        result["action"] = metadata
        return result
    }

    private func click(params: [String: JSONValue]) throws -> [String: Any] {
        let snapshot = try currentSnapshot(params: params)
        let button = params["mouseButton"]?.string ?? "left"
        let count = try positiveInteger(params["clickCount"]?.number, defaultValue: 1, name: "clickCount")
        if let elementIndex = try optionalInteger(params, "elementIndex") {
            let record = try element(snapshot, elementIndex)
            if count <= 1, let actionName = try performClickAction(record: record, mouseButton: button) {
                return actionMetadata(path: "accessibility", actionName: actionName)
            }
            if let point = center(record.localFrame, in: snapshot.windowBounds) {
                prepareForSyntheticInput(snapshot.app)
                try Input.click(
                    pid: snapshot.app.pid,
                    at: point,
                    button: mouseButton(button),
                    count: count
                )
                return actionMetadata(path: "synthetic", fallbackReason: "actionUnsupported")
            }
            throw ProviderError.coded("element_not_clickable", "element \(record.index) has no clickable frame")
        }
        prepareForSyntheticInput(snapshot.app)
        let point = try coordinatePoint(params: params, xKey: "x", yKey: "y", snapshot: snapshot)
        try Input.click(
            pid: snapshot.app.pid,
            at: point,
            button: mouseButton(button),
            count: count
        )
        return actionMetadata(path: "synthetic")
    }

    private func performClickAction(record: ElementRecord, mouseButton: String) throws -> String? {
        if mouseButton == "right" {
            return performAction(record.element, "AXShowMenu") ? "AXShowMenu" : nil
        }
        for action in ["AXPress", "AXConfirm", "AXOpen"] {
            if performAction(record.element, action) {
                return action
            }
        }
        return nil
    }

    private func performSecondaryAction(params: [String: JSONValue]) throws -> [String: Any] {
        let snapshot = try currentSnapshot(params: params)
        let record = try element(snapshot, try requiredInteger(params, "elementIndex"))
        let requested = try requiredString(params, "action")
        let action = record.actions.first { SnapshotRenderHeuristics.prettyAction($0).caseInsensitiveCompare(requested) == .orderedSame || $0.caseInsensitiveCompare(requested) == .orderedSame }
        guard let action else {
            throw ProviderError.coded("action_not_supported", "'\(requested)' is not a valid secondary action for element \(record.index)")
        }
        guard performAction(record.element, action) else {
            throw ProviderError.coded("accessibility_error", "AXUIElementPerformAction(\(action)) failed")
        }
        return actionMetadata(path: "accessibility", actionName: action)
    }

    private func setValue(params: [String: JSONValue]) throws -> [String: Any] {
        let snapshot = try currentSnapshot(params: params)
        let record = try element(snapshot, try requiredInteger(params, "elementIndex"))
        let expected = try requiredStringAllowingEmpty(params, "value")
        guard isSettable(record.element, kAXValueAttribute as String) else {
            throw ProviderError.coded("value_not_settable", "element \(record.index) is not settable")
        }
        let result = AXUIElementSetAttributeValue(record.element, kAXValueAttribute as CFString, expected as CFString)
        guard result == .success else {
            throw ProviderError.coded("accessibility_error", "AXUIElementSetAttributeValue failed with \(result.rawValue)")
        }
        let actual = rawStringAttribute(record.element, kAXValueAttribute as String)
        let verification = actual == expected
            ? verifiedAction(property: "value", expected: expected, actualPreview: actual)
            : unverifiedAction(reason: actual == nil ? "provider_unavailable" : "value_mismatch", expected: expected, actualPreview: actual)
        return actionMetadata(path: "accessibility", actionName: "AXSetValue", verification: verification)
    }

    private func typeText(params: [String: JSONValue]) throws -> [String: Any] {
        let snapshot = try currentKeyboardSnapshot(params: params)
        let text = try requiredString(params, "text")
        if let focused = focusedRecord(snapshot), let verification = TextInput.replaceSelection(focused.element, with: text) {
            return actionMetadata(path: "accessibility", actionName: "AXReplaceSelection", verification: verification)
        }
        try requireTargetWindowFocused(snapshot, restoreWindowRequested: params["restoreWindow"]?.bool == true)
        try Input.typeText(text, pid: snapshot.app.pid)
        return actionMetadata(
            path: "synthetic",
            actionName: "typeText",
            verification: unverifiedAction(reason: "synthetic_input")
        )
    }

    private func pressKey(params: [String: JSONValue]) throws -> [String: Any] {
        let snapshot = try currentKeyboardSnapshot(params: params)
        try requireTargetWindowFocused(snapshot, restoreWindowRequested: params["restoreWindow"]?.bool == true)
        try Input.pressKey(try requiredString(params, "key"), pid: snapshot.app.pid)
        return actionMetadata(
            path: "synthetic",
            actionName: "pressKey",
            verification: unverifiedAction(reason: "synthetic_input")
        )
    }

    private func hotkey(params: [String: JSONValue]) throws -> [String: Any] {
        let snapshot = try currentKeyboardSnapshot(params: params)
        let key = try requiredString(params, "key")
        if isSelectAllHotkey(key), let focused = focusedRecord(snapshot), TextInput.selectAll(focused.element) {
            return actionMetadata(
                path: "accessibility",
                actionName: "AXSelectAll",
                verification: TextInput.selectionVerification(focused.element)
            )
        }
        try requireTargetWindowFocused(snapshot, restoreWindowRequested: params["restoreWindow"]?.bool == true)
        try Input.pressKey(key, pid: snapshot.app.pid)
        return actionMetadata(
            path: "synthetic",
            actionName: "hotkey",
            verification: unverifiedAction(reason: "synthetic_input")
        )
    }

    private func pasteText(params: [String: JSONValue]) throws -> [String: Any] {
        let snapshot = try currentKeyboardSnapshot(params: params)
        let text = try requiredString(params, "text")
        if let focused = focusedRecord(snapshot), let verification = TextInput.replaceSelection(focused.element, with: text) {
            return actionMetadata(path: "accessibility", actionName: "AXReplaceSelection", verification: verification)
        }
        try requireTargetWindowFocused(snapshot, restoreWindowRequested: params["restoreWindow"]?.bool == true)
        try Input.pasteText(text, pid: snapshot.app.pid)
        return actionMetadata(
            path: "clipboard",
            actionName: "paste",
            verification: unverifiedAction(reason: "clipboard_paste")
        )
    }

    private func scroll(params: [String: JSONValue]) throws -> [String: Any] {
        let snapshot = try currentSnapshot(params: params)
        let direction = try scrollDirection(try requiredString(params, "direction"))
        let pages = try positiveNumber(params["pages"]?.number, defaultValue: 1, name: "pages")
        if let elementIndex = try optionalInteger(params, "elementIndex") {
            let record = try element(snapshot, elementIndex)
            let action = "AXScroll\(direction.capitalized)ByPage"
            if pages.rounded() == pages, let pageCount = boundedInteger(pages, as: Int.self),
               record.actions.contains(action) {
                for _ in 0..<max(1, pageCount) {
                    _ = performAction(record.element, action)
                }
                return actionMetadata(path: "accessibility", actionName: action)
            }
            guard let point = center(record.localFrame, in: snapshot.windowBounds) else {
                throw ProviderError.coded("element_not_found", "element \(record.index) has no scrollable frame")
            }
            try Input.scroll(pid: snapshot.app.pid, at: point, direction: direction, pages: pages)
            return actionMetadata(path: "synthetic", fallbackReason: "actionUnsupported")
        }
        let point = try coordinatePoint(params: params, xKey: "x", yKey: "y", snapshot: snapshot)
        try Input.scroll(pid: snapshot.app.pid, at: point, direction: direction, pages: pages)
        return actionMetadata(path: "synthetic")
    }

    private func drag(params: [String: JSONValue]) throws -> [String: Any] {
        let snapshot = try currentSnapshot(params: params)
        let start: CGPoint
        let end: CGPoint
        if let fromIndex = try optionalInteger(params, "fromElementIndex"),
           let toIndex = try optionalInteger(params, "toElementIndex") {
            let from = try element(snapshot, fromIndex)
            let to = try element(snapshot, toIndex)
            guard let fromPoint = center(from.localFrame, in: snapshot.windowBounds),
                  let toPoint = center(to.localFrame, in: snapshot.windowBounds)
            else {
                throw ProviderError.coded("element_not_found", "drag element has no frame")
            }
            start = fromPoint
            end = toPoint
        } else {
            start = try coordinatePoint(params: params, xKey: "fromX", yKey: "fromY", snapshot: snapshot)
            end = try coordinatePoint(params: params, xKey: "toX", yKey: "toY", snapshot: snapshot)
        }
        try Input.drag(pid: snapshot.app.pid, from: start, to: end)
        return actionMetadata(path: "synthetic")
    }

    private func element(_ snapshot: Snapshot, _ index: Int) throws -> ElementRecord {
        guard let record = snapshot.elements[index] else {
            throw ProviderError.coded("element_not_found", "element \(index) is not in the current cached snapshot for \(snapshot.app.name); run get-app-state again and use a fresh element index")
        }
        return record
    }

    private func focusedRecord(_ snapshot: Snapshot) -> ElementRecord? {
        guard let focusedElementId = snapshot.focusedElementId else {
            return nil
        }
        return snapshot.elements[focusedElementId]
    }
}

private let blockedBundleIds: Set<String> = [
    "com.1password.1password",
    "com.1password.safari",
    "com.bitwarden.desktop",
    "com.dashlane.dashlanephonefinal",
    "com.lastpass.LastPass",
    "com.nordsec.nordpass",
    "me.proton.pass.electron",
    "me.proton.pass.catalyst",
]

private func requiredString(_ params: [String: JSONValue], _ key: String) throws -> String {
    guard let value = params[key]?.string, !value.isEmpty else {
        throw ProviderError.coded("invalid_argument", "missing \(key)")
    }
    return value
}

private func requiredStringAllowingEmpty(_ params: [String: JSONValue], _ key: String) throws -> String {
    guard let value = params[key]?.string else {
        throw ProviderError.coded("invalid_argument", "missing \(key)")
    }
    return value
}

private func requiredNumber(_ params: [String: JSONValue], _ key: String) throws -> Double {
    guard let value = params[key]?.number, value.isFinite else {
        throw ProviderError.coded("invalid_argument", "missing \(key)")
    }
    return value
}

private func requiredInteger(_ params: [String: JSONValue], _ key: String) throws -> Int {
    guard let value = boundedInteger(try requiredNumber(params, key), as: Int.self) else {
        throw ProviderError.coded("invalid_argument", "\(key) is out of range")
    }
    return value
}

private func optionalInteger(_ params: [String: JSONValue], _ key: String) throws -> Int? {
    guard let raw = params[key]?.number else { return nil }
    guard let value = boundedInteger(raw, as: Int.self) else {
        throw ProviderError.coded("invalid_argument", "\(key) is out of range")
    }
    return value
}

private func positiveInteger(_ value: Double?, defaultValue: Int, name: String) throws -> Int {
    switch ActionArgumentValidation.positiveInteger(value, defaultValue: defaultValue, name: name) {
    case let .success(value):
        return value
    case let .failure(error):
        throw ProviderError.coded("invalid_argument", error.message)
    }
}

private func positiveNumber(_ value: Double?, defaultValue: Double, name: String) throws -> Double {
    switch ActionArgumentValidation.positiveNumber(value, defaultValue: defaultValue, name: name) {
    case let .success(value):
        return value
    case let .failure(error):
        throw ProviderError.coded("invalid_argument", error.message)
    }
}

private func scrollDirection(_ value: String) throws -> String {
    switch ActionArgumentValidation.scrollDirection(value) {
    case let .success(value):
        return value
    case let .failure(error):
        throw ProviderError.coded("invalid_argument", error.message)
    }
}

private func parsePid(_ query: String) -> pid_t? {
    guard query.hasPrefix("pid:") else { return nil }
    guard let pid = Int32(query.dropFirst(4)), pid > 0 else { return nil }
    return pid
}

private func matches(_ app: AppDescriptor, query: String) -> Bool {
    app.name.caseInsensitiveCompare(query) == .orderedSame ||
        app.bundleId?.caseInsensitiveCompare(query) == .orderedSame
}

private func pidIsLive(_ pid: pid_t) -> Bool {
    kill(pid, 0) == 0
}

private func accessibilityTrusted() -> Bool {
    AXIsProcessTrusted()
}

private func screenCaptureTrusted() -> Bool {
    CGPreflightScreenCaptureAccess()
}

private func enableManualAccessibilityIfNeeded(_ appElement: AXUIElement, app: AppDescriptor) {
    guard app.needsManualAccessibilityMode else {
        return
    }
    _ = AXUIElementSetAttributeValue(appElement, "AXManualAccessibility" as CFString, kCFBooleanTrue)
    _ = AXUIElementSetAttributeValue(appElement, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
}

private func focusedWindow(appElement: AXUIElement, app: AppDescriptor, visibleWindowCount: Int, allowRecovery: Bool) throws -> AXUIElement {
    let systemWide = AXUIElementCreateSystemWide()
    if let window = focusedSystemWindow(systemWide: systemWide, app: app) {
        return window
    }
    if let window = copyElement(appElement, kAXFocusedWindowAttribute as String), usableWindow(window) {
        return window
    }
    if let windows = copyArray(appElement, kAXWindowsAttribute as String) {
        if let window = windows.first(where: usableWindow) {
            return window
        }
    }
    if allowRecovery {
        recoverWindow(app)
        if let window = focusedSystemWindow(systemWide: systemWide, app: app) {
            return window
        }
        if let window = copyElement(appElement, kAXFocusedWindowAttribute as String), usableWindow(window) {
            return window
        }
        if let windows = copyArray(appElement, kAXWindowsAttribute as String) {
            if let window = windows.first(where: usableWindow) {
                return window
            }
        }
    }
    let permissionHint = visibleWindowCount > 0
        ? " The app has visible windows, so macOS Accessibility may need Yiru Computer Use toggled off and on again in System Settings."
        : ""
    if visibleWindowCount > 0 {
        throw ProviderError.coded("permission_denied", "app '\(app.name)' has visible windows but no accessibility window.\(permissionHint)")
    }
    throw ProviderError.coded("window_not_found", "app '\(app.name)' has no accessibility window; make sure the app has a visible window, then retry with --restore-window.")
}

private func focusedSystemWindow(systemWide: AXUIElement, app: AppDescriptor) -> AXUIElement? {
    guard let focusedApp = copyElement(systemWide, kAXFocusedApplicationAttribute as String),
          pidAttribute(focusedApp) == app.pid
    else {
        return nil
    }
    if let window = copyElement(systemWide, kAXFocusedWindowAttribute as String), usableWindow(window) {
        return window
    }
    if let window = copyElement(focusedApp, kAXFocusedWindowAttribute as String), usableWindow(window) {
        return window
    }
    if let windows = copyArray(focusedApp, kAXWindowsAttribute as String) {
        return windows.first(where: usableWindow)
    }
    return nil
}

private func isTargetWindowFocused(_ snapshot: Snapshot) -> Bool {
    guard let focusedWindow = focusedSystemWindow(systemWide: AXUIElementCreateSystemWide(), app: snapshot.app) else {
        return false
    }
    if windowNumber(focusedWindow) == snapshot.windowId {
        return true
    }
    guard let frame = absoluteFrame(focusedWindow) else {
        return false
    }
    let intersection = frame.intersection(snapshot.windowBounds)
    return !intersection.isNull && intersection.area >= min(frame.area, snapshot.windowBounds.area) * 0.75
}

private func requireTargetWindowFocused(_ snapshot: Snapshot, restoreWindowRequested: Bool) throws {
    guard let failure = KeyboardInputSafety.syntheticInputFocusFailure(
        targetWindowFocused: isTargetWindowFocused(snapshot),
        restoreWindowRequested: restoreWindowRequested
    ) else {
        return
    }
    switch failure {
    case .targetNotFocused:
        throw ProviderError.coded("window_not_focused", "keyboard input requires the target \(snapshot.app.name) window to be focused; retry with --restore-window or use set-value for editable elements")
    case .targetNotFocusedAfterRestore:
        throw ProviderError.coded("window_not_focused", "keyboard input requires the target \(snapshot.app.name) window to be focused; --restore-window was requested but the target is still not focused; bring it forward manually or check Accessibility permissions")
    }
}

private func matchingWindow(appElement: AXUIElement, capture: WindowCapture, focused: AXUIElement, explicitTarget: Bool) -> AXUIElement? {
    guard let windows = copyArray(appElement, kAXWindowsAttribute as String) else {
        return nil
    }
    if let byNumber = windows.first(where: { windowNumber($0) == capture.windowId }) {
        return byNumber
    }
    if let byBounds = windows.first(where: { window in
        guard usableWindow(window), let frame = absoluteFrame(window) else { return false }
        let intersection = frame.intersection(capture.bounds)
        return !intersection.isNull && intersection.area >= min(frame.area, capture.bounds.area) * 0.75
    }) {
        return byBounds
    }
    if explicitTarget {
        return nil
    }
    guard let titleHint = capture.title, !titleHint.isEmpty else {
        return focused
    }
    return windows.first {
        usableWindow($0) && stringAttribute($0, kAXTitleAttribute as String) == titleHint
    } ?? focused
}

private func recoverWindow(_ app: AppDescriptor) {
    _ = app.app.unhide()
    _ = app.app.activate(options: [.activateAllWindows])
    if let bundleId = app.bundleId {
        openBundle(bundleId)
    }
    let appElement = AXUIElementCreateApplication(app.pid)
    if let window = copyElement(appElement, kAXFocusedWindowAttribute as String) ?? copyArray(appElement, kAXWindowsAttribute as String)?.first {
        _ = AXUIElementSetAttributeValue(window, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
        _ = AXUIElementPerformAction(window, kAXRaiseAction as CFString)
        _ = AXUIElementSetAttributeValue(window, kAXMainAttribute as CFString, kCFBooleanTrue)
        _ = AXUIElementSetAttributeValue(window, kAXFocusedAttribute as CFString, kCFBooleanTrue)
    }
    Thread.sleep(forTimeInterval: 0.4)
}

private func prepareForSyntheticInput(_ app: AppDescriptor) {
    // Why: activating an already-frontmost app dismisses transient menus before
    // their synthetic fallback click can land.
    if NSWorkspace.shared.frontmostApplication?.processIdentifier != app.pid {
        recoverWindow(app)
    }
}

private func openBundle(_ bundleId: String) {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    process.arguments = ["-b", bundleId]
    process.standardOutput = Pipe()
    process.standardError = Pipe()
    try? process.run()
    process.waitUntilExit()
}

private func hasRequestedWindowSelector(_ params: [String: JSONValue]) -> Bool {
    params["windowId"] != nil || params["windowIndex"] != nil
}

private func requestedWindowId(_ params: [String: JSONValue]) throws -> CGWindowID? {
    guard let raw = params["windowId"] else { return nil }
    guard let value = raw.number, value >= 0, let id = boundedInteger(value, as: UInt32.self) else {
        throw ProviderError.coded("invalid_argument", "windowId is out of range")
    }
    return CGWindowID(id)
}

private func snapshotWindowKey(_ query: String, _ windowId: CGWindowID) -> String {
    "\(query.lowercased())#window:\(Int(windowId))"
}

private func snapshotCanonicalWindowIdKey(_ windowId: CGWindowID) -> String {
    "window-id:\(Int(windowId))"
}

private func snapshotWindowIndexKey(_ query: String, _ windowIndex: Int) -> String {
    "\(query.lowercased())#windowIndex:\(windowIndex)"
}

private func snapshotCanonicalWindowIndexKey(_ windowIndex: Int) -> String {
    "window-index:\(windowIndex)"
}

private func snapshotNamespace(_ params: [String: JSONValue]) -> String {
    if let session = params["session"]?.string, !session.isEmpty {
        return "session:\(session)"
    }
    if let worktree = params["worktree"]?.string, !worktree.isEmpty {
        return "worktree:\(worktree)"
    }
    return "default"
}

private func namespacedSnapshotKey(_ namespace: String, _ key: String) -> String {
    "\(namespace):\(key.lowercased())"
}

private func isExplicitSnapshotNamespace(_ namespace: String) -> Bool {
    namespace != "default"
}

private func requestedWindowIndex(_ params: [String: JSONValue]) throws -> Int? {
    guard let raw = params["windowIndex"] else { return nil }
    guard let value = raw.number, value >= 0, let index = boundedInteger(value, as: Int.self) else {
        throw ProviderError.coded("invalid_argument", "windowIndex is out of range")
    }
    return index
}

private func usableWindow(_ element: AXUIElement) -> Bool {
    stringAttribute(element, kAXRoleAttribute as String) == kAXWindowRole as String &&
        boolAttribute(element, kAXMinimizedAttribute as String) != true
}

private func focusedElement(appElement: AXUIElement) -> AXUIElement? {
    copyElement(appElement, kAXFocusedUIElementAttribute as String)
}

private func copyElement(_ element: AXUIElement, _ attribute: String) -> AXUIElement? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success, let value else {
        return nil
    }
    return (value as! AXUIElement)
}

private func copyArray(_ element: AXUIElement, _ attribute: String) -> [AXUIElement]? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success, let value else {
        return nil
    }
    return value as? [AXUIElement]
}

private func pidAttribute(_ element: AXUIElement) -> pid_t? {
    var pid: pid_t = 0
    guard AXUIElementGetPid(element, &pid) == .success else {
        return nil
    }
    return pid
}

private func stringAttribute(_ element: AXUIElement, _ attribute: String) -> String? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success, let value else {
        return nil
    }
    if CFGetTypeID(value) == CFStringGetTypeID(), let string = value as? String {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
    if CFGetTypeID(value) == CFURLGetTypeID(), let url = value as? URL {
        return url.absoluteString
    }
    return nil
}

private func rawStringAttribute(_ element: AXUIElement, _ attribute: String) -> String? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success,
          let value,
          CFGetTypeID(value) == CFStringGetTypeID()
    else {
        return nil
    }
    return value as? String
}

private func boolAttribute(_ element: AXUIElement, _ attribute: String) -> Bool? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else {
        return nil
    }
    return value as? Bool
}

private func numberAttribute(_ element: AXUIElement, _ attribute: String) -> NSNumber? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else {
        return nil
    }
    return value as? NSNumber
}

private func windowNumber(_ element: AXUIElement) -> CGWindowID? {
    guard let number = numberAttribute(element, "AXWindowNumber") else {
        return nil
    }
    return CGWindowID(number.uint32Value)
}

private func absoluteFrame(_ element: AXUIElement) -> CGRect? {
    var positionValue: CFTypeRef?
    var sizeValue: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionValue) == .success,
          AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeValue) == .success,
          let positionValue,
          let sizeValue
    else {
        return nil
    }
    var point = CGPoint.zero
    var size = CGSize.zero
    guard AXValueGetValue(positionValue as! AXValue, .cgPoint, &point),
          AXValueGetValue(sizeValue as! AXValue, .cgSize, &size)
    else {
        return nil
    }
    return CGRect(origin: point, size: size)
}

private extension CGRect {
    var area: CGFloat {
        max(width, 0) * max(height, 0)
    }
}

private func actions(_ element: AXUIElement) -> [String] {
    var value: CFArray?
    guard AXUIElementCopyActionNames(element, &value) == .success, let value else {
        return []
    }
    return value as? [String] ?? []
}

private func performAction(_ element: AXUIElement, _ action: String) -> Bool {
    actions(element).contains(where: { $0.caseInsensitiveCompare(action) == .orderedSame }) &&
        AXUIElementPerformAction(element, action as CFString) == .success
}

private func isSettable(_ element: AXUIElement, _ attribute: String) -> Bool {
    var settable = DarwinBoolean(false)
    return AXUIElementIsAttributeSettable(element, attribute as CFString, &settable) == .success && settable.boolValue
}

private func frame(_ element: AXUIElement, windowBounds: CGRect) -> CGRect? {
    var positionValue: CFTypeRef?
    var sizeValue: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionValue) == .success,
          AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeValue) == .success,
          let positionValue,
          let sizeValue
    else {
        return nil
    }
    var point = CGPoint.zero
    var size = CGSize.zero
    guard AXValueGetValue(positionValue as! AXValue, .cgPoint, &point),
          AXValueGetValue(sizeValue as! AXValue, .cgSize, &size)
    else {
        return nil
    }
    return CGRect(x: point.x - windowBounds.minX, y: point.y - windowBounds.minY, width: size.width, height: size.height)
}

private func elementSignature(_ node: SnapshotRenderNode) -> String {
    // Why: cached element validation should prove identity, not reject text
    // controls because their value/placeholder/summary changed after focus.
    [
        node.role,
        node.roleDescription ?? "",
        node.title ?? "",
        node.label ?? "",
        node.linkText ?? "",
        node.url ?? "",
        SnapshotRenderHeuristics.meaningfulActions(node.rawActions, role: node.role).joined(separator: ","),
    ].joined(separator: "\u{1f}")
}

private func center(_ localFrame: CGRect?, in windowBounds: CGRect) -> CGPoint? {
    guard let localFrame else { return nil }
    return CGPoint(x: windowBounds.minX + localFrame.midX, y: windowBounds.minY + localFrame.midY)
}

private func screenIndex(for bounds: CGRect) -> Int? {
    guard let index = NSScreen.screens.firstIndex(where: { $0.frame.intersects(bounds) }) else {
        return nil
    }
    return index
}

private func coordinatePoint(params: [String: JSONValue], xKey: String, yKey: String, snapshot: Snapshot) throws -> CGPoint {
    let x = try requiredNumber(params, xKey)
    let y = try requiredNumber(params, yKey)
    return CGPoint(
        x: snapshot.windowBounds.minX + x,
        y: snapshot.windowBounds.minY + y
    )
}

private func screenshotScale(screenshot: ScreenshotPayload?, bounds: CGRect) -> CGSize {
    guard let screenshot, bounds.width > 0, bounds.height > 0 else {
        return CGSize(width: 1, height: 1)
    }
    return CGSize(
        width: CGFloat(screenshot.width) / bounds.width,
        height: CGFloat(screenshot.height) / bounds.height
    )
}

private enum MouseButton {
    case left
    case right

    var cgButton: CGMouseButton {
        switch self {
        case .left:
            return .left
        case .right:
            return .right
        }
    }

    var downEvent: CGEventType {
        switch self {
        case .left:
            return .leftMouseDown
        case .right:
            return .rightMouseDown
        }
    }

    var upEvent: CGEventType {
        switch self {
        case .left:
            return .leftMouseUp
        case .right:
            return .rightMouseUp
        }
    }
}

private func mouseButton(_ raw: String?) throws -> MouseButton {
    switch raw ?? "left" {
    case "left":
        return .left
    case "right":
        return .right
    case "middle":
        throw ProviderError.coded("invalid_argument", "middle-click is not yet supported")
    case let value:
        throw ProviderError.coded("invalid_argument", "unsupported mouse button '\(value)'")
    }
}

private func renderTreeText(app: AppDescriptor, title: String, bounds: CGRect, lines: [String], focused: String?) -> String {
    var output = [
        "App=\(app.bundleId ?? app.name.replacingOccurrences(of: " ", with: "_")) (pid \(app.pid))",
        "Window: \"\(sanitize(title))\", App: \(sanitize(app.name)).",
        "",
    ]
    output.append(contentsOf: lines)
    output.append("")
    output.append(focused.map { "The focused UI element is \($0)." } ?? "No UI element is currently focused.")
    return output.joined(separator: "\n")
}

private func renderScreenshotStatus(_ status: ScreenshotStatus, snapshot: Snapshot) -> [String: Any] {
    let metadata: [String: Any] = [
        "engine": snapshot.screenshotEngine ?? "unknown",
        "windowId": Int(snapshot.windowId),
    ]
    switch status {
    case .captured:
        return ["state": "captured", "metadata": metadata]
    case .skipped:
        return ["state": "skipped", "reason": "no_screenshot_flag"]
    case let .failed(message):
        return ["state": "failed", "code": "screenshot_failed", "message": message, "metadata": metadata]
    }
}

private final class TreeRenderer {
    let windowBounds: CGRect
    let focused: AXUIElement?
    let compactBrowserTabs: Bool
    var lines: [String] = []
    var records: [Int: ElementRecord] = [:]
    var focusedSummary: String?
    var focusedElementId: Int?
    var truncated = false
    var maxDepthReached = false
    private let reader = AXSnapshotReader()
    private var nextIndex = 0
    static let maxNodes = 1200
    static let maxDepth = 64

    init(windowBounds: CGRect, focused: AXUIElement?, compactBrowserTabs: Bool) {
        self.windowBounds = windowBounds
        self.focused = focused
        self.compactBrowserTabs = compactBrowserTabs
    }

    func render(_ element: AXUIElement, depth: Int = 0, ancestors: [AXUIElement] = []) {
        guard nextIndex < Self.maxNodes else {
            truncated = true
            return
        }
        guard depth < Self.maxDepth else {
            truncated = true
            maxDepthReached = true
            return
        }
        guard !ancestors.contains(where: { CFEqual($0, element) }) else { return }

        let role = reader.stringAttribute(element, kAXRoleAttribute as String) ?? "AXUnknown"
        let children = reader.primaryChildren(element, role: role, windowBounds: windowBounds)
        let value = reader.valueString(element, role: role)
        let placeholder = reader.placeholderString(element)
        let rawActions = reader.actions(element)
        let rowSummary = reader.rowTextSummary(element, role: role)
        let roleDescription = reader.stringAttribute(element, kAXRoleDescriptionAttribute as String)
        let title = reader.stringAttribute(element, kAXTitleAttribute as String)
        let label = reader.stringAttribute(element, kAXDescriptionAttribute as String)
        let url = reader.stringAttribute(element, kAXURLAttribute as String)
        let linkText = role == "AXLink" ? reader.descendantTextSnippets(element, limit: 2, maxDepth: 3).first : nil
        let baseNode = SnapshotRenderNode(
            role: role,
            roleDescription: roleDescription,
            title: title,
            label: label,
            linkText: linkText,
            value: value,
            placeholder: placeholder,
            url: url,
            traits: [],
            rawActions: rawActions,
            childCount: children.count,
            rowSummary: rowSummary
        )
        let name = SnapshotRenderHeuristics.displayName(baseNode)
        let meaningful = SnapshotRenderHeuristics.meaningfulActions(rawActions, role: role)
        let localFrame = reader.frame(element, windowBounds: windowBounds)
        let traits = reader.traitsFor(element, role: role)
        let webAreaDepth = reader.webAreaDepth(role: role, ancestors: ancestors)
        let summary = reader.genericTextSummary(element, role: role, name: name, actions: meaningful, traits: traits)
        let node = SnapshotRenderNode(
            role: role,
            roleDescription: roleDescription,
            title: title,
            label: label,
            linkText: linkText,
            value: value,
            placeholder: placeholder,
            url: url,
            traits: traits,
            rawActions: rawActions,
            childCount: children.count,
            summary: summary,
            rowSummary: rowSummary,
            webAreaDepth: webAreaDepth
        )
        if SnapshotRenderHeuristics.shouldElide(node) {
            for child in children {
                render(child, depth: depth, ancestors: ancestors + [element])
            }
            return
        }

        let index = nextIndex
        nextIndex += 1
        let line = SnapshotRenderHeuristics.line(index: index, node: node)
        lines.append(String(repeating: "\t", count: depth) + line)
        records[index] = ElementRecord(
            index: index,
            element: element,
            localFrame: localFrame,
            actions: rawActions,
            signature: elementSignature(node)
        )
        if let focused, CFEqual(focused, element) {
            focusedElementId = index
            focusedSummary = line
        }
        if summary != nil || SnapshotRenderHeuristics.shouldSuppressChildren(node) {
            return
        }
        if compactBrowserTabs, let tabStripCompaction = tabStripCompaction(parent: node, children: children) {
            for (childIndex, child) in children.enumerated() where tabStripCompaction.retainedIndexes.contains(childIndex) {
                render(child, depth: depth + 1, ancestors: ancestors + [element])
            }
            lines.append(
                String(repeating: "\t", count: depth + 1) +
                    "... \(tabStripCompaction.omittedCount) inactive browser tabs omitted"
            )
            return
        }
        let childLineStart = lines.count
        for child in children {
            render(child, depth: depth + 1, ancestors: ancestors + [element])
        }
        if compactBrowserTabs {
            compactRenderedBrowserTabs(parent: node, startLine: childLineStart, depth: depth + 1)
        }
    }

    private func tabStripCompaction(parent: SnapshotRenderNode, children: [AXUIElement]) -> SnapshotTabStripCompaction? {
        let childNodes = children.map { child in
            let role = reader.stringAttribute(child, kAXRoleAttribute as String) ?? "AXUnknown"
            return SnapshotRenderNode(
                role: role,
                roleDescription: reader.stringAttribute(child, kAXRoleDescriptionAttribute as String),
                title: reader.stringAttribute(child, kAXTitleAttribute as String),
                label: reader.stringAttribute(child, kAXDescriptionAttribute as String),
                value: reader.valueString(child, role: role),
                traits: reader.traitsFor(child, role: role)
            )
        }
        // Why: browsers expose every open tab through AX; retaining only the active
        // tab keeps snapshots focused on the current page instead of stale tab titles.
        return SnapshotRenderHeuristics.tabStripCompaction(parent: parent, children: childNodes)
    }

    private func compactRenderedBrowserTabs(parent: SnapshotRenderNode, startLine: Int, depth: Int) {
        guard SnapshotRenderHeuristics.roleText(parent) == "scroll area" else { return }
        let indent = String(repeating: "\t", count: depth)
        let tabLineIndexes = lines.indices.dropFirst(startLine).filter { lineIndex in
            isDirectRenderedBrowserTabLine(lines[lineIndex], indent: indent)
        }
        guard tabLineIndexes.count >= 10 else { return }
        let activeLineIndexes = Set(tabLineIndexes.filter { lineIndex in
            isActiveRenderedBrowserTabLine(lines[lineIndex])
        })
        guard !activeLineIndexes.isEmpty else { return }

        let insertionIndex = tabLineIndexes.first!
        var omittedCount = 0
        for lineIndex in tabLineIndexes.reversed() where !activeLineIndexes.contains(lineIndex) {
            if let recordIndex = renderedElementIndex(lines[lineIndex], indent: indent) {
                records.removeValue(forKey: recordIndex)
                if focusedElementId == recordIndex {
                    focusedElementId = nil
                    focusedSummary = nil
                }
            }
            lines.remove(at: lineIndex)
            omittedCount += 1
        }
        guard omittedCount > 0 else { return }
        lines.insert("\(indent)... \(omittedCount) inactive browser tabs omitted", at: insertionIndex)
    }
}

private final class AXSnapshotReader {
    private enum CachedAttribute {
        case missing
        case found(CFTypeRef)
    }

    private final class ElementCache {
        let element: AXUIElement
        var loadedAttributeNames = false
        var advertisedAttributes: Set<String>?
        var attributes: [String: CachedAttribute] = [:]
        var actions: [String]?
        var settable: [String: Bool] = [:]

        init(element: AXUIElement) {
            self.element = element
        }
    }

    private var elementsByHash: [CFHashCode: [ElementCache]] = [:]

    func stringAttribute(_ element: AXUIElement, _ attribute: String) -> String? {
        guard let value = copyAttribute(element, attribute) else { return nil }
        if CFGetTypeID(value) == CFStringGetTypeID(), let string = value as? String {
            let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        if CFGetTypeID(value) == CFURLGetTypeID(), let url = value as? URL {
            return url.absoluteString
        }
        return nil
    }

    func boolAttribute(_ element: AXUIElement, _ attribute: String) -> Bool? {
        copyAttribute(element, attribute) as? Bool
    }

    func numberAttribute(_ element: AXUIElement, _ attribute: String) -> NSNumber? {
        copyAttribute(element, attribute) as? NSNumber
    }

    func copyArray(_ element: AXUIElement, _ attribute: String) -> [AXUIElement]? {
        copyAttribute(element, attribute) as? [AXUIElement]
    }

    func actions(_ element: AXUIElement) -> [String] {
        let cache = cache(for: element)
        if let actions = cache.actions {
            return actions
        }
        var value: CFArray?
        let actions = AXUIElementCopyActionNames(element, &value) == .success ? value as? [String] ?? [] : []
        cache.actions = actions
        return actions
    }

    func isSettable(_ element: AXUIElement, _ attribute: String) -> Bool {
        let cache = cache(for: element)
        if let cached = cache.settable[attribute] {
            return cached
        }
        var settable = DarwinBoolean(false)
        let value = AXUIElementIsAttributeSettable(element, attribute as CFString, &settable) == .success && settable.boolValue
        cache.settable[attribute] = value
        return value
    }

    func frame(_ element: AXUIElement, windowBounds: CGRect) -> CGRect? {
        guard let absolute = absoluteFrame(element) else { return nil }
        return CGRect(
            x: absolute.minX - windowBounds.minX,
            y: absolute.minY - windowBounds.minY,
            width: absolute.width,
            height: absolute.height
        )
    }

    func primaryChildren(_ element: AXUIElement, role: String, windowBounds: CGRect) -> [AXUIElement] {
        if usesRowsAsPrimaryChildren(role: role), let rows = copyArray(element, kAXRowsAttribute as String), !rows.isEmpty {
            return visibleRows(rows, parent: element, windowBounds: windowBounds)
        }
        return copyArray(element, kAXChildrenAttribute as String) ?? []
    }

    func valueString(_ element: AXUIElement, role: String) -> String? {
        if isSecureTextElement(element, role: role) {
            return "[redacted]"
        }
        if let string = stringAttribute(element, kAXValueAttribute as String) {
            return string
        }
        if let number = numberAttribute(element, kAXValueAttribute as String) {
            return number.stringValue
        }
        return nil
    }

    func placeholderString(_ element: AXUIElement) -> String? {
        stringAttribute(element, "AXPlaceholderValue") ?? stringAttribute(element, "AXPlaceholder")
    }

    func traitsFor(_ element: AXUIElement, role: String) -> [String] {
        var traits: [String] = []
        if boolAttribute(element, kAXSelectedAttribute as String) == true { traits.append("selected") }
        if boolAttribute(element, kAXExpandedAttribute as String) == true { traits.append("expanded") }
        if boolAttribute(element, kAXEnabledAttribute as String) == false { traits.append("disabled") }
        if valueSettableRoles.contains(role), isSettable(element, kAXValueAttribute as String) { traits.append("settable") }
        return traits
    }

    func genericTextSummary(
        _ element: AXUIElement,
        role: String,
        name: String?,
        actions: [String],
        traits: [String]
    ) -> String? {
        guard (role == kAXGroupRole as String || role == kAXUnknownRole as String),
              name == nil,
              actions.isEmpty,
              traits.isEmpty,
              isPlainTextSubtree(element, maxDepth: 4)
        else {
            return nil
        }
        let texts = descendantTextSnippets(element, limit: 8, maxDepth: 4)
        guard texts.count >= 2 else { return nil }
        let summary = texts.joined(separator: " ")
        guard summary.count <= 220 else { return nil }
        return summary
    }

    func rowTextSummary(_ element: AXUIElement, role: String) -> String? {
        guard ["AXRow", "AXCell", "AXOutlineRow"].contains(role) else { return nil }
        let texts = descendantTextSnippets(element, limit: 6, maxDepth: 3)
        guard !texts.isEmpty else { return nil }
        return texts.joined(separator: " ")
    }

    func descendantTextSnippets(_ element: AXUIElement, limit: Int, maxDepth: Int) -> [String] {
        var values: [String] = []
        var seen = Set<String>()

        func collect(_ node: AXUIElement, depth: Int) {
            guard values.count < limit, depth <= maxDepth else { return }
            let role = stringAttribute(node, kAXRoleAttribute as String) ?? ""
            if role == kAXStaticTextRole as String || role == "AXLink" {
                for candidate in [
                    stringAttribute(node, kAXValueAttribute as String),
                    stringAttribute(node, kAXTitleAttribute as String),
                    stringAttribute(node, kAXDescriptionAttribute as String),
                ] {
                    guard let candidate else { continue }
                    let text = preview(candidate, maxLength: 80)
                    guard !text.isEmpty, seen.insert(text).inserted else { continue }
                    values.append(text)
                    if values.count >= limit { return }
                }
            }
            for child in copyArray(node, kAXChildrenAttribute as String) ?? [] {
                collect(child, depth: depth + 1)
                if values.count >= limit { return }
            }
        }

        collect(element, depth: 0)
        return values
    }

    func webAreaDepth(role: String, ancestors: [AXUIElement]) -> Int? {
        if role == "AXWebArea" { return 0 }
        guard let index = ancestors.firstIndex(where: { stringAttribute($0, kAXRoleAttribute as String) == "AXWebArea" }) else {
            return nil
        }
        return ancestors.count - index
    }

    private func copyAttribute(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
        let cache = cache(for: element)
        if let cached = cache.attributes[attribute] {
            switch cached {
            case .missing:
                return nil
            case let .found(value):
                return value
            }
        }
        if let advertisedAttributes = advertisedAttributes(cache),
           !SnapshotRenderHeuristics.supportsAttribute(attribute, advertisedAttributes: advertisedAttributes) {
            cache.attributes[attribute] = .missing
            return nil
        }
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success, let value else {
            cache.attributes[attribute] = .missing
            return nil
        }
        cache.attributes[attribute] = .found(value)
        return value
    }

    private func advertisedAttributes(_ cache: ElementCache) -> Set<String>? {
        if cache.loadedAttributeNames {
            return cache.advertisedAttributes
        }
        cache.loadedAttributeNames = true
        var value: CFArray?
        guard AXUIElementCopyAttributeNames(cache.element, &value) == .success, let attributes = value as? [String] else {
            return nil
        }
        cache.advertisedAttributes = Set(attributes)
        return cache.advertisedAttributes
    }

    private func absoluteFrame(_ element: AXUIElement) -> CGRect? {
        guard let positionValue = copyAttribute(element, kAXPositionAttribute as String),
              let sizeValue = copyAttribute(element, kAXSizeAttribute as String)
        else {
            return nil
        }
        var point = CGPoint.zero
        var size = CGSize.zero
        guard AXValueGetValue(positionValue as! AXValue, .cgPoint, &point),
              AXValueGetValue(sizeValue as! AXValue, .cgSize, &size)
        else {
            return nil
        }
        return CGRect(origin: point, size: size)
    }

    private func visibleRows(_ rows: [AXUIElement], parent: AXUIElement, windowBounds: CGRect) -> [AXUIElement] {
        guard let parentFrame = frame(parent, windowBounds: windowBounds) else {
            return Array(rows.prefix(20))
        }
        let visible = rows.filter { row in
            guard let rowFrame = frame(row, windowBounds: windowBounds) else { return false }
            return rowFrame.intersects(parentFrame)
        }
        return Array((visible.isEmpty ? rows : visible).prefix(20))
    }

    private func isSecureTextElement(_ element: AXUIElement, role: String) -> Bool {
        guard SnapshotRenderHeuristics.shouldProbeSecureTextMetadata(role: role) else {
            return false
        }
        let haystack = [
            role,
            stringAttribute(element, kAXSubroleAttribute as String) ?? "",
            stringAttribute(element, kAXTitleAttribute as String) ?? "",
            stringAttribute(element, kAXDescriptionAttribute as String) ?? "",
            placeholderString(element) ?? "",
        ].joined(separator: " ").lowercased()
        return haystack.contains("secure") ||
            haystack.contains("password") ||
            haystack.contains("passcode") ||
            haystack.contains("verification code") ||
            haystack.contains("one-time code")
    }

    private func isPlainTextSubtree(_ element: AXUIElement, maxDepth: Int) -> Bool {
        var sawText = false
        let allowedContainerRoles: Set<String> = [
            kAXGroupRole as String,
            kAXUnknownRole as String,
            kAXStaticTextRole as String,
            "AXLink",
            "AXImage",
        ]

        func visit(_ node: AXUIElement, depth: Int) -> Bool {
            guard depth <= maxDepth else { return false }
            let role = stringAttribute(node, kAXRoleAttribute as String) ?? "AXUnknown"
            guard allowedContainerRoles.contains(role) else { return false }
            if role == kAXStaticTextRole as String || role == "AXLink" {
                sawText = true
            }
            guard SnapshotRenderHeuristics.meaningfulActions(actions(node), role: role).isEmpty else { return false }
            for child in copyArray(node, kAXChildrenAttribute as String) ?? [] {
                guard visit(child, depth: depth + 1) else { return false }
            }
            return true
        }

        return visit(element, depth: 0) && sawText
    }

    private func cache(for element: AXUIElement) -> ElementCache {
        let hash = CFHash(element)
        if let cache = elementsByHash[hash]?.first(where: { CFEqual($0.element, element) }) {
            return cache
        }
        let cache = ElementCache(element: element)
        elementsByHash[hash, default: []].append(cache)
        return cache
    }
}

private let valueSettableRoles: Set<String> = [
    kAXCheckBoxRole as String,
    kAXComboBoxRole as String,
    kAXRadioButtonRole as String,
    "AXSearchField",
    kAXSliderRole as String,
    kAXTextAreaRole as String,
    kAXTextFieldRole as String,
]

private func usesRowsAsPrimaryChildren(role: String) -> Bool {
    [
        kAXBrowserRole as String,
        kAXListRole as String,
        kAXOutlineRole as String,
        kAXTableRole as String,
    ].contains(role)
}

private func isDirectRenderedBrowserTabLine(_ line: String, indent: String) -> Bool {
    guard line.hasPrefix(indent), !line.dropFirst(indent.count).hasPrefix("\t") else {
        return false
    }
    let text = String(line.dropFirst(indent.count))
    return text.range(of: #"^\d+ tab($| \(|,)"#, options: .regularExpression) != nil
}

private func isActiveRenderedBrowserTabLine(_ line: String) -> Bool {
    line.contains("(selected") || line.contains("Value: 1")
}

private func renderedElementIndex(_ line: String, indent: String) -> Int? {
    let text = line.dropFirst(indent.count)
    let digits = text.prefix { character in
        character >= "0" && character <= "9"
    }
    return Int(digits)
}

private func sanitize(_ value: String) -> String {
    value.replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "\r", with: " ")
}

private func preview(_ value: String, maxLength: Int = 120) -> String {
    let clean = sanitize(value)
    if clean.count <= maxLength {
        return clean
    }
    return String(clean.prefix(maxLength)) + "..."
}

private func actionMetadata(
    path: String,
    actionName: String? = nil,
    fallbackReason: String? = nil,
    verification: [String: Any]? = nil
) -> [String: Any] {
    var metadata: [String: Any] = [
        "path": path,
        "actionName": jsonNullable(actionName),
        "fallbackReason": jsonNullable(fallbackReason),
    ]
    if let verification {
        metadata["verification"] = verification
    }
    return metadata
}

private func verifiedAction(property: String, expected: String? = nil, actualPreview: String? = nil) -> [String: Any] {
    [
        "state": "verified",
        "property": property,
        "expected": jsonNullable(expected),
        "actualPreview": jsonNullable(actualPreview),
    ]
}

private func unverifiedAction(reason: String, expected: String? = nil, actualPreview: String? = nil) -> [String: Any] {
    [
        "state": "unverified",
        "reason": reason,
        "expected": jsonNullable(expected),
        "actualPreview": jsonNullable(actualPreview),
    ]
}

private func jsonNullable<T>(_ value: T?) -> Any {
    value ?? NSNull()
}

private struct WindowCandidate {
    let windowId: CGWindowID
    let layer: Int
    let bounds: CGRect
    let title: String?
    let alpha: CGFloat
    let isOnScreen: Bool
    let sharingState: Int?

    var score: Int {
        var value = Int(bounds.width * bounds.height)
        if layer == 0 { value += 1_000_000_000 }
        if title != nil && title?.isEmpty == false { value += 10_000_000 }
        if isOnScreen { value += 1_000_000 }
        if alpha >= 0.99 { value += 100_000 }
        return value
    }
}

private struct WindowCapture {
    let windowId: CGWindowID
    let layer: Int
    let bounds: CGRect
    let title: String?
    let image: CapturedImage?

    static func resolve(
        pid: pid_t,
        titleHint: String?,
        windowId: CGWindowID?,
        windowIndex: Int?,
        captureImage: Bool
    ) -> WindowCapture? {
        resolve(
            candidates: candidates(pid: pid),
            titleHint: titleHint,
            windowId: windowId,
            windowIndex: windowIndex,
            captureImage: captureImage
        )
    }

    static func resolve(
        candidates: [WindowCandidate],
        titleHint: String?,
        windowId: CGWindowID?,
        windowIndex: Int?,
        captureImage: Bool
    ) -> WindowCapture? {
        if let windowId {
            guard let candidate = candidates.first(where: { $0.windowId == windowId }) else { return nil }
            return WindowCapture(candidate: candidate, captureImage: captureImage)
        }
        if let windowIndex {
            let visibleWindows = candidates.filter { $0.layer == 0 }
            guard visibleWindows.indices.contains(windowIndex) else { return nil }
            return WindowCapture(candidate: visibleWindows[windowIndex], captureImage: captureImage)
        }
        guard let best = candidates.sorted(by: { lhs, rhs in
            if let titleHint, lhs.title == titleHint, rhs.title != titleHint { return true }
            if let titleHint, rhs.title == titleHint, lhs.title != titleHint { return false }
            return lhs.score > rhs.score
        }).first else {
            return nil
        }
        return WindowCapture(candidate: best, captureImage: captureImage)
    }

    private init(candidate: WindowCandidate, captureImage: Bool) {
        self.windowId = candidate.windowId
        self.layer = candidate.layer
        self.bounds = candidate.bounds
        self.title = candidate.title
        // Why: probing image APIs before TCC preflight can raise Screen
        // Recording prompts, even for --no-screenshot calls.
        if captureImage {
            self.image = Self.captureImage(windowId: candidate.windowId, bounds: candidate.bounds)
        } else {
            self.image = nil
        }
    }

    static func candidates(pid: pid_t) -> [WindowCandidate] {
        guard let infos = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] else {
            return []
        }
        return infos.compactMap { info in
            guard let ownerPid = info[kCGWindowOwnerPID as String] as? pid_t, ownerPid == pid,
                  let number = info[kCGWindowNumber as String] as? NSNumber,
                  let layer = info[kCGWindowLayer as String] as? Int,
                  let boundsDictionary = info[kCGWindowBounds as String] as? NSDictionary,
                  let bounds = CGRect(dictionaryRepresentation: boundsDictionary),
                  bounds.width >= 48,
                  bounds.height >= 48
            else {
                return nil
            }
            let alpha = info[kCGWindowAlpha as String] as? CGFloat ?? 1
            guard alpha > 0.01 else { return nil }
            let sharing = (info[kCGWindowSharingState as String] as? NSNumber).map { $0.intValue }
            if sharing == 0 { return nil }
            let isOnScreen = (info[kCGWindowIsOnscreen as String] as? Bool) ?? true
            return WindowCandidate(
                windowId: CGWindowID(number.uint32Value),
                layer: layer,
                bounds: bounds,
                title: info[kCGWindowName as String] as? String,
                alpha: alpha,
                isOnScreen: isOnScreen,
                sharingState: sharing
            )
        }
        .sorted { lhs, rhs in
            lhs.score > rhs.score
        }
    }

    func screenshotPayload() -> ScreenshotPayload? {
        guard let image, let bounded = boundedPngData(image.image) else { return nil }
        return ScreenshotPayload(
            data: bounded.data.base64EncodedString(),
            width: bounded.width,
            height: bounded.height,
            scale: Double(bounded.width) / max(Double(bounds.width), 1)
        )
    }

    private static func captureImage(windowId: CGWindowID, bounds: CGRect) -> CapturedImage? {
        if ProcessInfo.processInfo.environment["YIRU_COMPUTER_USE_SCK_SCREENSHOTS"] == "1",
           let image = captureImageWithScreenCaptureKit(windowId: windowId, bounds: bounds) {
            return CapturedImage(image: image, engine: "screenCaptureKit")
        }
        if let image = CGWindowListCreateImage(.null, [.optionIncludingWindow], windowId, [.boundsIgnoreFraming, .bestResolution]) {
            return CapturedImage(image: image, engine: "cgWindowList")
        }
        return nil
    }

    private static func captureImageWithScreenCaptureKit(windowId: CGWindowID, bounds: CGRect) -> CGImage? {
        try? BlockingAsync.run(timeout: 3) {
            let content = try await SCShareableContent.current
            guard let window = content.windows.first(where: { $0.windowID == windowId }) else {
                return nil
            }
            let filter = SCContentFilter(desktopIndependentWindow: window)
            let configuration = SCStreamConfiguration()
            let scale = NSScreen.screens.first(where: { $0.frame.intersects(bounds) })?.backingScaleFactor ?? NSScreen.main?.backingScaleFactor ?? 2
            configuration.width = size_t(max(1, Int((bounds.width * scale).rounded(.up))))
            configuration.height = size_t(max(1, Int((bounds.height * scale).rounded(.up))))
            configuration.scalesToFit = true
            configuration.preservesAspectRatio = true
            configuration.showsCursor = false
            configuration.ignoreShadowsSingleWindow = true
            configuration.ignoreGlobalClipSingleWindow = true
            return try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration)
        }
    }
}

private final class AsyncBox<T>: @unchecked Sendable {
    var result: Result<T, Error>?
}

private enum BlockingAsync {
    static func run<T>(timeout: TimeInterval, operation: @escaping @Sendable () async throws -> T) throws -> T {
        let semaphore = DispatchSemaphore(value: 0)
        let box = AsyncBox<T>()
        let task = Task.detached {
            do {
                box.result = .success(try await operation())
            } catch {
                box.result = .failure(error)
            }
            semaphore.signal()
        }
        guard semaphore.wait(timeout: .now() + timeout) == .success else {
            task.cancel()
            throw ProviderError.coded("action_timeout", "screenshot capture timed out")
        }
        return try box.result!.get()
    }
}

private struct BoundedPNG {
    let data: Data
    let width: Int
    let height: Int
}

private func boundedPngData(_ image: CGImage) -> BoundedPNG? {
    let rep = NSBitmapImageRep(cgImage: image)
    guard let data = rep.representation(using: .png, properties: [:]) else { return nil }
    if data.count <= 900_000 {
        return BoundedPNG(data: data, width: image.width, height: image.height)
    }
    var scale = min(1, 1280 / CGFloat(max(image.width, image.height)))
    var best = BoundedPNG(data: data, width: image.width, height: image.height)
    while scale >= 0.25 {
        guard let resized = resizePng(image, scale: scale) else {
            break
        }
        best = resized
        if resized.data.count <= 900_000 {
            return resized
        }
        scale *= 0.85
    }
    return best
}

private func resizePng(_ image: CGImage, scale: CGFloat) -> BoundedPNG? {
    let width = max(1, Int(CGFloat(image.width) * scale))
    let height = max(1, Int(CGFloat(image.height) * scale))
    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        return nil
    }
    context.interpolationQuality = .medium
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    guard let resized = context.makeImage() else { return nil }
    guard let data = NSBitmapImageRep(cgImage: resized).representation(using: .png, properties: [:]) else {
        return nil
    }
    return BoundedPNG(data: data, width: width, height: height)
}

private enum Input {
    static func click(pid: pid_t, at point: CGPoint, button: MouseButton, count: Int) throws {
        guard let source = CGEventSource(stateID: .combinedSessionState) else {
            throw ProviderError.coded("accessibility_error", "failed to create event source")
        }
        for _ in 0..<max(count, 1) {
            try mouse(.mouseMoved, source: source, point: point, button: button.cgButton, pid: pid)
            try mouse(button.downEvent, source: source, point: point, button: button.cgButton, pid: pid)
            try mouse(button.upEvent, source: source, point: point, button: button.cgButton, pid: pid)
        }
    }

    static func scroll(pid: pid_t, at point: CGPoint, direction: String, pages: Double) throws {
        guard let delta = boundedInteger(max(1, (12 * pages).rounded()), as: Int32.self) else {
            throw ProviderError.coded("invalid_argument", "pages is out of range")
        }
        let wheel1: Int32 = direction == "up" ? delta : direction == "down" ? -delta : 0
        let wheel2: Int32 = direction == "left" ? delta : direction == "right" ? -delta : 0
        guard let event = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 2, wheel1: wheel1, wheel2: wheel2, wheel3: 0) else {
            throw ProviderError.coded("accessibility_error", "failed to create scroll event")
        }
        event.location = point
        event.postToPid(pid)
    }

    static func drag(pid: pid_t, from start: CGPoint, to end: CGPoint) throws {
        guard let source = CGEventSource(stateID: .combinedSessionState) else {
            throw ProviderError.coded("accessibility_error", "failed to create event source")
        }
        try mouse(.mouseMoved, source: source, point: start, button: .left, pid: pid)
        try mouse(.leftMouseDown, source: source, point: start, button: .left, pid: pid)
        for step in 1...10 {
            let progress = CGFloat(step) / 10
            try mouse(
                .leftMouseDragged,
                source: source,
                point: CGPoint(x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress),
                button: .left,
                pid: pid
            )
        }
        try mouse(.leftMouseUp, source: source, point: end, button: .left, pid: pid)
    }

    static func typeText(_ text: String, pid: pid_t) throws {
        for unit in text.utf16 {
            var char = unit
            guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
                  let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false)
            else {
                throw ProviderError.coded("accessibility_error", "failed to create keyboard event")
            }
            down.keyboardSetUnicodeString(stringLength: 1, unicodeString: &char)
            up.keyboardSetUnicodeString(stringLength: 1, unicodeString: &char)
            down.post(tap: .cghidEventTap)
            up.post(tap: .cghidEventTap)
        }
    }

    static func pressKey(_ key: String, pid: pid_t) throws {
        let parsed = try KeyMap.parse(key)
        var flags = CGEventFlags()
        for modifier in parsed.modifiers {
            flags.insert(modifier.flag)
            try keyEvent(modifier.keyCode, down: true, flags: flags, pid: pid)
        }
        try keyEvent(parsed.keyCode, down: true, flags: flags, pid: pid)
        try keyEvent(parsed.keyCode, down: false, flags: flags, pid: pid)
        for modifier in parsed.modifiers.reversed() {
            try keyEvent(modifier.keyCode, down: false, flags: flags, pid: pid)
            flags.remove(modifier.flag)
        }
    }

    static func pasteText(_ text: String, pid: pid_t) throws {
        let pasteboard = NSPasteboard.general
        let previousItems: [NSPasteboardItem] = pasteboard.pasteboardItems?.map { item in
            let copy = NSPasteboardItem()
            for type in item.types {
                if let data = item.data(forType: type) {
                    copy.setData(data, forType: type)
                }
            }
            return copy
        } ?? []
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
        defer {
            pasteboard.clearContents()
            if !previousItems.isEmpty {
                pasteboard.writeObjects(previousItems)
            }
        }
        try pressKey("cmd+v", pid: pid)
    }

    private static func mouse(_ type: CGEventType, source: CGEventSource, point: CGPoint, button: CGMouseButton, pid: pid_t) throws {
        guard let event = CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: point, mouseButton: button) else {
            throw ProviderError.coded("accessibility_error", "failed to create mouse event")
        }
        event.postToPid(pid)
    }

    private static func keyEvent(_ keyCode: CGKeyCode, down: Bool, flags: CGEventFlags, pid: pid_t) throws {
        guard let event = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: down) else {
            throw ProviderError.coded("accessibility_error", "failed to create key event")
        }
        event.flags = flags
        event.post(tap: .cghidEventTap)
    }
}

private enum TextInput {
    static func replaceSelection(_ element: AXUIElement, with text: String) -> [String: Any]? {
        guard isSettable(element, kAXValueAttribute as String),
              let current = rawStringAttribute(element, kAXValueAttribute as String)
        else {
            return nil
        }
        let selectedRange = selectedTextRange(element) ?? CFRange(location: current.utf16.count, length: 0)
        let startOffset = max(0, min(selectedRange.location, current.utf16.count))
        let endOffset = max(startOffset, min(startOffset + selectedRange.length, current.utf16.count))
        let start = String.Index(utf16Offset: startOffset, in: current)
        let end = String.Index(utf16Offset: endOffset, in: current)
        let next = String(current[..<start]) + text + String(current[end...])
        guard AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, next as CFString) == .success else {
            return nil
        }
        setSelectedTextRange(element, CFRange(location: startOffset + text.utf16.count, length: 0))
        guard rawStringAttribute(element, kAXValueAttribute as String) == next else {
            return nil
        }
        return verifiedAction(
            property: "focusedText",
            expected: text,
            actualPreview: preview(next)
        )
    }

    static func selectAll(_ element: AXUIElement) -> Bool {
        guard let current = rawStringAttribute(element, kAXValueAttribute as String) else {
            return false
        }
        return setSelectedTextRange(element, CFRange(location: 0, length: current.utf16.count))
    }

    static func selectionVerification(_ element: AXUIElement) -> [String: Any] {
        guard let current = rawStringAttribute(element, kAXValueAttribute as String),
              let selectedRange = selectedTextRange(element),
              selectedRange.location == 0,
              selectedRange.length == current.utf16.count
        else {
            return unverifiedAction(reason: "provider_unavailable")
        }
        return verifiedAction(property: "selection", actualPreview: preview(current))
    }

    private static func selectedTextRange(_ element: AXUIElement) -> CFRange? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, &value) == .success,
              let value,
              CFGetTypeID(value) == AXValueGetTypeID()
        else {
            return nil
        }
        var range = CFRange(location: 0, length: 0)
        guard AXValueGetValue(value as! AXValue, .cfRange, &range) else {
            return nil
        }
        return range
    }

    @discardableResult
    private static func setSelectedTextRange(_ element: AXUIElement, _ range: CFRange) -> Bool {
        var mutableRange = range
        guard let value = AXValueCreate(.cfRange, &mutableRange) else {
            return false
        }
        return AXUIElementSetAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, value) == .success
    }
}

private func isSelectAllHotkey(_ key: String) -> Bool {
    let parts = key
        .lowercased()
        .replacingOccurrences(of: " ", with: "")
        .replacingOccurrences(of: "-", with: "+")
        .split(separator: "+")
        .map(String.init)
    guard parts.last == "a" else {
        return false
    }
    let modifiers = Set(parts.dropLast())
    return modifiers.contains("cmd") ||
        modifiers.contains("command") ||
        modifiers.contains("meta") ||
        modifiers.contains("cmdorctrl") ||
        modifiers.contains("commandorcontrol")
}

private struct KeyModifier {
    let keyCode: CGKeyCode
    let flag: CGEventFlags
}

private struct ParsedKey {
    let keyCode: CGKeyCode
    let modifiers: [KeyModifier]
}

private enum KeyMap {
    static func parse(_ spec: String) throws -> ParsedKey {
        let parts = spec.split(separator: "+").map { String($0).lowercased() }
        var modifiers: [KeyModifier] = []
        var keyName: String?
        for part in parts {
            switch part {
            case "cmd", "command", "meta", "super", "cmdorctrl", "commandorcontrol":
                modifiers.append(KeyModifier(keyCode: 55, flag: .maskCommand))
            case "ctrl", "control":
                modifiers.append(KeyModifier(keyCode: 59, flag: .maskControl))
            case "alt", "option":
                modifiers.append(KeyModifier(keyCode: 58, flag: .maskAlternate))
            case "shift":
                modifiers.append(KeyModifier(keyCode: 56, flag: .maskShift))
            default:
                keyName = part
            }
        }
        guard let keyName, let keyCode = codes[keyName] else {
            throw ProviderError.coded("invalid_argument", "unsupported key '\(spec)'")
        }
        return ParsedKey(keyCode: keyCode, modifiers: modifiers)
    }

    private static let codes: [String: CGKeyCode] = [
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
        "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19,
        "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25, "7": 26, "-": 27, "8": 28,
        "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35, "return": 36,
        "enter": 36, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42, ",": 43,
        "/": 44, "n": 45, "m": 46, ".": 47, "tab": 48, "space": 49, "`": 50,
        "backspace": 51, "delete": 51, "escape": 53, "esc": 53, "left": 123, "right": 124,
        "down": 125, "up": 126, "insert": 114, "home": 115, "pageup": 116, "page_up": 116,
        "forwarddelete": 117, "end": 119, "pagedown": 121, "page_down": 121,
    ]
}

private final class AgentRuntime: NSObject, NSApplicationDelegate {
    private let socketPath: String
    private let token: String?
    private var listener: SocketListener?

    init(socketPath: String, token: String?) {
        self.socketPath = socketPath
        self.token = token
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let listener = try SocketListener(socketPath: socketPath, token: token)
            self.listener = listener
            listener.start()
        } catch {
            fputs("failed to start computer-use socket: \(error)\n", stderr)
            NSApp.terminate(nil)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        listener?.stop()
    }
}

private final class SocketListener: @unchecked Sendable {
    private let socketPath: String
    private let token: String?
    private let provider = Provider()
    private let providerLock = NSLock()
    private var socketFd: Int32 = -1
    private var isStopped = false

    init(socketPath: String, token: String?) throws {
        self.socketPath = socketPath
        self.token = token
        try bindSocket()
    }

    func start() {
        Thread.detachNewThread { [weak self] in
            self?.acceptLoop()
        }
    }

    func stop() {
        isStopped = true
        if socketFd >= 0 {
            close(socketFd)
            socketFd = -1
        }
        // Why: the parent owns the private temp directory cleanup; the helper
        // must not unlink arbitrary caller-supplied paths on shutdown.
    }

    private func bindSocket() throws {
        socketFd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard socketFd >= 0 else {
            throw ProviderError.coded("accessibility_error", "failed to create computer-use socket")
        }

        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        let maxPathLength = MemoryLayout.size(ofValue: address.sun_path)
        guard socketPath.utf8.count < maxPathLength else {
            throw ProviderError.coded("invalid_argument", "computer-use socket path is too long")
        }
        _ = withUnsafeMutablePointer(to: &address.sun_path) { pointer in
            socketPath.withCString { source in
                strncpy(UnsafeMutableRawPointer(pointer).assumingMemoryBound(to: CChar.self), source, maxPathLength)
            }
        }

        let result = withUnsafePointer(to: &address) { pointer -> Int32 in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                bind(socketFd, sockaddrPointer, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard result == 0 else {
            let bindErrno = errno
            let message = String(cString: strerror(bindErrno))
            close(socketFd)
            socketFd = -1
            if UnixSocketPathSafety.shouldRejectExistingPathAfterBindFailure(
                bindErrno: bindErrno,
                existingMode: existingPathMode(socketPath)
            ) {
                throw ProviderError.coded("invalid_argument", "refusing to replace non-socket file at computer-use socket path")
            }
            throw ProviderError.coded("accessibility_error", "failed to bind computer-use socket: \(message)")
        }
        chmod(socketPath, 0o600)

        guard listen(socketFd, 8) == 0 else {
            let message = String(cString: strerror(errno))
            close(socketFd)
            socketFd = -1
            throw ProviderError.coded("accessibility_error", "failed to listen on computer-use socket: \(message)")
        }
    }

    private func acceptLoop() {
        while !isStopped {
            let fd = accept(socketFd, nil, nil)
            if fd < 0 {
                if !isStopped {
                    fputs("computer-use socket accept failed: \(String(cString: strerror(errno)))\n", stderr)
                }
                continue
            }
            Thread.detachNewThread { [weak self] in
                self?.handleConnection(fd)
            }
        }
    }

    private func handleConnection(_ fd: Int32) {
        defer { close(fd) }
        let authorizedPeer = isAuthorizedAgentPeer(fd)
        let decoder = JSONDecoder()
        while let line = readLine(from: fd) {
            guard let data = line.data(using: .utf8),
                  let request = try? decoder.decode(Request.self, from: data)
            else {
                continue
            }
            let response = handleRequest(
                provider: provider,
                lock: providerLock,
                request: request,
                expectedToken: token,
                authorizedPeer: authorizedPeer
            )
            writeJSON(response, to: fd)
        }
    }
}

private func existingPathMode(_ path: String) -> mode_t? {
    var statInfo = stat()
    guard lstat(path, &statInfo) == 0 else {
        return nil
    }
    return statInfo.st_mode
}

private func peerProcessId(_ fd: Int32) -> pid_t? {
    var pid = pid_t(0)
    var length = socklen_t(MemoryLayout<pid_t>.size)
    let result = withUnsafeMutablePointer(to: &pid) { pointer in
        getsockopt(fd, 0, 2, pointer, &length)
    }
    return result == 0 && pid > 0 ? pid : nil
}

private func isAuthorizedAgentPeer(_ fd: Int32) -> Bool {
    var peerUserId = uid_t(0)
    var peerGroupId = gid_t(0)
    guard getpeereid(fd, &peerUserId, &peerGroupId) == 0,
          peerUserId == geteuid(),
          let pid = peerProcessId(fd),
          pid == getppid(),
          let executablePath = processExecutablePath(pid),
          isYiruDaemonExecutable(executablePath),
          processRunsDaemon(pid),
          isSameYiruInstallation(executablePath)
    else {
        return false
    }
    return true
}

private func processExecutablePath(_ pid: pid_t) -> String? {
    // Why: PROC_PIDPATHINFO_MAXSIZE is a C macro Swift cannot import on newer SDKs.
    var buffer = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
    let length = proc_pidpath(pid, &buffer, UInt32(buffer.count))
    guard length > 0 else { return nil }
    let bytes = buffer.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) }
    return String(decoding: bytes, as: UTF8.self)
}

private func isYiruDaemonExecutable(_ path: String) -> Bool {
    let name = URL(fileURLWithPath: path).lastPathComponent
    return name == "yiru" || name.hasPrefix("yiru-bun-darwin-")
}

private func processRunsDaemon(_ pid: pid_t) -> Bool {
    guard let command = processField(pid: pid, field: "command=") else { return false }
    return command.split(separator: " ").dropFirst().first == "daemon"
}

private func isSameYiruInstallation(_ daemonPath: String) -> Bool {
    let helperPath = Bundle.main.bundlePath
    let developmentMarker = "/apps/daemon/"
    if let daemonMarker = daemonPath.range(of: developmentMarker),
       let helperMarker = helperPath.range(of: developmentMarker) {
        return daemonPath[..<daemonMarker.lowerBound] == helperPath[..<helperMarker.lowerBound]
    }
    let installationRoot = URL(fileURLWithPath: daemonPath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .standardizedFileURL.path
    return helperPath.hasPrefix(installationRoot + "/")
}

private func processField(pid: pid_t, field: String) -> String? {
    let process = Process()
    let pipe = Pipe()
    process.executableURL = URL(fileURLWithPath: "/bin/ps")
    process.arguments = ["-p", "\(pid)", "-o", field]
    process.standardOutput = pipe
    process.standardError = Pipe()
    do {
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { return nil }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
    } catch {
        return nil
    }
}

@MainActor
private func runAgent(socketPath: String, token: String?) {
    let app = NSApplication.shared
    let delegate = AgentRuntime(socketPath: socketPath, token: token)
    app.delegate = delegate
    // Why: SCK is reliable once this code runs as a signed app with a real TCC identity.
    setenv("YIRU_COMPUTER_USE_SCK_SCREENSHOTS", "1", 1)
    app.run()
}

private func printPermissionStatus() {
    let accessibility = accessibilityTrusted() ? "granted" : "not-granted"
    let screenshots = screenCaptureTrusted() ? "granted" : "not-granted"
    print(#"{"accessibility":"\#(accessibility)","screenshots":"\#(screenshots)"}"#)
}

private func writePermissionStatus(to path: String) {
    let accessibility = accessibilityTrusted() ? "granted" : "not-granted"
    let screenshots = screenCaptureTrusted() ? "granted" : "not-granted"
    let text = #"{"accessibility":"\#(accessibility)","screenshots":"\#(screenshots)"}"#
    do {
        try text.write(toFile: path, atomically: true, encoding: .utf8)
    } catch {
        fputs("failed to write permission status: \(error)\n", stderr)
        exit(1)
    }
}

private func runStdio() {
    fputs("Yiru Computer Use provider must be launched by Yiru in app-agent mode.\n", stderr)
    exit(13)
}

private func handleRequest(
    provider: Provider,
    lock: NSLock,
    request: Request,
    expectedToken: String?,
    authorizedPeer: Bool
) -> Any {
    if let expectedToken, request.token != expectedToken {
        return ["id": request.id, "ok": false, "error": ["code": "permission_denied", "message": "invalid computer-use agent token"]]
    }
    if expectedToken != nil && !authorizedPeer {
        return ["id": request.id, "ok": false, "error": ["code": "permission_denied", "message": "computer-use agent peer is not authorized"]]
    }
    if request.method == "terminate" {
        DispatchQueue.main.async {
            NSApp.terminate(nil)
        }
        return ["id": request.id, "ok": true, "result": ["ok": true]]
    }

    do {
        lock.lock()
        defer { lock.unlock() }
        let result = try provider.handle(method: request.method, params: request.params ?? [:])
        return ["id": request.id, "ok": true, "result": result]
    } catch let error as ProviderError {
        return ["id": request.id, "ok": false, "error": ["code": error.code, "message": error.message]]
    } catch {
        return ["id": request.id, "ok": false, "error": ["code": "accessibility_error", "message": String(describing: error)]]
    }
}

private func readLine(from fd: Int32) -> String? {
    var bytes: [UInt8] = []
    var byte: UInt8 = 0
    while true {
        let count = read(fd, &byte, 1)
        if count == 0 {
            return bytes.isEmpty ? nil : String(bytes: bytes, encoding: .utf8)
        }
        if count < 0 {
            return nil
        }
        if byte == 10 {
            return String(bytes: bytes, encoding: .utf8)
        }
        bytes.append(byte)
    }
}

private func writeJSON(_ object: Any, to fd: Int32?) {
    guard JSONSerialization.isValidJSONObject(object),
          let data = try? JSONSerialization.data(withJSONObject: object, options: [.withoutEscapingSlashes])
    else {
        return
    }
    if let fd {
        _ = writeAll(data, to: fd)
        _ = writeAll(Data([10]), to: fd)
    } else {
        guard let text = String(data: data, encoding: .utf8) else {
            return
        }
        print(text)
        fflush(stdout)
    }
}

private func writeAll(_ data: Data, to fd: Int32) -> Bool {
    data.withUnsafeBytes { rawBuffer in
        guard let baseAddress = rawBuffer.baseAddress else {
            return true
        }
        var offset = 0
        while offset < rawBuffer.count {
            let written = write(fd, baseAddress.advanced(by: offset), rawBuffer.count - offset)
            if written < 0 {
                if errno == EINTR {
                    continue
                }
                return false
            }
            if written == 0 {
                return false
            }
            offset += written
        }
        return true
    }
}

let arguments = Array(CommandLine.arguments.dropFirst())
if arguments.first == "--agent" {
    guard arguments.count >= 2 else {
        fputs("usage: yiru-computer-use-macos --agent <socket-path> --token-file <token-path>\n", stderr)
        exit(2)
    }
    let tokenFileIndex = arguments.firstIndex(of: "--token-file")
    let token = tokenFileIndex.flatMap { index -> String? in
        let valueIndex = index + 1
        guard valueIndex < arguments.count else { return nil }
        let tokenPath = arguments[valueIndex]
        return try? String(contentsOfFile: tokenPath, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
    guard let token, !token.isEmpty else {
        fputs("yiru-computer-use-macos --agent requires a non-empty --token-file\n", stderr)
        exit(2)
    }
    runAgent(socketPath: arguments[1], token: token)
} else if arguments.first == "--permissions" {
    runPermissionFlowSetup()
} else if arguments.first == "--permission" {
    runPermissionFlowSetup(initialPermissionValue: arguments.dropFirst().first)
} else if arguments.first == "--permission-status" {
    printPermissionStatus()
} else if arguments.first == "--permission-status-file" {
    guard arguments.count >= 2 else {
        fputs("usage: yiru-computer-use-macos --permission-status-file <path>\n", stderr)
        exit(2)
    }
    writePermissionStatus(to: arguments[1])
} else {
    runStdio()
}
