import Foundation

@MainActor
extension TerminalLiveModel {
    func stopAgent(baseline: TerminalAgentInterruptBaseline?) {
        stopGeneration += 1
        let generation = stopGeneration
        guard canAcceptUserInput else {
            showNotice("Stop not sent — terminal is reconnecting")
            return
        }
        Task { [weak self] in
            guard let self else { return }
            let first = await sendConfirmedInput(Data([0x1B]))
            guard stopGeneration == generation else { return }
            guard case .accepted = first else {
                showNotice("Stop not sent — terminal is reconnecting")
                return
            }
            try? await Task.sleep(for: .milliseconds(80))
            guard stopGeneration == generation else { return }
            _ = await sendConfirmedInput(Data([0x1B]))
            guard let baseline else { return }
            // Why: Codex can omit its final hook after Escape. Desktop waits for the hook
            // before safely inferring that the same unchanged turn was interrupted.
            try? await Task.sleep(for: .milliseconds(500))
            guard stopGeneration == generation else { return }
            _ = await runtime.inferAgentInterrupt(hostID: hostID, baseline: baseline)
        }
    }
    func connect(attempt: Int) async {
        let connectionID = UUID()
        guard await beginConnection(connectionID: connectionID, attempt: attempt) else { return }
        var retryCount = 0
        while activeConnectionID == connectionID, !Task.isCancelled {
            phase = retryCount == 0 ? .connecting : .reconnecting(attempt: retryCount)
            do {
                let opened = try await openSession(connectionID: connectionID)
                let didEnd = try await consume(opened)
                if case .active = phase {
                    retryCount = 0
                }
                await closeCurrentSession(connectionID: connectionID)
                if didEnd {
                    phase = .ended
                    break
                }
            } catch is CancellationError {
                break
            } catch {
                guard activeConnectionID == connectionID else { break }
                if case .active = phase {
                    retryCount = 0
                }
                await closeCurrentSession(connectionID: connectionID)
            }
            retryCount += 1
            phase = .reconnecting(attempt: retryCount)
            do {
                try await Task.sleep(for: TerminalReconnectPolicy.delay(attempt: retryCount))
            } catch {
                break
            }
        }
        await stopSession(connectionID: connectionID)
    }
    func retry() {
        connectionAttempt += 1
    }
    func setAppState(_ state: TerminalSessionAppState) async {
        appState = state
        await session?.setAppState(state)
    }
    func openSession(connectionID: UUID) async throws -> any TerminalSession {
        let opened = try await runtime.openTerminalSession(
            hostID: hostID,
            terminalID: terminalID,
            viewport: gridSize
        )
        try Task.checkCancellation()
        guard activeConnectionID == connectionID else {
            await opened.close()
            throw CancellationError()
        }
        session = opened
        await opened.setAppState(appState)
        phase = .restoring
        if let gridSize {
            enqueue(.resize(gridSize))
        }
        return opened
    }
    func consume(_ session: any TerminalSession) async throws -> Bool {
        let events = await session.events()
        for try await event in events {
            try Task.checkCancellation()
            switch event {
            case .subscribed:
                phase = .active
            case .displayMode(let mode):
                displayMode = mode
                if mode == .auto, let gridSize {
                    surface.synchronizeGrid(to: gridSize)
                }
            case .gridSizeChanged(let size):
                surface.synchronizeGrid(to: size)
            case .snapshot(let snapshot):
                phase = .restoring
                title = snapshot.metadata.lastTitle ?? title
                currentDirectory = snapshot.metadata.currentDirectory
                displayMode = snapshot.metadata.displayMode
                surface.restore(snapshot)
                if displayMode == .auto, let gridSize {
                    surface.synchronizeGrid(to: gridSize)
                }
                try await session.acknowledgeSnapshot(id: snapshot.id)
                phase = .active
            case .output(let output):
                surface.feed(output.bytes)
                try await session.acknowledgeOutput(
                    endSequence: output.endSequence,
                    receiverQueueBytes: 0
                )
            case .clearBuffer:
                surface.clear()
            case .ended:
                return true
            }
        }
        return false
    }
    func beginConnection(connectionID: UUID, attempt: Int) async -> Bool {
        cancelActionDrain()
        discardPendingActions(as: .rejected)
        let closingSession = session
        session = nil
        activeConnectionID = connectionID
        await closingSession?.close()
        return activeConnectionID == connectionID && attempt == connectionAttempt
    }
    func stopSession(connectionID: UUID) async {
        guard activeConnectionID == connectionID else { return }
        cancelActionDrain()
        discardPendingActions(as: .rejected)
        let closingSession = session
        session = nil
        activeConnectionID = nil
        await closingSession?.close()
    }
    func closeCurrentSession(connectionID: UUID) async {
        guard activeConnectionID == connectionID else { return }
        cancelActionDrain()
        discardPendingActions(as: .rejected)
        let closingSession = session
        session = nil
        await closingSession?.close()
    }
}
