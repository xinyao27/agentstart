import SwiftUI

struct TerminalQuickCommandEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State private var label: String
    @State private var action: TerminalQuickCommandEditorAction
    @State private var terminalCommand: String
    @State private var appendEnter: Bool
    @State private var agentID: String
    @State private var prompt: String
    @State private var isProjectScoped: Bool
    @State private var isAdvancedOpen: Bool
    @State private var isSaving = false
    private let commandID: String?
    private let repoID: String?
    private let repoName: String?
    private let save: (TerminalQuickCommand) async -> Bool

    init(
        command: TerminalQuickCommand?,
        repoID: String?,
        repoName: String?,
        save: @escaping (TerminalQuickCommand) async -> Bool
    ) {
        commandID = command?.id
        self.repoID = repoID
        self.repoName = repoName
        self.save = save
        _label = State(initialValue: command?.label ?? "")
        switch command?.action {
        case .terminal(let value, let enter):
            _action = State(initialValue: .terminal)
            _terminalCommand = State(initialValue: value)
            _appendEnter = State(initialValue: enter)
            _agentID = State(initialValue: terminalQuickCommandAgents.first ?? "claude")
            _prompt = State(initialValue: "")
        case .agent(let agent, let value):
            _action = State(initialValue: .agent)
            _terminalCommand = State(initialValue: "")
            _appendEnter = State(initialValue: true)
            _agentID = State(initialValue: agent)
            _prompt = State(initialValue: value)
        case nil:
            _action = State(initialValue: .terminal)
            _terminalCommand = State(initialValue: "")
            _appendEnter = State(initialValue: true)
            _agentID = State(initialValue: terminalQuickCommandAgents.first ?? "claude")
            _prompt = State(initialValue: "")
        }
        // Why: editing a global command inside a project must preserve its global scope.
        let projectScoped = command.map { $0.scope.repoID != nil } ?? (repoID != nil)
        _isProjectScoped = State(initialValue: projectScoped)
        _isAdvancedOpen = State(initialValue: projectScoped)
    }

    var body: some View {
        NavigationStack {
            Form {
                Text("Save terminal commands or agent prompts for quick access.")
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)

                Section("Label") {
                    TextField("Start dev server", text: $label)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: label) { _, value in
                            if value.count > 80 { label = String(value.prefix(80)) }
                        }
                }
                Section("Action") {
                    Picker("Action", selection: $action) {
                        Text("Terminal Command").tag(TerminalQuickCommandEditorAction.terminal)
                        Text("Agent Prompt").tag(TerminalQuickCommandEditorAction.agent)
                    }
                    .pickerStyle(.segmented)
                }
                if action == .terminal {
                    Section {
                        TerminalRawTextEditor(
                            text: $terminalCommand,
                            font: .monospacedSystemFont(
                                ofSize: Theme.Typography.code,
                                weight: .regular
                            )
                        )
                        .frame(minHeight: 96)
                        .onChange(of: terminalCommand) { _, value in
                            if value.count > 4_000 {
                                terminalCommand = String(value.prefix(4_000))
                            }
                        }
                    } header: {
                        Text("Command Text")
                    } footer: {
                        if isAdvancedOpen {
                            Text("Submit immediately instead of only inserting text.")
                        }
                    }
                } else {
                    Section("Agent") {
                        Picker("Agent", selection: $agentID) {
                            ForEach(terminalQuickCommandAgents, id: \.self) { id in
                                Label {
                                    Text(verbatim: quickCommandAgentLabel(id))
                                } icon: {
                                    AgentMark(agentID: id, size: 16)
                                }
                                .tag(id)
                            }
                        }
                    }
                    Section {
                        TerminalRawTextEditor(
                            text: $prompt,
                            font: .systemFont(ofSize: Theme.Typography.primary)
                        )
                        .frame(minHeight: 120)
                        .onChange(of: prompt) { _, value in
                            if value.count > 6_000 { prompt = String(value.prefix(6_000)) }
                        }
                    } header: {
                        Text("Prompt")
                    } footer: {
                        Text("Supports skills, file paths, and built-in commands.")
                    }
                }
                Section {
                    Button {
                        withAnimation(.snappy) { isAdvancedOpen.toggle() }
                    } label: {
                        HStack(spacing: 8) {
                            AgentStartIcon(
                                isAdvancedOpen ? .chevronDown : .chevronRight,
                                size: Theme.Control.inlineIcon
                            )
                            Text("Advanced")
                                .font(
                                    .system(
                                        size: Theme.Typography.metadata,
                                        weight: .regular
                                    )
                                )
                            Spacer(minLength: 0)
                        }
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.appPlain)

                    if isAdvancedOpen {
                        if action == .terminal {
                            Toggle("Append Enter", isOn: $appendEnter)
                        }
                        Picker("Scope", selection: $isProjectScoped) {
                            Text("Global").tag(false)
                            Text("Project").tag(true)
                        }
                        .pickerStyle(.segmented)
                        .disabled(repoID == nil)
                        if isProjectScoped, let repoName {
                            Text(verbatim: repoName)
                                .font(
                                    .system(
                                        size: Theme.Typography.code,
                                        design: .monospaced
                                    )
                                )
                                .foregroundStyle(Theme.Colors.mutedForeground)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.Colors.background)
            .navigationTitle(Text(commandID == nil ? "Add Quick Command" : "Edit Quick Command"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: dismiss.callAsFunction)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveCommand() }
                        .disabled(!isValid || isSaving)
                }
            }
        }
        .appSheetPresentation(.page)
        .interactiveDismissDisabled(isSaving)
    }

    private var isValid: Bool {
        !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (action == .terminal
                ? !terminalCommand.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                : supportsQuickCommandAgent(agentID)
                    && !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func saveCommand() {
        guard isValid, !isSaving else { return }
        isSaving = true
        let scope: TerminalQuickCommandScope =
            isProjectScoped && repoID != nil
            ? .repository(repoID ?? "") : .global
        let built = TerminalQuickCommand(
            id: commandID ?? "quick-command-\(UUID().uuidString.lowercased())",
            label: String(label.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)),
            scope: scope,
            action: action == .terminal
                ? .terminal(
                    command: trimTrailingWhitespace(String(terminalCommand.prefix(4_000))),
                    appendEnter: appendEnter
                )
                : .agent(
                    agentID: agentID,
                    prompt: trimTrailingWhitespace(String(prompt.prefix(6_000)))
                )
        )
        Task {
            let didSave = await save(built)
            isSaving = false
            if didSave { dismiss() }
        }
    }
}

nonisolated private enum TerminalQuickCommandEditorAction: String, Sendable {
    case terminal
    case agent
}
