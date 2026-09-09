import Foundation
import SwiftProtobuf
import YiruProtocol

extension RuntimeClient {
    func sessionTabsSnapshot(
        hostID: String,
        worktreeSelector: String
    ) async throws -> MobileSessionTabsWire {
        var request = Yiru_Runtime_V1_SessionTabsServiceListRequest()
        request.worktree = worktreeSelector
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1SessionTabsServiceMethods.list,
            request: request,
            response: Yiru_Runtime_V1_SessionTabsSnapshot.self
        )
        return sessionTabsWire(response)
    }

    func sessionTabsAllSnapshots(hostID: String) async throws -> [MobileSessionTabsWire] {
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1SessionTabsServiceMethods.listAll,
            request: Yiru_Runtime_V1_SessionTabsServiceListAllRequest(),
            response: Yiru_Runtime_V1_SessionTabsServiceListAllResponse.self
        )
        return response.snapshots.map(sessionTabsWire)
    }

    func sessionTabsActivate(
        hostID: String,
        worktreeSelector: String,
        tabID: String,
        leafID: String?,
        notifyClients: Bool
    ) async throws -> MobileSessionTabsWire {
        var request = Yiru_Runtime_V1_SessionTabsServiceActivateRequest()
        request.worktree = worktreeSelector
        request.tabID = tabID
        if let leafID {
            request.leafID = leafID
        }
        request.notifyClients = notifyClients
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1SessionTabsServiceMethods.activate,
            request: request,
            response: Yiru_Runtime_V1_SessionTabsSnapshot.self
        )
        return sessionTabsWire(response)
    }

    func sessionTabsClose(
        hostID: String,
        worktreeSelector: String,
        tabID: String
    ) async throws -> Bool {
        var request = Yiru_Runtime_V1_SessionTabsServiceTabRequest()
        request.worktree = worktreeSelector
        request.tabID = tabID
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1SessionTabsServiceMethods.close,
            request: request,
            response: Yiru_Runtime_V1_SessionTabsServiceClosedResponse.self
        )
        return response.closed
    }

    func sessionTabsCreateTerminal(
        hostID: String,
        request wire: MobileSessionCreateTerminalRequestWire
    ) async throws -> MobileSessionCreateTerminalResultWire {
        var request = Yiru_Runtime_V1_SessionTabsServiceCreateTerminalRequest()
        request.worktree = wire.worktree
        if let afterTabID = wire.afterTabId {
            request.afterTabID = afterTabID
        }
        if let activate = wire.activate {
            request.activate = activate
        }
        if let clientMutationID = wire.clientMutationId {
            request.clientMutationID = clientMutationID
        }
        if let agent = wire.agent {
            request.agent = agent
        }
        if let command = wire.command {
            request.command = command
        }
        if let env = wire.env {
            request.env = env
        }
        if let envToDelete = wire.envToDelete {
            request.envToDelete = envToDelete
        }
        if let launchConfig = wire.launchConfig {
            var config = Yiru_Runtime_V1_SessionTabsLaunchConfig()
            config.agentArgs = launchConfig.agentArgs
            config.agentEnv = launchConfig.agentEnv
            if let agentCommand = launchConfig.agentCommand {
                config.agentCommand = agentCommand
            }
            if let ompResumeFilePath = launchConfig.ompResumeFilePath {
                config.ompResumeFilePath = ompResumeFilePath
            }
            request.launchConfig = config
        }
        if let launchAgent = wire.launchAgent {
            request.launchAgent = launchAgent
        }
        switch wire.startupCommandDelivery {
        case "fast":
            var delivery = Yiru_Runtime_V1_SessionTabsStartupCommandDelivery()
            delivery.delivery = .fast(true)
            request.startupCommandDelivery = delivery
        case "shell-ready":
            var delivery = Yiru_Runtime_V1_SessionTabsStartupCommandDelivery()
            delivery.delivery = .shellReady(true)
            request.startupCommandDelivery = delivery
        default:
            break
        }
        if let agentPrompt = wire.agentPrompt {
            request.agentPrompt = agentPrompt
        }
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1SessionTabsServiceMethods.createTerminal,
            request: request,
            response: Yiru_Runtime_V1_SessionTabsServiceCreateTerminalResponse.self
        )
        guard let createdTab = sessionTabWire(response.tab) else {
            throw RuntimeServiceError.unexpectedResponse
        }
        return MobileSessionCreateTerminalResultWire(
            tab: createdTab,
            publicationEpoch: response.publicationEpoch,
            snapshotVersion: Int64(response.snapshotVersion)
        )
    }

    func sessionTabsEventUpdates(
        hostID: String,
        worktreeSelector: String
    ) async throws -> AsyncThrowingStream<MobileSessionTabsEventWire, Error> {
        let source = try await protocolSessionTabsEvents(
            hostID: hostID,
            worktree: worktreeSelector
        )
        let (stream, continuation) = AsyncThrowingStream.makeStream(
            of: MobileSessionTabsEventWire.self
        )
        let forwardingTask = Task {
            do {
                for try await event in source {
                    switch event.event {
                    case .snapshot(let snapshot):
                        continuation.yield(.snapshot(sessionTabsWire(snapshot)))
                    case .updated(let snapshot):
                        continuation.yield(.updated(sessionTabsWire(snapshot)))
                    case .end:
                        continuation.yield(.end)
                        continuation.finish()
                        return
                    case nil:
                        continue
                    }
                }
                continuation.finish()
            } catch {
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in
            Task { try? await source.cancel() }
        }
        return stream
    }

    func sessionTabsAllEventUpdates(
        hostID: String
    ) async throws -> AsyncThrowingStream<MobileSessionTabsAllEventWire, Error> {
        let source = try await protocolSessionTabsAllEvents(hostID: hostID)
        let (stream, continuation) = AsyncThrowingStream.makeStream(
            of: MobileSessionTabsAllEventWire.self
        )
        let forwardingTask = Task {
            do {
                for try await event in source {
                    switch event.event {
                    case .snapshots(let list):
                        continuation.yield(
                            .snapshots(list.snapshots.map(sessionTabsWire))
                        )
                    case .updated(let snapshot):
                        continuation.yield(.updated(sessionTabsWire(snapshot)))
                    case .end:
                        continuation.yield(.end)
                        continuation.finish()
                        return
                    case nil:
                        continue
                    }
                }
                continuation.finish()
            } catch {
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in
            Task { try? await source.cancel() }
        }
        return stream
    }
}

// ─── Protobuf → wire projections ────────────────────────────────────────────

nonisolated private func sessionTabsWire(
    _ snapshot: Yiru_Runtime_V1_SessionTabsSnapshot
) -> MobileSessionTabsWire {
    MobileSessionTabsWire(
        worktree: snapshot.worktree,
        publicationEpoch: snapshot.publicationEpoch,
        snapshotVersion: Int64(snapshot.snapshotVersion),
        activeTabId: snapshot.hasActiveTabID ? snapshot.activeTabID : nil,
        activeTabType: sessionTabTypeWire(snapshot.activeTabType),
        tabs: snapshot.tabs.compactMap(sessionTabWire)
    )
}

nonisolated private func sessionTabWire(
    _ tab: Yiru_Runtime_V1_SessionTabsTab
) -> MobileSessionTabWire? {
    switch tab.tab {
    case .terminal(let terminal):
        let isReady = terminal.status == .ready && terminal.hasTerminal
        return MobileSessionTabWire(
            id: terminal.id,
            title: terminal.title,
            isActive: terminal.isActive,
            color: terminal.hasColor ? terminal.color : nil,
            isPinned: terminal.hasIsPinned ? terminal.isPinned : nil,
            type: .terminal,
            parentTabId: terminal.parentTabID,
            leafId: terminal.leafID,
            ptyId: terminal.hasPtyID ? terminal.ptyID : nil,
            launchAgent: terminal.hasLaunchAgent ? terminal.launchAgent : nil,
            resolvedAgentType: terminal.hasResolvedAgentType ? terminal.resolvedAgentType : nil,
            agentStatus: terminal.hasAgentStatus
                ? sessionAgentStatusWire(terminal.agentStatus) : nil,
            status: terminal.status == .sleeping ? .sleeping : isReady ? .ready : .pendingHandle,
            terminal: isReady ? terminal.terminal : nil,
            worktreeInstanceId: terminal.hasWorktreeInstanceID
                ? terminal.worktreeInstanceID : nil,
            filePath: nil,
            relativePath: nil,
            language: nil,
            mode: nil,
            diffSource: nil,
            isDirty: nil,
            sourceFileId: nil,
            sourceFilePath: nil,
            sourceRelativePath: nil,
            documentVersion: nil,
            browserWorkspaceId: nil,
            browserPageId: nil,
            url: nil,
            loading: nil,
            canGoBack: nil,
            canGoForward: nil
        )
    case .markdown(let markdown):
        return MobileSessionTabWire(
            id: markdown.id,
            title: markdown.title,
            isActive: markdown.isActive,
            color: markdown.hasColor ? markdown.color : nil,
            isPinned: markdown.hasIsPinned ? markdown.isPinned : nil,
            type: .markdown,
            parentTabId: nil,
            leafId: nil,
            ptyId: nil,
            launchAgent: nil,
            resolvedAgentType: nil,
            agentStatus: nil,
            status: nil,
            terminal: nil,
            worktreeInstanceId: nil,
            filePath: markdown.filePath,
            relativePath: markdown.relativePath,
            language: "markdown",
            mode: markdown.mode == .preview ? "markdown-preview" : "edit",
            diffSource: nil,
            isDirty: markdown.isDirty,
            sourceFileId: markdown.sourceFileID,
            sourceFilePath: markdown.sourceFilePath,
            sourceRelativePath: markdown.sourceRelativePath,
            documentVersion: markdown.documentVersion,
            browserWorkspaceId: nil,
            browserPageId: nil,
            url: nil,
            loading: nil,
            canGoBack: nil,
            canGoForward: nil
        )
    case .file(let file):
        return MobileSessionTabWire(
            id: file.id,
            title: file.title,
            isActive: file.isActive,
            color: file.hasColor ? file.color : nil,
            isPinned: file.hasIsPinned ? file.isPinned : nil,
            type: .file,
            parentTabId: nil,
            leafId: nil,
            ptyId: nil,
            launchAgent: nil,
            resolvedAgentType: nil,
            agentStatus: nil,
            status: nil,
            terminal: nil,
            worktreeInstanceId: nil,
            filePath: file.filePath,
            relativePath: file.relativePath,
            language: file.language,
            mode: sessionFileModeWire(file.mode),
            diffSource: sessionFileDiffSourceWire(file.diffSource),
            isDirty: file.isDirty,
            sourceFileId: nil,
            sourceFilePath: nil,
            sourceRelativePath: nil,
            documentVersion: nil,
            browserWorkspaceId: nil,
            browserPageId: nil,
            url: nil,
            loading: nil,
            canGoBack: nil,
            canGoForward: nil
        )
    case .browser(let browser):
        return MobileSessionTabWire(
            id: browser.id,
            title: browser.title,
            isActive: browser.isActive,
            color: browser.hasColor ? browser.color : nil,
            isPinned: browser.hasIsPinned ? browser.isPinned : nil,
            type: .browser,
            parentTabId: nil,
            leafId: nil,
            ptyId: nil,
            launchAgent: nil,
            resolvedAgentType: nil,
            agentStatus: nil,
            status: nil,
            terminal: nil,
            worktreeInstanceId: nil,
            filePath: nil,
            relativePath: nil,
            language: nil,
            mode: nil,
            diffSource: nil,
            isDirty: nil,
            sourceFileId: nil,
            sourceFilePath: nil,
            sourceRelativePath: nil,
            documentVersion: nil,
            browserWorkspaceId: browser.browserWorkspaceID,
            browserPageId: browser.hasBrowserPageID ? browser.browserPageID : nil,
            url: browser.url,
            loading: browser.loading,
            canGoBack: browser.canGoBack,
            canGoForward: browser.canGoForward
        )
    case nil:
        return nil
    }
}

nonisolated private func sessionAgentStatusWire(
    _ status: Yiru_Runtime_V1_SessionTabsAgentStatus
) -> MobileSessionAgentStatusWire {
    MobileSessionAgentStatusWire(
        state: sessionAgentStateWire(status.state),
        paneKey: status.hasPaneKey ? status.paneKey : nil,
        prompt: status.hasPrompt ? status.prompt : nil,
        updatedAt: status.hasUpdatedAt ? status.updatedAt : nil,
        stateStartedAt: status.hasStateStartedAt ? status.stateStartedAt : nil,
        agentType: status.hasAgentType ? status.agentType : nil,
        interactivePrompt: status.hasInteractivePrompt ? status.interactivePrompt : nil,
        lastAssistantMessage: status.hasLastAssistantMessage
            ? status.lastAssistantMessage : nil,
        toolName: status.hasToolName ? status.toolName : nil,
        toolInput: status.hasToolInput ? status.toolInput : nil,
        interrupted: status.hasInterrupted ? status.interrupted : nil,
        providerSession: status.hasProviderSession
            ? sessionProviderSessionWire(status.providerSession) : nil
    )
}

nonisolated private func sessionProviderSessionWire(
    _ session: Yiru_Runtime_V1_AgentProviderSession
) -> MobileSessionProviderSessionWire {
    MobileSessionProviderSessionWire(
        key: session.key == .conversationID ? "conversation_id" : "session_id",
        id: session.id,
        transcriptPath: session.hasTranscriptPath ? session.transcriptPath : nil
    )
}

nonisolated private func sessionTabTypeWire(
    _ type: Yiru_Runtime_V1_SessionTabsTabType
) -> MobileSessionTabTypeWire? {
    switch type {
    case .terminal: return .terminal
    case .markdown: return .markdown
    case .file: return .file
    case .browser: return .browser
    case .unspecified: return nil
    case .UNRECOGNIZED: return nil
    }
}

nonisolated private func sessionAgentStateWire(
    _ state: Yiru_Runtime_V1_AgentStatusState
) -> String {
    switch state {
    case .working: return "working"
    case .blocked: return "blocked"
    case .waiting: return "waiting"
    case .done: return "done"
    case .unspecified: return "working"
    case .UNRECOGNIZED: return "working"
    }
}

nonisolated private func sessionFileModeWire(
    _ mode: Yiru_Runtime_V1_SessionTabsFileMode
) -> String? {
    switch mode {
    case .edit: return "edit"
    case .diff: return "diff"
    case .unspecified: return nil
    case .UNRECOGNIZED: return nil
    }
}

nonisolated private func sessionFileDiffSourceWire(
    _ source: Yiru_Runtime_V1_SessionTabsFileDiffSource
) -> String? {
    switch source {
    case .staged: return "staged"
    case .unstaged: return "unstaged"
    case .unspecified: return nil
    case .UNRECOGNIZED: return nil
    }
}
