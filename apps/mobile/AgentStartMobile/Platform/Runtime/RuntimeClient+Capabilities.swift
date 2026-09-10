import AgentStartProtocol
import Foundation
import SwiftProtobuf

extension RuntimeClient: TerminalHostCapabilityRepository {
    func terminalCapabilities(for hostID: String) async -> TerminalHostCapabilities {
        guard
            let status: MobileRuntimeStatusWire =
                try? await protocolStatus(
                    hostID: hostID
                )
        else {
            return TerminalHostCapabilities(
                browserScreencastSupported: false,
                agentHistorySupported: false,
                quickCommandsSupported: false
            )
        }
        let capabilities = Set(status.capabilities ?? [])
        return TerminalHostCapabilities(
            browserScreencastSupported: capabilities.contains("browser.screencast.v1"),
            agentHistorySupported: capabilities.contains(agentHistoryRuntimeCapability),
            quickCommandsSupported: capabilities.contains(
                MobileQuickCommandsWireContract.capability
            )
        )
    }
}

extension RuntimeClient: TerminalDisplayModeRuntime {
    func setTerminalDisplayMode(
        hostID: String,
        terminalID: String,
        mode: TerminalDisplayMode,
        viewport: TerminalGridSize?
    ) async throws -> TerminalDisplayMode {
        var request = AgentStart_Runtime_V1_TerminalServiceSetDisplayModeRequest()
        request.terminal = terminalID
        request.mode = mode == .auto ? .auto : .desktop
        request.client = .with {
            $0.id = terminalClientInstanceID
            $0.kind = .mobile
        }
        if let viewport {
            request.viewport = .with {
                $0.cols = UInt32(viewport.columns)
                $0.rows = UInt32(viewport.rows)
            }
        }
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1TerminalServiceMethods.setDisplayMode,
            request: request,
            response: AgentStart_Runtime_V1_TerminalServiceSetDisplayModeResponse.self
        )
        switch response.mode {
        case .auto: return .auto
        case .desktop: return .desktop
        case .unspecified, .UNRECOGNIZED: throw TerminalWorkspaceRepositoryError.rejectedMutation
        }
    }
}

extension RuntimeClient {
    func inferAgentInterrupt(
        hostID: String,
        baseline: TerminalAgentInterruptBaseline
    ) async -> Bool {
        do {
            return try await protocolInferAgentInterrupt(hostID: hostID, baseline: baseline)
        } catch {
            return false
        }
    }

    func renameTerminal(hostID: String, terminalID: String, title: String) async throws -> String {
        var request = AgentStart_Runtime_V1_TerminalServiceRenameRequest()
        request.terminal = terminalID
        request.title = title
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1TerminalServiceMethods.rename,
            request: request,
            response: AgentStart_Runtime_V1_TerminalServiceRenameResponse.self
        )
        guard response.handle == terminalID else {
            throw TerminalWorkspaceRepositoryError.rejectedMutation
        }
        return response.hasTitle ? response.title : String(localized: "Terminal")
    }

    func clearTerminal(hostID: String, terminalID: String) async throws {
        var request = AgentStart_Runtime_V1_TerminalServiceClearBufferRequest()
        request.terminal = terminalID
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1TerminalServiceMethods.clearBuffer,
            request: request,
            response: AgentStart_Runtime_V1_TerminalServiceClearBufferResponse.self
        )
        guard response.handle == terminalID, response.cleared else {
            throw TerminalWorkspaceRepositoryError.rejectedMutation
        }
    }

    func closeTerminal(hostID: String, terminalID: String) async throws {
        let result = try await protocolTerminalClose(
            hostID: hostID,
            terminal: terminalID
        )
        guard result.hasClose, result.close.handle == terminalID else {
            throw TerminalWorkspaceRepositoryError.rejectedMutation
        }
    }
}
