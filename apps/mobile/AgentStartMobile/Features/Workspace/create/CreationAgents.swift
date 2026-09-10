import Foundation

nonisolated let workspaceCreationAgentCatalog: [WorkspaceCreationAgent] = [
    .init(id: "claude", label: "Claude", launchCommand: "claude"),
    .init(id: "openclaude", label: "OpenClaude", launchCommand: "openclaude"),
    .init(id: "codex", label: "Codex", launchCommand: "codex"),
    .init(id: "grok", label: "Grok", launchCommand: "grok"),
    .init(id: "copilot", label: "GitHub Copilot", launchCommand: "copilot"),
    .init(id: "opencode", label: "OpenCode", launchCommand: "opencode"),
    .init(id: "mimo-code", label: "MiMo Code", launchCommand: "mimo"),
    .init(id: "ante", label: "Ante", launchCommand: "ante"),
    .init(id: "trae", label: "Trae", launchCommand: "traecli"),
    .init(id: "pi", label: "Pi", launchCommand: "pi"),
    .init(id: "omp", label: "OMP", launchCommand: "omp"),
    .init(id: "gemini", label: "Gemini", launchCommand: "gemini"),
    .init(id: "antigravity", label: "Antigravity", launchCommand: "agy"),
    .init(id: "aider", label: "Aider", launchCommand: "aider"),
    .init(id: "goose", label: "Goose", launchCommand: "goose"),
    .init(id: "amp", label: "Amp", launchCommand: "amp"),
    .init(id: "kilo", label: "Kilocode", launchCommand: "kilo"),
    .init(id: "kiro", label: "Kiro", launchCommand: "kiro-cli"),
    .init(id: "crush", label: "Charm", launchCommand: "crush"),
    .init(id: "aug", label: "Auggie", launchCommand: "auggie"),
    .init(id: "autohand", label: "Autohand Code", launchCommand: "autohand"),
    .init(id: "cline", label: "Cline", launchCommand: "cline"),
    .init(id: "codebuff", label: "Codebuff", launchCommand: "codebuff"),
    .init(id: "command-code", label: "Command Code", launchCommand: "command-code"),
    .init(id: "continue", label: "Continue", launchCommand: "continue"),
    .init(id: "cursor", label: "Cursor", launchCommand: "cursor-agent"),
    .init(id: "droid", label: "Droid", launchCommand: "droid"),
    .init(id: "kimi", label: "Kimi", launchCommand: "kimi"),
    .init(id: "mistral-vibe", label: "Mistral Vibe", launchCommand: "mistral-vibe"),
    .init(id: "qwen-code", label: "Qwen Code", launchCommand: "qwen"),
    .init(id: "rovo", label: "Rovo Dev", launchCommand: "rovo"),
    .init(id: "hermes", label: "Hermes", launchCommand: "hermes"),
    .init(id: "devin", label: "Devin", launchCommand: "devin"),
    .init(id: "openclaw", label: "OpenClaw", launchCommand: "openclaw"),
]

nonisolated func workspaceCreationAgents(
    detectedIDs: [String],
    disabledIDs: [String],
    overrides: [String: String]
) -> [WorkspaceCreationAgent] {
    let detected = Set(detectedIDs)
    let disabled = Set(disabledIDs)
    let available: [WorkspaceCreationAgent] = workspaceCreationAgentCatalog.compactMap { agent in
        guard detected.contains(agent.id), !disabled.contains(agent.id) else { return nil }
        return WorkspaceCreationAgent(
            id: agent.id,
            label: agent.label,
            launchCommand: overrides[agent.id] ?? agent.launchCommand
        )
    }
    return available + [
        WorkspaceCreationAgent(
            id: WorkspaceCreationAgent.blankID, label: "Blank Terminal", launchCommand: nil)
    ]
}

nonisolated func preferredWorkspaceCreationAgentID(
    available: [WorkspaceCreationAgent],
    preferredID: String?
) -> String {
    if preferredID == "blank" { return WorkspaceCreationAgent.blankID }
    if let preferredID, available.contains(where: { $0.id == preferredID }) {
        return preferredID
    }
    return available.first?.id ?? WorkspaceCreationAgent.blankID
}
