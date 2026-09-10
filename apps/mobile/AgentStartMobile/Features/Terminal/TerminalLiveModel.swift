import Foundation
import Observation
import UIKit

nonisolated enum TerminalLivePhase: Sendable {
    case connecting
    case reconnecting(attempt: Int)
    case restoring
    case active
    case ended
    case failed(LocalizedStringResource)
}
nonisolated enum TerminalSurfaceAction: Sendable {
    case input(Data)
    case confirmedInput(Data, CheckedContinuation<TerminalInputDeliveryOutcome, Never>)
    case queryReply(Data)
    case resize(TerminalGridSize)
}
nonisolated struct TerminalActionNotice: Identifiable, Sendable {
    let id = UUID()
    let message: LocalizedStringResource
}
nonisolated struct TerminalLinkRequest: Equatable, Sendable {
    let rawValue: String
    let parameters: [String: String]
}
@Observable
@MainActor
final class TerminalLiveModel {
    let surface: any TerminalSurface
    var phase: TerminalLivePhase = .connecting {
        didSet {
            surface.setInputEnabled(canAcceptUserInput)
        }
    }
    var title: String
    var currentDirectory: String?
    var gridSize: TerminalGridSize?
    var linkRequest: TerminalLinkRequest?
    var bellRevision = 0
    var connectionAttempt = 0
    var displayMode = TerminalDisplayMode.auto
    var isDisplayModeUpdating = false
    var actionNotice: TerminalActionNotice?
    @ObservationIgnored
    let hostID: String
    @ObservationIgnored
    let terminalID: String
    @ObservationIgnored
    let isWritable: Bool
    @ObservationIgnored
    let runtime: any TerminalSessionRuntime
    @ObservationIgnored
    let displayModeRuntime: any TerminalDisplayModeRuntime
    @ObservationIgnored
    var session: (any TerminalSession)?
    @ObservationIgnored
    var activeConnectionID: UUID?
    @ObservationIgnored
    var pendingActions: [TerminalSurfaceAction] = []
    @ObservationIgnored
    var actionDrain: Task<Void, Never>?
    @ObservationIgnored
    var actionDrainID: UUID?
    @ObservationIgnored
    var appState = TerminalSessionAppState.foreground
    @ObservationIgnored
    var stopGeneration = 0
    init(
        host: HostProfile,
        terminal: TerminalTarget,
        runtime: any TerminalSessionRuntime,
        displayModeRuntime: any TerminalDisplayModeRuntime,
        surfaceFactory: any TerminalSurfaceFactory,
        surfaceConfiguration: TerminalSurfaceConfiguration
    ) {
        hostID = host.id
        terminalID = terminal.id
        isWritable = terminal.isWritable
        self.runtime = runtime
        self.displayModeRuntime = displayModeRuntime
        title = terminal.title
        let surface = surfaceFactory.makeSurface(configuration: surfaceConfiguration)
        self.surface = surface
        surface.events = TerminalSurfaceEvents(
            onInput: { [weak self] bytes in
                guard self?.canAcceptUserInput == true else { return }
                self?.enqueue(.input(bytes))
            },
            onQueryReply: { [weak self] bytes in
                self?.enqueue(.queryReply(bytes))
            },
            onResize: { [weak self] size in
                self?.gridSize = size
                self?.enqueue(.resize(size))
            },
            onTitleChange: { [weak self] title in
                guard !title.isEmpty else { return }
                self?.title = title
            },
            onDirectoryChange: { [weak self] directory in
                self?.currentDirectory = directory
            },
            onOpenLink: { [weak self] link, parameters in
                self?.requestOpenLink(link, parameters: parameters)
            },
            onClipboardWriteRequest: { data in
                guard let text = String(data: data, encoding: .utf8) else { return }
                UIPasteboard.general.string = text
            },
            onBell: { [weak self] in
                self?.bellRevision += 1
            }
        )
        surface.setInputEnabled(false)
    }
    var canAcceptUserInput: Bool {
        guard isWritable, case .active = phase else { return false }
        return true
    }
    var hasSubscribed: Bool {
        if case .active = phase { return true }
        return false
    }
    var identifier: String { terminalID }
    @discardableResult
    func sendChatMessage(_ text: String, enter: Bool = true) -> Bool {
        guard canAcceptUserInput else { return false }
        var bytes = Data(text.utf8)
        if enter { bytes.append(0x0D) }
        enqueue(.input(bytes))
        return true
    }
    func sendChatMessageConfirmed(_ text: String, enter: Bool = true) async
        -> TerminalInputDeliveryOutcome
    {
        guard canAcceptUserInput else { return .rejected }
        if !text.isEmpty {
            let textOutcome = await sendConfirmedInput(Data(text.utf8))
            guard case .accepted = textOutcome else { return textOutcome }
        }
        guard enter else { return .accepted }
        // Why: agent TUIs can classify a same-frame text+CR write as paste input and leave it
        // unsubmitted. Match Desktop's terminal.send suffix separation before confirming Enter.
        try? await Task.sleep(for: .milliseconds(500))
        guard !Task.isCancelled, canAcceptUserInput else { return .rejected }
        return await sendConfirmedInput(Data([0x0D]))
    }
    func sendConfirmedInput(_ bytes: Data) async -> TerminalInputDeliveryOutcome {
        guard !bytes.isEmpty else { return .accepted }
        return await withCheckedContinuation { continuation in
            enqueue(.confirmedInput(bytes, continuation))
        }
    }
}
