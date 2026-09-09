import Foundation
import SwiftProtobuf
import YiruProtocol

extension RuntimeClient: TerminalQuickCommandRepository {
    func supportsQuickCommands(for hostID: String) async throws -> Bool {
        let status = try await protocolStatus(
            hostID: hostID
        )
        return status.capabilities?.contains(MobileQuickCommandsWireContract.capability) == true
    }

    func quickCommands(for hostID: String) async throws -> [TerminalQuickCommand] {
        guard try await supportsQuickCommands(for: hostID) else {
            throw TerminalQuickCommandRepositoryError.unsupported
        }
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1SettingsServiceMethods.getTerminalQuickCommands,
            request: Yiru_Runtime_V1_SettingsServiceGetTerminalQuickCommandsRequest(),
            response: Yiru_Runtime_V1_SettingsServiceTerminalQuickCommandsResponse.self
        )
        guard response.terminalQuickCommands.count <= 40 else {
            throw TerminalQuickCommandRepositoryError.invalidResponse
        }
        let commands = response.terminalQuickCommands.compactMap(TerminalQuickCommand.init(proto:))
        guard commands.count == response.terminalQuickCommands.count,
            Set(commands.map(\.id)).count == commands.count
        else { throw TerminalQuickCommandRepositoryError.invalidResponse }
        return commands
    }

    func mutateQuickCommands(
        for hostID: String,
        mutation: TerminalQuickCommandMutation
    ) async throws -> [TerminalQuickCommand] {
        var mutationProto = Yiru_Runtime_V1_SettingsQuickCommandMutation()
        switch mutation {
        case .upsert(let command):
            mutationProto.upsert = command.upsert
        case .delete(let id):
            mutationProto.delete = Yiru_Runtime_V1_SettingsQuickCommandDelete.with {
                $0.id = id
            }
        }
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1SettingsServiceMethods.updateTerminalQuickCommands,
            request: Yiru_Runtime_V1_SettingsServiceUpdateTerminalQuickCommandsRequest.with {
                $0.mutation = mutationProto
            },
            response: Yiru_Runtime_V1_SettingsServiceTerminalQuickCommandsResponse.self
        )
        guard response.terminalQuickCommands.count <= 40 else {
            throw TerminalQuickCommandRepositoryError.invalidResponse
        }
        let commands = response.terminalQuickCommands.compactMap(TerminalQuickCommand.init(proto:))
        guard commands.count == response.terminalQuickCommands.count else {
            throw TerminalQuickCommandRepositoryError.invalidResponse
        }
        return commands
    }

    func launchQuickCommand(
        for hostID: String,
        worktreeID: String,
        afterTabID: String?,
        command: TerminalQuickCommand
    ) async throws -> TerminalWorkspaceSnapshot {
        let current = try await workspaceTabs(for: hostID, worktreeID: worktreeID)
        let agent: String?
        let startupCommand: String?
        let delivery: String?
        let agentPrompt: String?
        switch command.action {
        case .terminal(let value, let appendEnter):
            agent = nil
            startupCommand = appendEnter ? flattenedQuickCommand(value) : nil
            delivery = appendEnter ? "shell-ready" : nil
            agentPrompt = nil
        case .agent(let agentID, let prompt):
            agent = agentID
            startupCommand = nil
            delivery = nil
            agentPrompt = prompt
        }
        let created: MobileSessionCreateTerminalResultWire = try await sessionTabsCreateTerminal(
            hostID: hostID,
            request: MobileSessionCreateTerminalRequestWire(
                worktree: "id:\(worktreeID)",
                afterTabId: afterTabID,
                activate: true,
                clientMutationId: "quick-command:\(UUID().uuidString.lowercased())",
                agent: agent,
                command: startupCommand,
                env: nil,
                envToDelete: nil,
                launchConfig: nil,
                launchAgent: nil,
                startupCommandDelivery: delivery,
                agentPrompt: agentPrompt
            )
        )
        guard let terminal = created.tab.terminal else {
            throw TerminalQuickCommandRepositoryError.rejectedLaunch
        }
        if case .terminal(let value, false) = command.action {
            let sent = try await protocolTerminalSend(
                hostID: hostID,
                terminal: terminal,
                text: value,
                enter: false
            )
            guard sent.send.accepted, sent.send.handle == terminal else {
                throw TerminalQuickCommandRepositoryError.rejectedLaunch
            }
        }
        // Why: the create response is authoritative for the new tab, while an immediate list
        // response can still be one publication behind the Desktop runtime. Merge the created
        // tab into the last known snapshot so the command opens visibly and remains selected.
        return workspaceSnapshotAfterCreatingTerminal(
            current: current,
            created: created,
            worktreeID: worktreeID,
            afterTabID: afterTabID
        )
    }
}
