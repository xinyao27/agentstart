import SwiftUI

struct WorkspaceSetupSection: View {
    @Bindable var model: WorkspaceCreationModel

    var body: some View {
        if model.isLoadingSetup {
            HStack {
                Spacer()
                AgentStartLoader(size: Theme.Control.inlineIcon)
                Spacer()
            }
            .frame(minHeight: Theme.Size.minimumHitTarget)
            .padding(.bottom, Theme.Spacing.medium)
        } else if let command = model.setupDetails.decisionContent {
            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                HStack {
                    Text("Setup script")
                        .font(
                            .system(size: Theme.Typography.metadata, weight: .semibold)
                        )
                        .foregroundStyle(Theme.Colors.mutedForeground)
                    Spacer()
                    if let source = model.setupDetails.source {
                        Text(source == "agentstart.yaml" ? "AGENTSTART.YAML" : "HOOKS")
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .padding(.horizontal, Theme.Spacing.small)
                            .frame(minHeight: Theme.Spacing.extraLarge)
                            .background(
                                Theme.Colors.selection,
                                in: .rect(cornerRadius: Theme.Radius.control)
                            )
                    }
                }

                VStack(spacing: Theme.Spacing.small) {
                    if model.setupDetails.runPolicy == .ask {
                        HStack(spacing: Theme.Spacing.small) {
                            decisionButton("Run", decision: .run)
                            decisionButton("Skip", decision: .skip)
                        }
                    } else {
                        Toggle("Run setup command", isOn: $model.shouldRunSetup)
                            .font(.system(size: Theme.Typography.supporting))
                    }

                    Text(verbatim: command)
                        .font(.system(size: Theme.Typography.code, design: .monospaced))
                        .foregroundStyle(Theme.Colors.foreground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Theme.Spacing.medium)
                        .padding(.vertical, Theme.Spacing.small)
                        .background(
                            Theme.Colors.background,
                            in: .rect(cornerRadius: Theme.Radius.control)
                        )
                }
                .padding(Theme.Spacing.medium)
                .background(
                    Theme.Colors.secondary,
                    in: .rect(cornerRadius: Theme.Radius.content)
                )
            }
            .padding(.bottom, Theme.Spacing.medium)
        }
    }

    private func decisionButton(
        _ title: LocalizedStringKey,
        decision: WorkspaceSetupDecision
    ) -> some View {
        Button {
            model.setupDecisionChoice = decision
        } label: {
            Text(title)
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, minHeight: Theme.Control.inlineHeight)
        }
        .buttonStyle(.appPlain)
        .glassEffect(
            model.setupDecisionChoice == decision
                ? .regular.tint(Theme.Colors.selection) : .regular,
            in: .capsule
        )
        .frame(minHeight: Theme.Size.minimumHitTarget)
        .contentShape(.rect)
    }
}
