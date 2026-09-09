import Foundation
import YiruProtocol

private nonisolated enum TerminalQuickCommandConstants {
    static let displayPreviewLength = 240
}

nonisolated enum TerminalQuickCommandScope: Hashable, Sendable {
    case global
    case repository(String)

    var repoID: String? {
        guard case .repository(let id) = self else { return nil }
        return id
    }
}

nonisolated enum TerminalQuickCommandAction: Hashable, Sendable {
    case terminal(command: String, appendEnter: Bool)
    case agent(agentID: String, prompt: String)
}

nonisolated struct TerminalQuickCommand: Hashable, Identifiable, Sendable {
    let id: String
    let label: String
    let scope: TerminalQuickCommandScope
    let action: TerminalQuickCommandAction

    init?(proto: Yiru_Runtime_V1_SettingsQuickCommand) {
        let id = proto.id.trimmingCharacters(in: .whitespacesAndNewlines)
        let label = proto.label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty, id.count <= 80, label.count <= 80 else { return nil }
        let scope: TerminalQuickCommandScope
        if case .repoID(let repoID) = proto.scope.scope,
            !repoID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        {
            scope = .repository(String(repoID.prefix(200)))
        } else {
            scope = .global
        }
        let action: TerminalQuickCommandAction
        switch proto.kind {
        case .agentPrompt(let prompt):
            let agent = prompt.agent
            guard supportsQuickCommandAgent(agent),
                !prompt.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            else { return nil }
            action = .agent(
                agentID: agent,
                prompt: trimTrailingWhitespace(String(prompt.prompt.prefix(6_000))))
        case .terminalCommand(let command):
            action = .terminal(
                command: trimTrailingWhitespace(String(command.command.prefix(4_000))),
                appendEnter: command.appendEnter
            )
        case nil:
            return nil
        }
        self.id = id
        self.label = label
        self.scope = scope
        self.action = action
    }

    init(
        id: String,
        label: String,
        scope: TerminalQuickCommandScope,
        action: TerminalQuickCommandAction
    ) {
        self.id = id
        self.label = label
        self.scope = scope
        self.action = action
    }

    var preview: String {
        switch action {
        case .terminal(let command, _): command
        case .agent(let agentID, let prompt): "\(quickCommandAgentLabel(agentID)): \(prompt)"
        }
    }

    var displayPreview: String {
        guard preview.count > TerminalQuickCommandConstants.displayPreviewLength else {
            return preview
        }
        return String(preview.prefix(TerminalQuickCommandConstants.displayPreviewLength - 1)) + "…"
    }

    var agentID: String? {
        guard case .agent(let agentID, _) = action else { return nil }
        return agentID
    }

    func isVisible(repoID: String?) -> Bool {
        switch scope {
        case .global: true
        case .repository(let commandRepoID): commandRepoID == repoID
        }
    }

    var upsert: Yiru_Runtime_V1_SettingsQuickCommandUpsert {
        var scope = Yiru_Runtime_V1_SettingsQuickCommandScope()
        switch self.scope {
        case .global:
            scope.global = true
        case .repository(let repoID):
            scope.repoID = repoID
        }
        var command = Yiru_Runtime_V1_SettingsQuickCommand()
        command.id = id
        command.label = label
        command.scope = scope
        switch action {
        case .terminal(let commandText, let appendEnter):
            var payload = Yiru_Runtime_V1_SettingsTerminalCommand()
            payload.command = commandText
            payload.appendEnter = appendEnter
            command.kind = .terminalCommand(payload)
        case .agent(let agentID, let prompt):
            var payload = Yiru_Runtime_V1_SettingsAgentPrompt()
            payload.agent = agentID
            payload.prompt = prompt
            command.kind = .agentPrompt(payload)
        }
        return Yiru_Runtime_V1_SettingsQuickCommandUpsert.with {
            $0.command = command
        }
    }
}

nonisolated let terminalQuickCommandAgents = [
    "claude", "openclaude", "codex", "opencode", "mimo-code", "pi", "omp", "gemini",
    "antigravity", "command-code", "cursor", "droid", "hermes", "copilot", "grok",
]

nonisolated func supportsQuickCommandAgent(_ id: String) -> Bool {
    terminalQuickCommandAgents.contains(id)
}

nonisolated func quickCommandAgentLabel(_ id: String) -> String {
    switch id {
    case "claude": "Claude"
    case "openclaude": "OpenClaude"
    case "codex": "Codex"
    case "opencode": "OpenCode"
    case "mimo-code": "MiMo Code"
    case "pi": "Pi"
    case "omp": "OMP"
    case "gemini": "Gemini"
    case "antigravity": "Antigravity"
    case "command-code": "Command Code"
    case "cursor": "Cursor"
    case "droid": "Droid"
    case "hermes": "Hermes"
    case "copilot": "GitHub Copilot"
    case "grok": "Grok"
    default: id
    }
}

nonisolated func flattenedQuickCommand(_ command: String) -> String {
    command.components(separatedBy: .newlines)
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
        .joined(separator: "; ")
}

nonisolated func trimTrailingWhitespace(_ value: String) -> String {
    String(value.reversed().drop(while: { $0.isWhitespace }).reversed())
}
