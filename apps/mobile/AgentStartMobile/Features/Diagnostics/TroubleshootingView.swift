import SwiftUI

struct TroubleshootingView: View {
    @State private var model: TroubleshootingModel
    @State private var expandedIssueID: String?
    let showConnectionLog: () -> Void

    init(repository: any HostRepository, showConnectionLog: @escaping () -> Void) {
        _model = State(initialValue: TroubleshootingModel(repository: repository))
        self.showConnectionLog = showConnectionLog
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                // Why: these two actions stay quiet centered rows. Wrapping them in a glass
                // group turns a troubleshooting hint into two oversized pills competing with
                // the content they are meant to support.
                VStack(spacing: Theme.Spacing.small) {
                    Button {
                        model.start()
                    } label: {
                        HStack(spacing: 8) {
                            if model.isRunning {
                                AgentStartLoader(size: Theme.Control.regularIcon)
                            } else {
                                AgentStartIcon(.pulse, size: 18)
                            }
                            Text(runTitle)
                        }
                        .font(.system(size: Theme.Typography.supporting))
                        .frame(maxWidth: .infinity, alignment: .center)
                        .frame(minHeight: Theme.Size.minimumHitTarget)
                    }
                    .buttonStyle(.appPlain)
                    .disabled(model.isRunning)

                    Button(action: showConnectionLog) {
                        Label("View connection log", iconID: .scroll)
                            .font(.system(size: Theme.Typography.supporting))
                            .frame(maxWidth: .infinity, alignment: .center)
                            .frame(minHeight: Theme.Size.minimumHitTarget)
                    }
                    .buttonStyle(.appPlain)
                }
                .padding(.bottom, Theme.Spacing.standard)

                if !model.results.isEmpty {
                    SettingsSection {
                        ForEach(Array(model.results.enumerated()), id: \.element.id) {
                            index, result in
                            if index > 0 { SettingsDivider() }
                            diagnosticRow(result)
                        }
                    }
                    .padding(.bottom, Theme.Spacing.standard)
                }

                Text("COMMON ISSUES")
                    .font(.system(size: Theme.Typography.metadata, weight: .semibold))
                    .tracking(0.4)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .padding(.horizontal, Theme.Spacing.extraSmall)
                    .padding(.top, Theme.Spacing.small)
                    .padding(.bottom, Theme.Spacing.small)

                SettingsSection {
                    ForEach(Array(troubleshootingIssues.enumerated()), id: \.element.id) {
                        index, issue in
                        if index > 0 { SettingsDivider() }
                        issueRow(issue)
                    }
                }
                // Why: SwiftUI's font line box runs about 6pt shorter than the label-to-card
                // baseline this section is designed around. Restore it here rather than
                // changing the row rhythm inside the card.
                .padding(.top, Theme.Spacing.extraSmall)
            }
            // Why: state these gaps explicitly rather than relying on stack defaults —
            // SwiftUI's LazyVStack collapses spacing by different rules and shifts the final
            // card when it is left implicit.
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.top, Theme.Spacing.standard)
            .padding(.bottom, Theme.Spacing.extraLarge)
        }
        .background(Theme.Colors.background)
        .navigationTitle(Text("Troubleshooting"))
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { model.cancelActiveRun() }
    }

    private var runTitle: LocalizedStringKey {
        if model.isRunning {
            "Running…"
        } else if model.hasRun {
            "Run again"
        } else {
            "Run diagnostics"
        }
    }

    private func diagnosticRow(_ result: DiagnosticResult) -> some View {
        HStack(spacing: Theme.Spacing.small) {
            AgentStartIcon(statusGlyph(result.status), size: 14)
                .foregroundStyle(statusColor(result.status))
                .frame(width: Theme.Control.largeIcon)
            Text(result.label)
                .font(.system(size: Theme.Typography.supporting, weight: .regular))
            Spacer(minLength: Theme.Spacing.small)
            Text(result.detail)
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(
                    result.status == .fail ? Theme.Colors.attention : Theme.Colors.mutedForeground
                )
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, Theme.Spacing.medium)
        .frame(minHeight: Theme.Size.minimumHitTarget)
    }

    private func issueRow(_ issue: TroubleshootingIssue) -> some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(Theme.Motion.stateChange) {
                    expandedIssueID = expandedIssueID == issue.id ? nil : issue.id
                }
            } label: {
                HStack(spacing: Theme.Spacing.small) {
                    AgentStartIcon(issue.glyph, size: 16)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(width: Theme.Control.largeIcon)
                    Text(issue.title)
                        .font(
                            .system(
                                size: Theme.Typography.supporting,
                                weight: .regular
                            )
                        )
                        .foregroundStyle(Theme.Colors.foreground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    AgentStartIcon(
                        expandedIssueID == issue.id ? .chevronUp : .chevronDown, size: 16
                    )
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(width: Theme.Control.largeIcon)
                }
                .padding(.horizontal, Theme.Spacing.medium)
                .frame(minHeight: Theme.Size.minimumHitTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.appPlain)

            if expandedIssueID == issue.id {
                VStack(alignment: .leading, spacing: Theme.Spacing.small) {
                    ForEach(Array(issue.steps.enumerated()), id: \.offset) { _, step in
                        HStack(alignment: .top, spacing: Theme.Spacing.small) {
                            Text("•")
                            Text(step)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineSpacing(Theme.Spacing.extraSmall)
                .padding(.horizontal, Theme.Spacing.medium)
                .padding(.bottom, Theme.Spacing.medium)
            }
        }
    }

    private func statusGlyph(_ status: DiagnosticResultStatus) -> AgentStartIconID {
        switch status {
        case .pass: .checkCircle
        case .fail: .xCircle
        case .warning: .warning
        }
    }

    private func statusColor(_ status: DiagnosticResultStatus) -> Color {
        switch status {
        case .pass: Theme.Colors.success
        case .fail: Theme.Colors.attention
        case .warning: Theme.Colors.mutedForeground
        }
    }
}
