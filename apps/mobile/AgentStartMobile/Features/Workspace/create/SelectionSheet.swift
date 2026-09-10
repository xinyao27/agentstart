import SwiftUI

enum WorkspaceCreationPicker: String, Identifiable {
    case repository
    case agent

    var id: String { rawValue }
}

enum WorkspaceCreationPresentation: Identifiable {
    case source
    case picker(WorkspaceCreationPicker)

    var id: String {
        switch self {
        case .source: "source"
        case .picker(let picker): "picker-\(picker.id)"
        }
    }
}

struct WorkspaceCreationPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let picker: WorkspaceCreationPicker
    @Bindable var model: WorkspaceCreationModel

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                LazyVStack(spacing: 0) {
                    switch picker {
                    case .repository:
                        repositoryRows
                    case .agent:
                        agentRows
                    }
                }
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(height: listHeight)
            .background(Theme.Colors.content, in: .rect(cornerRadius: Theme.Radius.content))
            .overlay {
                RoundedRectangle(cornerRadius: Theme.Radius.content)
                    .stroke(Theme.Colors.divider, lineWidth: Theme.Size.hairline)
            }
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.bottom, Theme.Spacing.standard)
        }
        .frame(maxWidth: .infinity)
        .background { AppBackground() }
        .appSheetPresentation(.fixed(.height(presentationHeight)))
    }

    private var header: some View {
        HStack(spacing: Theme.Spacing.standard) {
            GlassHeaderButton(
                iconName: .arrowLeft,
                accessibilityLabel: "Back to workspace form",
                action: { dismiss() }
            )

            Text(title)
                .font(.system(size: Theme.Typography.primary, weight: .semibold))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.top, Theme.Spacing.standard)
        .padding(.bottom, Theme.Spacing.extraLarge)
    }

    @ViewBuilder
    private var repositoryRows: some View {
        ForEach(Array(model.repos.enumerated()), id: \.element.id) { index, repo in
            selectionRow(
                title: repo.name,
                isSelected: repo.id == model.selectedRepoID
            ) {
                Circle()
                    .fill(repoBadgeColor(repo.badgeColor))
                    .frame(width: Theme.Spacing.small, height: Theme.Spacing.small)
            } action: {
                model.selectRepository(repo.id)
                dismiss()
            }
            if index < model.repos.count - 1 { divider }
        }
    }

    @ViewBuilder
    private var agentRows: some View {
        ForEach(Array(model.agents.enumerated()), id: \.element.id) { index, agent in
            selectionRow(
                title: agent.label,
                isSelected: agent.id == model.selectedAgentID
            ) {
                AgentMark(agentID: agent.id, size: Theme.Control.regularIcon)
            } action: {
                model.clearCreationError()
                model.selectedAgentID = agent.id
                dismiss()
            }
            if index < model.agents.count - 1 { divider }
        }
    }

    private func selectionRow<Leading: View>(
        title: String,
        isSelected: Bool,
        @ViewBuilder leading: () -> Leading,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.medium) {
                leading()
                    .frame(width: Theme.Spacing.extraLarge)
                Text(verbatim: title)
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.foreground)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                AgentStartIcon(.check, size: Theme.Control.inlineIcon)
                    .opacity(isSelected ? 1 : 0)
                    .frame(width: Theme.Spacing.large)
            }
            .padding(.horizontal, Theme.Spacing.medium)
            .frame(minHeight: rowHeight)
            .contentShape(.rect)
        }
        .buttonStyle(.appPlain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var divider: some View {
        Rectangle()
            .fill(Theme.Colors.divider)
            .frame(height: Theme.Size.hairline)
            .padding(.horizontal, Theme.Spacing.medium)
    }

    private var title: LocalizedStringKey {
        switch picker {
        case .repository: "Repository"
        case .agent: "Agent"
        }
    }

    private var itemCount: Int {
        switch picker {
        case .repository: model.repos.count
        case .agent: model.agents.count
        }
    }

    private var listHeight: CGFloat {
        min(CGFloat(itemCount) * rowHeight, maximumListHeight)
    }

    private var presentationHeight: CGFloat {
        headerHeight + listHeight + Theme.Spacing.standard
    }

    private func repoBadgeColor(_ value: String) -> Color {
        switch value.lowercased() {
        case "red": .red
        case "orange": .orange
        case "yellow": .yellow
        case "green": .green
        case "blue": .blue
        case "purple": .purple
        case "pink": .pink
        default: Theme.Colors.mutedForeground
        }
    }

    private let rowHeight: CGFloat = Theme.Size.minimumHitTarget
    private let maximumListHeight: CGFloat = 384
    private let headerHeight: CGFloat = 84
}
