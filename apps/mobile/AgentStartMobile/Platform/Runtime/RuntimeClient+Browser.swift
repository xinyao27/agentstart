import AgentStartProtocol
import Foundation
import SwiftProtobuf

extension RuntimeClient: WorkspaceBrowserRepository {
    func browserEvents(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        configuration: WorkspaceBrowserStreamConfiguration
    ) async throws -> AsyncThrowingStream<WorkspaceBrowserEvent, Error> {
        let source = try await protocolBrowserScreencast(
            hostID: hostID,
            request: screencastRequest(
                worktreeID: worktreeID,
                pageID: pageID,
                configuration: configuration
            )
        )
        let (stream, continuation) = AsyncThrowingStream.makeStream(of: WorkspaceBrowserEvent.self)
        let forwardingTask = Task {
            do {
                for try await event in source {
                    switch event.event {
                    case .ready(let ready):
                        continuation.yield(.ready(url: ready.tabURL, title: ready.tabTitle))
                    case .frame(let frame):
                        continuation.yield(.frame(browserFrame(frame)))
                    case nil:
                        continue
                    }
                }
                // Why: the protobuf stream models the legacy end event as plain
                // server-side completion, so a finished iterator is the end.
                continuation.yield(.end)
                continuation.finish()
            } catch is CancellationError {
                continuation.finish()
            } catch let error as RuntimeTransportError {
                // Why: a daemon-declined screencast (bad page, authority gone) arrives as a
                // server Status and used to surface as an error event carrying the daemon's
                // message; keep that shape. Real transport failures still throw.
                guard case .serverStatus(_, let message) = error else {
                    continuation.finish(throwing: error)
                    return
                }
                continuation.yield(.error(message))
                continuation.finish()
            } catch {
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in
            // Why: cancelling the stream is the screencast unsubscribe — the
            // service defines no separate unsubscribe rpc.
            forwardingTask.cancel()
            Task { try? await source.cancel() }
        }
        return stream
    }

    func navigateBrowser(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        action: WorkspaceBrowserNavigation
    ) async throws -> String {
        let target = browserTarget(worktreeID: worktreeID, pageID: pageID)
        let command: AgentStart_Runtime_V1_ExecuteMobileRequest.OneOf_Command =
            switch action {
            case .back: .back(targetCommand(target))
            case .forward: .forward(targetCommand(target))
            case .reload: .reload(targetCommand(target))
            }
        let result = try await executeMobile(hostID: hostID, command: command)
        return try navigationURL(of: result)
    }

    func navigateBrowser(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        url: String
    ) async throws -> String {
        var command = AgentStart_Runtime_V1_UrlCommand()
        command.target = browserTarget(worktreeID: worktreeID, pageID: pageID)
        command.url = url
        let result = try await executeMobile(hostID: hostID, command: .goto(command))
        guard case .goto(let navigation) = result else {
            throw RuntimeServiceError.unexpectedResponse
        }
        return navigation.url
    }

    func clickBrowser(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        point: WorkspaceBrowserPoint,
        button: WorkspaceBrowserButton,
        radius: Double?,
        modifiers: [WorkspaceBrowserPointerModifier]
    ) async throws {
        let target = browserTarget(worktreeID: worktreeID, pageID: pageID)
        do {
            var command = AgentStart_Runtime_V1_MouseClickCommand()
            command.target = target
            command.x = point.x
            command.y = point.y
            command.button = button.rawValue
            if let radius {
                command.radius = radius
            }
            command.modifiers = modifiers.map(\.rawValue)
            _ = try await executeMobile(hostID: hostID, command: .mouseClick(command))
        } catch {
            guard modifiers.isEmpty else { throw error }
            // Why: a synthetic click can be rejected where plain move/down/up succeeds, so
            // fall back to the decomposed pointer sequence without modifiers.
            _ = try await executeMobile(
                hostID: hostID,
                command: .mouseMove(moveCommand(target, point: point))
            )
            _ = try await executeMobile(
                hostID: hostID,
                command: .mouseDown(buttonCommand(target, button: button))
            )
            _ = try await executeMobile(
                hostID: hostID,
                command: .mouseUp(buttonCommand(target, button: button))
            )
        }
    }

    func scrollBrowser(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        point: WorkspaceBrowserPoint,
        deltaX: Double,
        deltaY: Double
    ) async throws {
        let target = browserTarget(worktreeID: worktreeID, pageID: pageID)
        _ = try await executeMobile(
            hostID: hostID,
            command: .mouseMove(moveCommand(target, point: point))
        )
        var command = AgentStart_Runtime_V1_MouseWheelCommand()
        command.target = target
        command.dy = deltaY
        command.dx = deltaX
        _ = try await executeMobile(hostID: hostID, command: .mouseWheel(command))
    }

    func pressBrowserKey(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        key: String
    ) async throws {
        var command = AgentStart_Runtime_V1_KeyCommand()
        command.target = browserTarget(worktreeID: worktreeID, pageID: pageID)
        command.key = key
        _ = try await executeMobile(hostID: hostID, command: .keypress(command))
    }

    func insertBrowserText(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        text: String
    ) async throws {
        var command = AgentStart_Runtime_V1_TextCommand()
        command.target = browserTarget(worktreeID: worktreeID, pageID: pageID)
        command.text = text
        _ = try await executeMobile(hostID: hostID, command: .insertText(command))
    }

    func respondToBrowserDialog(
        for hostID: String,
        worktreeID: String,
        pageID: String,
        accepts: Bool
    ) async throws {
        let target = browserTarget(worktreeID: worktreeID, pageID: pageID)
        let command: AgentStart_Runtime_V1_ExecuteMobileRequest.OneOf_Command =
            if accepts {
                // Why: dialog acceptance carries optional prompt text this surface never
                // collects, so the field stays unset the way the legacy wire sent null.
                .dialogAccept(optionalTextCommand(target))
            } else {
                .dialogDismiss(targetCommand(target))
            }
        _ = try await executeMobile(hostID: hostID, command: command)
    }

    func browserTabCreate(
        hostID: String,
        worktreeID: String,
        url: String
    ) async throws -> String {
        // Why: tab creation addresses the worktree alone — the daemon picks the page,
        // matching the legacy tabCreate request which carried no page id.
        var command = AgentStart_Runtime_V1_TabCreateCommand()
        command.target = browserTarget(worktreeID: worktreeID, pageID: nil)
        command.url = url
        let result = try await executeMobile(hostID: hostID, command: .tabCreate(command))
        guard case .tabCreate(let page) = result else {
            throw RuntimeServiceError.unexpectedResponse
        }
        return page.browserPageID
    }

    // ─── ExecuteMobile plumbing ─────────────────────────────────────────────────

    private func executeMobile(
        hostID: String,
        command: AgentStart_Runtime_V1_ExecuteMobileRequest.OneOf_Command
    ) async throws -> AgentStart_Runtime_V1_ExecuteMobileResponse.OneOf_Result {
        var request = AgentStart_Runtime_V1_ExecuteMobileRequest()
        request.command = command
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1BrowserHostServiceMethods.executeMobile,
            request: request,
            response: AgentStart_Runtime_V1_ExecuteMobileResponse.self
        )
        guard let result = response.result else {
            throw RuntimeServiceError.unexpectedResponse
        }
        return result
    }

