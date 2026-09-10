import Foundation

@MainActor
extension TerminalLiveModel {
    func clearLinkRequest() {
        linkRequest = nil
    }
    func rename(_ value: String) async {
        let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        do {
            title = try await runtime.renameTerminal(
                hostID: hostID,
                terminalID: terminalID,
                title: value
            )
        } catch is CancellationError {
            return
        } catch {
            showNotice("Couldn't rename terminal")
        }
    }
    func clear() async {
        surface.clear()
        do {
            try await runtime.clearTerminal(hostID: hostID, terminalID: terminalID)
            showNotice("Terminal cleared")
        } catch is CancellationError {
            return
        } catch {
            showNotice("Couldn't clear terminal")
        }
    }
    func closeRemote() async -> Bool {
        do {
            try await runtime.closeTerminal(hostID: hostID, terminalID: terminalID)
            return true
        } catch is CancellationError {
            return false
        } catch {
            showNotice("Couldn't close terminal")
            return false
        }
    }
    func requestOpenLink(_ rawLink: String, parameters: [String: String]) {
        linkRequest = TerminalLinkRequest(rawValue: rawLink, parameters: parameters)
    }
    func toggleDisplayMode() async {
        guard !isDisplayModeUpdating else { return }
        let previous = displayMode
        let requested = previous.toggleTarget
        isDisplayModeUpdating = true
        displayMode = requested
        do {
            displayMode = try await displayModeRuntime.setTerminalDisplayMode(
                hostID: hostID,
                terminalID: terminalID,
                mode: requested,
                viewport: requested == .auto ? gridSize : nil
            )
            if displayMode == .auto, let gridSize {
                // Why: the mode RPC can resolve before its multiplex resize notification. Apply
                // the measured phone grid immediately, then reassert it on the stream so this
                // control never changes only its icon while leaving desktop geometry on screen.
                surface.synchronizeGrid(to: gridSize)
                enqueue(.resize(gridSize))
            }
        } catch {
            displayMode = previous
        }
        isDisplayModeUpdating = false
    }
    func showNotice(_ message: LocalizedStringResource) {
        let notice = TerminalActionNotice(message: message)
        actionNotice = notice
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(1_500))
            guard self?.actionNotice?.id == notice.id else { return }
            self?.actionNotice = nil
        }
    }
}
