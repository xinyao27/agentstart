import SwiftUI

struct SourceControlActionSheet: View {
    @Bindable var model: SourceControlModel
    let branchLabel: String
    let switchBranch: () -> Void
    let openCommits: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Theme.Spacing.small) {
                    Text(verbatim: branchLabel)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                    ContentSurface {
                        VStack(spacing: 0) {
                            ForEach(Array(model.actions.enumerated()), id: \.element.id) {
                                index, action in
                                if index > 0 {
                                    Divider().padding(.leading, Theme.Spacing.huge)
                                }
                                actionRow(action)
                            }
                        }
                    }
                }
                .padding(Theme.Spacing.page)
            }
            .background(Theme.Colors.background)
            .navigationTitle("Source Control")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                SheetDismissToolbarItem(
                    accessibilityLabel: "Close source control actions",
                    action: dismiss.callAsFunction
                )
            }
        }
        .appSheetPresentation(.page)
    }

    private func actionRow(_ action: SourceControlAction) -> some View {
        Button {
            switch action.kind {
            case .switchBranch:
                dismiss()
                switchBranch()
            case .commits:
                dismiss()
                openCommits()
            default:
                Task {
                    await model.runAction(action.kind)
                    if model.busyAction == nil { dismiss() }
                }
            }
        } label: {
            HStack(spacing: Theme.Spacing.small) {
                AgentStartIcon(action.iconName, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(width: Theme.Spacing.extraLarge)
                VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                    Text(verbatim: action.label)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(
                            action.isDisabled
                                ? Theme.Colors.mutedForeground : Theme.Colors.foreground
                        )
                    if let hint = action.hint {
                        Text(verbatim: hint)
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .multilineTextAlignment(.leading)
                    }
                    if let progress = progress(for: action) {
                        Text(verbatim: progress.message)
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                }
                Spacer(minLength: Theme.Spacing.small)
                if action.isLoading {
                    ProgressView()
                        .controlSize(.small)
                }
            }
            .padding(.vertical, Theme.Spacing.medium)
            .contentShape(.rect)
        }
        .buttonStyle(.appPlain)
        .disabled(action.isDisabled)
    }

    private func progress(for action: SourceControlAction) -> SourceHostedReviewCreateProgress? {
        switch action.kind {
        case .createReview, .pushAndCreateReview: model.reviewCreateProgress
        default: nil
        }
    }
}