    private func screencastRequest(
        worktreeID: String,
        pageID: String,
        configuration: WorkspaceBrowserStreamConfiguration
    ) -> AgentStart_Runtime_V1_BrowserScreencastSubscribeRequest {
        let scale = min(max(configuration.scale, 1), 2.5)
        let isMobile = configuration.viewMode == .mobile
        var request = AgentStart_Runtime_V1_BrowserScreencastSubscribeRequest()
        request.target = browserTarget(worktreeID: worktreeID, pageID: pageID)
        request.format = "jpeg"
        request.quality = 72
        request.maxWidth = Double(min(max(Int(Double(configuration.width) * scale), 320), 2_400))
        request.maxHeight = Double(min(max(Int(Double(configuration.height) * scale), 240), 2_160))
        if isMobile {
            request.viewportWidth = Double(configuration.width)
            request.viewportHeight = Double(configuration.height)
            request.deviceScaleFactor = 2
            request.mobile = true
        }
        request.everyNthFrame = 1
        request.minFrameIntervalMs = 100
        return request
    }

    private func browserTarget(
        worktreeID: String,
        pageID: String?
    ) -> AgentStart_Runtime_V1_BrowserTarget {
        var target = AgentStart_Runtime_V1_BrowserTarget()
        target.worktree = browserWorktreeSelector(worktreeID)
        if let pageID {
            target.page = pageID
        }
        return target
    }

