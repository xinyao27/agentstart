import SwiftUI

struct SourceCommitFailurePanel: View {
    @Bindable var model: SourceControlModel

    var body: some View {
        if let failure = model.commitFailure {
            SourceCommitFailureCard(
                failure: failure,
                isLaunchingFix: model.busyAction == "commit-fix",
                launchError: model.commitFailureLaunchError,
                fix: { Task { await model.launchCommitFailureFix() } }
            )
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.top, Theme.Spacing.small)
            .listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(Theme.Colors.background)
        }
    }
}

struct SourceCommitFailureCard: View {
    let failure: SourceCommitFailure
    let isLaunchingFix: Bool
    let launchError: String?
    let fix: () -> Void
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.small) {
            HStack(spacing: Theme.Spacing.small) {
                VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                    Text("Commit failed")
                        .font(.system(size: Theme.Typography.primary, weight: .semibold))
                    Text(verbatim: failure.summary)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if isLaunchingFix {
                    ProgressView()
                        .controlSize(.small)
                        .frame(
                            width: Theme.Size.minimumHitTarget,
                            height: Theme.Size.minimumHitTarget
                        )
                } else {
                    Button("Fix", action: fix)
                        .font(.system(size: Theme.Typography.metadata))
                        .appProminentGlassButton()
                        .appButtonContext(.inline)
                }
            }
            if failure.hasDetails {
                Button {
                    isExpanded.toggle()
                } label: {
                    HStack(spacing: Theme.Spacing.extraSmall) {
                        AgentStartIcon(
                            isExpanded ? .arrowDown : .arrowRight,
                            size: Theme.Control.inlineIcon
                        )
                        Text(isExpanded ? "Hide details" : "Show details")
                    }
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(minHeight: Theme.Size.minimumHitTarget)
                }
                .buttonStyle(.appPlain)
                if isExpanded {
                    Text(verbatim: failure.error.trimmingCharacters(in: .whitespacesAndNewlines))
                        .font(.system(size: Theme.Typography.metadata, design: .monospaced))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .textSelection(.enabled)
                }
            }
            if let launchError {
                Text(verbatim: launchError)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.attention)
            }
        }
        .padding(Theme.Spacing.small)
        .background(
            Theme.Colors.selection.opacity(0.45),
            in: .rect(cornerRadius: Theme.Radius.control)
        )
        .overlay {
            RoundedRectangle(cornerRadius: Theme.Radius.control)
                .stroke(
                    Theme.Colors.attention.opacity(0.65),
                    lineWidth: Theme.Size.hairline
                )
        }
    }
}
