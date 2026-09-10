import SwiftUI

struct WorkspaceNewTabChooser: View {
    @State private var optionsModel: WorkspaceNewTabOptionsModel
    let createAgent: (String) -> Void
    let createTerminal: () -> Void
    let createMarkdown: () -> Void
    let createBrowser: (String) -> Void
    let browserSupported: Bool
    let browserUnavailable: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var isEnteringBrowser = false
    @State private var browserURL = ""
    @State private var browserValidationMessage: LocalizedStringResource?

    init(
        hostID: String,
        repoID: String?,
        repository: any WorkspaceCreationRepository,
        createAgent: @escaping (String) -> Void,
        createTerminal: @escaping () -> Void,
        createMarkdown: @escaping () -> Void,
        createBrowser: @escaping (String) -> Void,
        browserSupported: Bool,
        browserUnavailable: @escaping () -> Void
    ) {
        _optionsModel = State(
            initialValue: WorkspaceNewTabOptionsModel(
                hostID: hostID,
                repoID: repoID,
                repository: repository
            )
        )
        self.createAgent = createAgent
        self.createTerminal = createTerminal
        self.createMarkdown = createMarkdown
        self.createBrowser = createBrowser
        self.browserSupported = browserSupported
        self.browserUnavailable = browserUnavailable
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            if isEnteringBrowser {
                browserForm
            } else {
                options
            }
        }
        .background(Theme.Colors.background)
        .appSheetPresentation(.page)
        .task { await optionsModel.load() }
    }

    private var header: some View {
        HStack(spacing: Theme.Spacing.standard) {
            GlassHeaderButton(
                iconName: isEnteringBrowser ? .arrowLeft : .x,
                accessibilityLabel: isEnteringBrowser ? "Back" : "Close sheet"
            ) {
                if isEnteringBrowser {
                    isEnteringBrowser = false
                } else {
                    dismiss()
                }
            }

            Text(isEnteringBrowser ? "New Browser" : "New Tab")
                .font(.system(size: Theme.Typography.emphasis, weight: .semibold))
                .foregroundStyle(Theme.Colors.foreground)
                .lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.standard)
        .padding(.top, Theme.Spacing.standard)
        .padding(.bottom, Theme.Spacing.huge)
    }

    private var options: some View {
        ScrollView {
            ContentSurface {
                VStack(spacing: 0) {
                    agentOptions
                    newTabOption(
                        title: Text("Terminal"),
                        icon: .terminalWindow
                    ) {
                        dismiss()
                        createTerminal()
                    }
                    newTabSeparator
                    newTabOption(title: Text("Browser"), icon: .globe) {
                        if browserSupported {
                            isEnteringBrowser = true
                        } else {
                            dismiss()
                            browserUnavailable()
                        }
                    }
                    newTabSeparator
                    newTabOption(
                        title: Text("Markdown Note"),
                        icon: .fileText
                    ) {
                        dismiss()
                        createMarkdown()
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.standard)
            .padding(.bottom, Theme.Spacing.standard)
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollIndicators(.hidden)
    }

    @ViewBuilder
    private var agentOptions: some View {
        switch optionsModel.phase {
        case .idle, .loading:
            unavailableAgentRow(title: Text("Detecting Agents"), isLoading: true)
            newTabSeparator
        case .ready(let agents):
            if agents.isEmpty {
                unavailableAgentRow(title: Text("No Enabled Agents"), isLoading: false)
                newTabSeparator
            } else {
                ForEach(agents) { agent in
                    newTabAgentOption(
                        title: Text(verbatim: agent.label),
                        agentID: agent.id
                    ) {
                        dismiss()
                        createAgent(agent.id)
                    }
                    newTabSeparator
                }
            }
        case .failed:
            unavailableAgentRow(title: Text("Agent Presets Unavailable"), isLoading: false)
            newTabSeparator
        }
    }

    private var browserForm: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Enter a URL, or leave blank for a new tab.")
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .padding(.bottom, Theme.Spacing.small)

            ZStack(alignment: .leading) {
                if browserURL.isEmpty {
                    Text("https://example.com")
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .allowsHitTesting(false)
                }
                TextField("", text: $browserURL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .onSubmit(completeBrowser)
                    .onChange(of: browserURL) { _, _ in
                        browserValidationMessage = nil
                    }
                    .accessibilityLabel("Browser URL")
                    .accessibilityHint("Enter a URL, or leave blank for a new tab.")
            }
            .padding(.horizontal, Theme.Spacing.standard)
            .frame(minHeight: Theme.Size.minimumHitTarget)
            .glassEffect(.regular.interactive(), in: .capsule)

            if let browserValidationMessage {
                Text(browserValidationMessage)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.attention)
                    .padding(.top, Theme.Spacing.small)
            }

            HStack(spacing: Theme.Spacing.small) {
                Spacer()
                Button("Cancel") { isEnteringBrowser = false }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
                Button("Open", action: completeBrowser)
                    .appProminentGlassButton()
                    .appButtonContext(.regular)
            }
            .padding(.top, Theme.Spacing.medium)
            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.standard)
        .padding(.bottom, Theme.Spacing.standard)
    }

    private func completeBrowser() {
        guard let url = workspaceBrowserURL(browserURL) else {
            // Why: keep the input sheet open so an invalid URL can be corrected in place,
            // rather than silently dropping an attempted Browser creation.
            browserValidationMessage = "Enter a valid URL."
            return
        }
        browserValidationMessage = nil
        dismiss()
        createBrowser(url)
    }

    private func unavailableAgentRow(title: Text, isLoading: Bool) -> some View {
        HStack(spacing: Theme.Spacing.small) {
            AgentStartIcon(.robot, size: 16)
                .foregroundStyle(Theme.Colors.mutedForeground)
            title
                .font(.system(size: Theme.Typography.supporting, weight: .regular))
                .foregroundStyle(Theme.Colors.mutedForeground)
            Spacer()
            if isLoading {
                AgentStartLoader(size: Theme.Control.inlineIcon)
            }
        }
        .padding(.vertical, Theme.Spacing.medium)
        .opacity(0.6)
    }

    private func newTabOption(title: Text, icon: AgentStartIconID, action: @escaping () -> Void)
        -> some View
    {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.small) {
                AgentStartIcon(icon, size: 16)
                title
                    .font(.system(size: Theme.Typography.supporting, weight: .regular))
                    .foregroundStyle(Theme.Colors.foreground)
                Spacer()
            }
            .padding(.vertical, Theme.Spacing.medium)
            .contentShape(Rectangle())
        }
        .buttonStyle(.appPlain)
    }

    private var newTabSeparator: some View {
        Rectangle()
            .fill(Theme.Colors.divider)
            .frame(height: Theme.Size.hairline)
    }

    private func newTabAgentOption(
        title: Text,
        agentID: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.small) {
                AgentMark(agentID: agentID, size: 16)
                title
                    .font(.system(size: Theme.Typography.supporting, weight: .regular))
                    .foregroundStyle(Theme.Colors.foreground)
                Spacer()
            }
            .padding(.vertical, Theme.Spacing.medium)
            .contentShape(Rectangle())
        }
        .buttonStyle(.appPlain)
    }
}