    private func browserWorktreeSelector(_ worktreeID: String) -> String {
        "id:\(worktreeID)"
    }
}

// ─── Protobuf command/result mapping ─────────────────────────────────────────

nonisolated private func targetCommand(
    _ target: AgentStart_Runtime_V1_BrowserTarget
) -> AgentStart_Runtime_V1_TargetCommand {
    var command = AgentStart_Runtime_V1_TargetCommand()
    command.target = target
    return command
}

nonisolated private func optionalTextCommand(
    _ target: AgentStart_Runtime_V1_BrowserTarget
) -> AgentStart_Runtime_V1_OptionalTextCommand {
    var command = AgentStart_Runtime_V1_OptionalTextCommand()
    command.target = target
    return command
}

nonisolated private func moveCommand(
    _ target: AgentStart_Runtime_V1_BrowserTarget,
    point: WorkspaceBrowserPoint
) -> AgentStart_Runtime_V1_MouseMoveCommand {
    var command = AgentStart_Runtime_V1_MouseMoveCommand()
    command.target = target
    command.x = point.x
    command.y = point.y
    return command
}

nonisolated private func buttonCommand(
    _ target: AgentStart_Runtime_V1_BrowserTarget,
    button: WorkspaceBrowserButton
) -> AgentStart_Runtime_V1_MouseButtonCommand {
    var command = AgentStart_Runtime_V1_MouseButtonCommand()
    command.target = target
    command.button = button.rawValue
    return command
}

nonisolated private func navigationURL(
    of result: AgentStart_Runtime_V1_ExecuteMobileResponse.OneOf_Result
) throws -> String {
    let navigation: AgentStart_Runtime_V1_NavigationResult?
    switch result {
    case .goto(let value), .back(let value), .forward(let value), .reload(let value):
        navigation = value
    case .keypress, .insertText, .mouseClick, .mouseMove, .mouseDown, .mouseUp, .mouseWheel,
        .tabCreate, .dialogAccept, .dialogDismiss, .viewport:
        navigation = nil
    }
    guard let navigation else { throw RuntimeServiceError.unexpectedResponse }
    return navigation.url
}

nonisolated private func browserFrame(
    _ event: AgentStart_Runtime_V1_BrowserScreencastFrame
) -> WorkspaceBrowserFrame {
    let metadata = event.metadata
    return WorkspaceBrowserFrame(
        sequence: event.sequence,
        format: event.format,
        metadata: WorkspaceBrowserFrameMetadata(
            offsetTop: nil,
            pageScaleFactor: metadata.pageScaleFactor,
            deviceWidth: metadata.deviceWidth,
            deviceHeight: metadata.deviceHeight,
            imageWidth: metadata.imageWidth,
            imageHeight: metadata.imageHeight,
            scrollOffsetX: metadata.scrollOffsetX,
            scrollOffsetY: metadata.scrollOffsetY,
            timestamp: metadata.timestamp
        ),
        image: event.image
    )
}
