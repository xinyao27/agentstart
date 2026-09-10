import SwiftUI

struct WorkspaceSetupTrustSheet: View {
    @Environment(\.dismiss) private var dismiss
    let prompt: WorkspaceSetupTrustPrompt
    let isBusy: Bool
    let runOnce: () -> Void
    let alwaysTrust: () -> Void
    let skip: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                    Text(
                        "This repository's agentstart.yaml runs before the workspace starts. Only run it if you trust this repository."
                    )
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)

                    ContentSurface {
                        VStack(alignment: .leading, spacing: Theme.Spacing.small) {
                            Text(
                                prompt.wasPreviouslyApproved ? "New setup script" : "Setup script"
                            )
                            .font(
                                .system(
                                    size: Theme.Typography.metadata,
                                    weight: .semibold
                                )
                            )
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            Text(verbatim: prompt.scriptContent)
                                .font(
                                    .system(
                                        size: Theme.Typography.code,
                                        design: .monospaced
                                    )
                                )
                                .foregroundStyle(Theme.Colors.foreground)
                        }
                    }

                    ContentSurface {
                        VStack(spacing: 0) {
                            action("Run hooks", icon: true, action: runOnce)
                            Divider()
                            action("Always trust and run", icon: true, action: alwaysTrust)
                            Divider()
                            action("Don't run", icon: false, action: skip)
                        }
                    }
                }
                .padding(.horizontal, Theme.Spacing.page)
                .padding(.bottom, Theme.Spacing.huge)
            }
        }
        .background { AppBackground() }
        .appSheetPresentation(.page)
        .interactiveDismissDisabled(isBusy)
    }

    private var header: some View {
        HStack(spacing: Theme.Spacing.standard) {
            GlassHeaderButton(
                iconName: .arrowLeft,
                accessibilityLabel: "Back to workspace form",
                isDisabled: isBusy,
                action: { dismiss() }
            )

            Text(
                prompt.wasPreviouslyApproved
                    ? "\(prompt.repoName)'s setup script changed"
                    : "Run setup from \(prompt.repoName)?"
            )
            .font(.system(size: Theme.Typography.primary, weight: .semibold))
            .foregroundStyle(Theme.Colors.foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.top, Theme.Spacing.standard)
        .padding(.bottom, Theme.Spacing.huge)
    }

    private func action(
        _ title: LocalizedStringKey,
        icon: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.small) {
                if icon {
                    AgentStartIcon(.check, size: Theme.Control.inlineIcon)
                }
                Text(title)
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.foreground)
                Spacer()
                if isBusy {
                    AgentStartLoader(size: Theme.Control.inlineIcon)
                }
            }
            .frame(minHeight: Theme.Size.minimumHitTarget)
            .contentShape(.rect)
        }
        .buttonStyle(.appPlain)
        .disabled(isBusy)
    }
}
