import CoreGraphics
import Foundation
import Observation

nonisolated enum WorkspaceBrowserPhase: Sendable {
    case waiting
    case ready
    case failed(String)
}

nonisolated private struct PendingBrowserScroll: Sendable {
    let pageID: String
    let point: WorkspaceBrowserPoint
    let deltaX: Double
    let deltaY: Double
}

nonisolated struct WorkspaceBrowserRenderedFrame {
    let frame: WorkspaceBrowserFrame
    let image: CGImage
}

@Observable
@MainActor
final class WorkspaceBrowserModel {
    private(set) var phase = WorkspaceBrowserPhase.waiting
    private var frame: WorkspaceBrowserFrame?
    private(set) var renderedFrame: WorkspaceBrowserRenderedFrame?
    private(set) var dialog: WorkspaceBrowserDialog?
    private(set) var isCommandRunning = false
    private(set) var pointerModifiers: Set<WorkspaceBrowserPointerModifier> = []
    private(set) var canGoBack: Bool
    private(set) var canGoForward: Bool
    var address: String
    var keyboardText = ""

    @ObservationIgnored private let hostID: String
    @ObservationIgnored private let worktreeID: String
    @ObservationIgnored private let repository: any WorkspaceBrowserRepository
    @ObservationIgnored private var committedAddress: String
    @ObservationIgnored private var pendingScroll: PendingBrowserScroll?
    @ObservationIgnored private var scrollTask: Task<Void, Never>?
    @ObservationIgnored private var frameDecodeTask: Task<Void, Never>?
    @ObservationIgnored private var pendingDecodeFrame: WorkspaceBrowserFrame?
    @ObservationIgnored private var frameGeneration = UUID()
    @ObservationIgnored private var activeStreamID = UUID()
    @ObservationIgnored private var streamStartupTimer: Task<Void, Never>?

    init(
        hostID: String,
        worktreeID: String,
        initialURL: String,
        canGoBack: Bool,
        canGoForward: Bool,
        repository: any WorkspaceBrowserRepository
    ) {
        self.hostID = hostID
        self.worktreeID = worktreeID
        self.canGoBack = canGoBack
        self.canGoForward = canGoForward
        let displayURL = workspaceBrowserDisplayURL(initialURL)
        address = displayURL
        committedAddress = displayURL
        self.repository = repository
    }

    func stream(pageID: String, configuration: WorkspaceBrowserStreamConfiguration) async {
        let streamID = UUID()
        activeStreamID = streamID
        defer {
            if activeStreamID == streamID {
                cancelStreamStartupTimer()
                resetFramePresentation()
            }
        }
        while !Task.isCancelled, activeStreamID == streamID {
            resetFramePresentation()
            // Why: mark every new subscription busy, including one that has a cached frame,
            // so a stale remote image cannot look healthy while Desktop has stopped publishing.
            phase = .waiting
            startStreamStartupTimer()
            do {
                let events = try await repository.browserEvents(
                    for: hostID,
                    worktreeID: worktreeID,
                    pageID: pageID,
                    configuration: configuration
                )
                for try await event in events {
                    guard !Task.isCancelled, activeStreamID == streamID else { return }
                    apply(event)
                }
            } catch is CancellationError {
                guard activeStreamID == streamID else { return }
                cancelStreamStartupTimer()
                return
            } catch {
                guard activeStreamID == streamID else { return }
                cancelStreamStartupTimer()
                let message = workspaceBrowserErrorMessage(
                    error,
                    fallback: String(localized: "Browser stream unavailable")
                )
                if shouldSurfaceWorkspaceBrowserError(message) {
                    phase = .failed(message)
                } else {
                    phase = frame == nil ? .waiting : .ready
                }
            }
            guard activeStreamID == streamID else { return }
            cancelStreamStartupTimer()
            do {
                try await Task.sleep(for: .seconds(2))
            } catch {
                return
            }
        }
    }

    func synchronizeURL(_ url: String, whileFocused: Bool) {
        guard !whileFocused else { return }
        let nextAddress = workspaceBrowserDisplayURL(url)
        address = nextAddress
        committedAddress = nextAddress
    }

    func synchronizeNavigation(canGoBack: Bool, canGoForward: Bool) {
        // Why: the session snapshot is authoritative after the remote browser
        // finishes a navigation. Keeping the old OR-only update leaves Back or
        // Forward enabled after the page returns to the start of its history.
        self.canGoBack = canGoBack
        self.canGoForward = canGoForward
    }

    func navigate(pageID: String, action: WorkspaceBrowserNavigation) async {
        // Why: suppress transient CDP navigation errors. Chromium can report that the inspected
        // target was replaced while Back/Forward/Reload is already moving to the next document;
        // the stream's next ready/frame event is the authoritative result.
        await performCommand(suppressError: true) {
            let url = try await repository.navigateBrowser(
                for: hostID,
                worktreeID: worktreeID,
                pageID: pageID,
                action: action
            )
            let nextAddress = workspaceBrowserDisplayURL(url)
            address = nextAddress
            committedAddress = address
        }
    }

    func submitAddress(pageID: String) async {
        guard let url = workspaceBrowserURL(address) else {
            phase = .failed(String(localized: "Enter a valid URL."))
            return
        }
        await performCommand {
            let next = try await repository.navigateBrowser(
                for: hostID,
                worktreeID: worktreeID,
                pageID: pageID,
                url: url
            )
            address = workspaceBrowserDisplayURL(next)
            committedAddress = address
        }
    }

    func click(
        pageID: String,
        point: WorkspaceBrowserPoint,
        button: WorkspaceBrowserButton = .left,
        radius: Double? = nil
    ) async {
        do {
            try await repository.clickBrowser(
                for: hostID,
                worktreeID: worktreeID,
                pageID: pageID,
                point: point,
                button: button,
                radius: radius,
                modifiers: WorkspaceBrowserPointerModifier.allCases.filter(
                    pointerModifiers.contains)
            )
        } catch is CancellationError {
            return
        } catch {
            reportCommandFailure(error)
        }
    }

    func togglePointerModifier(_ modifier: WorkspaceBrowserPointerModifier) {
        if pointerModifiers.contains(modifier) {
            pointerModifiers.remove(modifier)
        } else {
            pointerModifiers.insert(modifier)
        }
    }

    func queueScroll(
        pageID: String,
        point: WorkspaceBrowserPoint,
        deltaX: Double,
        deltaY: Double
    ) {
        if let pendingScroll, pendingScroll.pageID == pageID {
            self.pendingScroll = PendingBrowserScroll(
                pageID: pageID,
                point: point,
                deltaX: pendingScroll.deltaX + deltaX,
                deltaY: pendingScroll.deltaY + deltaY
            )
        } else {
            pendingScroll = PendingBrowserScroll(
                pageID: pageID,
                point: point,
                deltaX: deltaX,
                deltaY: deltaY
            )
        }
        guard scrollTask == nil else { return }
        scrollTask = Task { [weak self] in await self?.drainScrollQueue() }
    }

    private func drainScrollQueue() async {
        while !Task.isCancelled, let command = pendingScroll {
            pendingScroll = nil
            do {
                try await repository.scrollBrowser(
                    for: hostID,
                    worktreeID: worktreeID,
                    pageID: command.pageID,
                    point: command.point,
                    deltaX: command.deltaX,
                    deltaY: command.deltaY
                )
            } catch is CancellationError {
                return
            } catch {
                reportCommandFailure(error)
            }
        }
        scrollTask = nil
        if pendingScroll != nil {
            scrollTask = Task { [weak self] in await self?.drainScrollQueue() }
        }
    }

    func press(pageID: String, key: String) async {
        do {
            try await repository.pressBrowserKey(
                for: hostID,
                worktreeID: worktreeID,
                pageID: pageID,
                key: key
            )
        } catch is CancellationError {
            return
        } catch {
            reportCommandFailure(error)
        }
    }

    func sendKeyboardText(pageID: String) async {
        guard !keyboardText.isEmpty else { return }
        let text = keyboardText
        keyboardText = ""
        do {
            try await repository.insertBrowserText(
                for: hostID,
                worktreeID: worktreeID,
                pageID: pageID,
                text: text
            )
        } catch {
            keyboardText = text
            reportCommandFailure(error)
        }
    }

    func respondToDialog(pageID: String, accepts: Bool) async {
        dialog = nil
        do {
            try await repository.respondToBrowserDialog(
                for: hostID,
                worktreeID: worktreeID,
                pageID: pageID,
                accepts: accepts
            )
        } catch is CancellationError {
            return
        } catch {
            reportCommandFailure(error)
        }
    }

    func dismissDialog() {
        dialog = nil
    }

    private func apply(_ event: WorkspaceBrowserEvent) {
        switch event {
        case .ready(let url, _):
            cancelStreamStartupTimer()
            let nextAddress = workspaceBrowserDisplayURL(url)
            address = nextAddress
            committedAddress = nextAddress
            phase = .ready
        case .frame(let frame):
            cancelStreamStartupTimer()
            self.frame = frame
            decodeFrame(frame)
            phase = .ready
        case .dialog(let dialog):
            self.dialog = dialog
        case .dialogClosed:
            dialog = nil
        case .end:
            cancelStreamStartupTimer()
            phase = frame == nil ? .waiting : .ready
        case .error(let message):
            cancelStreamStartupTimer()
            guard shouldSurfaceWorkspaceBrowserError(message) else {
                phase = frame == nil ? .waiting : .ready
                return
            }
            phase = .failed(message)
        }
    }

    private func startStreamStartupTimer() {
        streamStartupTimer?.cancel()
        streamStartupTimer = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(15))
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            self?.markStreamStartupTimedOut()
        }
    }

    private func cancelStreamStartupTimer() {
        streamStartupTimer?.cancel()
        streamStartupTimer = nil
    }

    private func markStreamStartupTimedOut() {
        guard case .waiting = phase else { return }
        phase = .failed(String(localized: "Browser stream timed out."))
    }

    private func performCommand(
        suppressError: Bool = false,
        _ operation: () async throws -> Void
    ) async {
        guard !isCommandRunning else { return }
        isCommandRunning = true
        defer { isCommandRunning = false }
        do {
            try await operation()
            if frame != nil { phase = .ready }
        } catch is CancellationError {
            return
        } catch {
            if suppressError {
                if frame != nil { phase = .ready }
            } else {
                reportCommandFailure(error)
            }
        }
    }

    private func reportCommandFailure(_ error: Error) {
        let message = workspaceBrowserErrorMessage(
            error,
            fallback: String(localized: "Browser command failed")
        )
        guard shouldSurfaceWorkspaceBrowserError(message) else {
            if frame != nil { phase = .ready }
            return
        }
        phase = .failed(message)
    }

    private func resetFramePresentation() {
        frameGeneration = UUID()
        frameDecodeTask?.cancel()
        frameDecodeTask = nil
        pendingDecodeFrame = nil
        frame = nil
        renderedFrame = nil
    }

    private func decodeFrame(_ frame: WorkspaceBrowserFrame) {
        pendingDecodeFrame = frame
        guard frameDecodeTask == nil else { return }
        let generation = frameGeneration
        frameDecodeTask = Task { [weak self] in
            guard let self else { return }
            while let next = pendingDecodeFrame {
                pendingDecodeFrame = nil
                let maxPixelSize = max(
                    Int(next.metadata.imageWidth ?? 0),
                    Int(next.metadata.imageHeight ?? 0),
                    2_400
                )
                let image = await Task.detached(priority: .userInitiated) {
                    WorkspaceBrowserFrameImageDecoder.decode(
                        next.image,
                        maxPixelSize: maxPixelSize
                    )
                }.value
                guard !Task.isCancelled, frameGeneration == generation else { return }
                if let image {
                    // Why: pixels and pointer coordinates advance together only after decoding completes.
                    renderedFrame = WorkspaceBrowserRenderedFrame(frame: next, image: image)
                }
            }
            frameDecodeTask = nil
        }
    }

}

nonisolated func workspaceBrowserDisplayURL(_ value: String?) -> String {
    let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if trimmed.isEmpty || trimmed == "about:blank" || trimmed.hasPrefix("data:text/html") {
        return "about:blank"
    }
    return trimmed
}

nonisolated func workspaceBrowserURL(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty || trimmed == "about:blank" || trimmed.hasPrefix("data:text/html") {
        return "about:blank"
    }
    let localPattern = #"^(localhost|127(?:\.\d{1,3}){3}|\[[0-9a-f:]+\])(?::\d+)?(?:[/?#].*)?$"#
    let localDomainPattern = #"^[\w.-]+\.local(?::\d+)?(?:[/?#].*)?$"#
    if trimmed.range(of: localPattern, options: [.regularExpression, .caseInsensitive]) != nil
        || trimmed.range(of: localDomainPattern, options: [.regularExpression, .caseInsensitive])
            != nil
    {
        return URL(string: "http://\(trimmed)")?.absoluteString
    }
    if let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(),
        ["http", "https", "file"].contains(scheme)
    {
        return url.absoluteString
    }
    if URL(string: trimmed)?.scheme != nil {
        return nil
    }
    return URL(string: "https://\(trimmed)")?.absoluteString
}

nonisolated func workspaceBrowserErrorMessage(_ error: Error, fallback: String) -> String {
    let detail = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
    return detail.isEmpty ? fallback : detail
}

nonisolated func shouldSurfaceWorkspaceBrowserError(_ message: String) -> Bool {
    let normalized = message.lowercased()
    // Why: Desktop can report a selector race while the browser page is still healthy. Keep the
    // last frame visible instead of replacing it with a transient automation error.
    return !normalized.contains("selector_not_found")
        && !normalized.contains("selector not found")
}
