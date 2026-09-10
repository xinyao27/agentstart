import SwiftUI

struct HomeOnboardingView: View {
    let showPairing: () -> Void

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                VStack(spacing: Theme.Spacing.medium) {
                    Text("Connect to your daemon")
                        .font(.system(size: Theme.Typography.emphasis, weight: .semibold))
                    Text(
                        "Pair directly with the AgentStart daemon to check on your agents, jump into any terminal, and drive work from your phone."
                    )
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .multilineTextAlignment(.center)
                    .lineSpacing(Theme.Spacing.extraSmall)

                    Button("Pair Daemon", action: showPairing)
                        .appProminentGlassButton()
                        .appButtonContext(.large)
                        .padding(.top, Theme.Spacing.large)
                }
                .padding(.horizontal, Theme.Spacing.huge)
                .padding(.vertical, Theme.Spacing.huge * 2.5)

                VStack(alignment: .leading, spacing: 0) {
                    Text("HOW IT WORKS")
                        .font(.system(size: Theme.Typography.metadata, weight: .semibold))
                        .tracking(0.4)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .padding(.horizontal, Theme.Spacing.extraSmall)
                        .padding(.bottom, Theme.Spacing.small)
                    ForEach(Array(homeOnboardingSteps.enumerated()), id: \.offset) { index, step in
                        if index > 0 { Divider() }
                        HStack(alignment: .top, spacing: Theme.Spacing.medium) {
                            Text("\(index + 1)")
                                .foregroundStyle(Theme.Colors.mutedForeground)
                                .frame(width: Theme.Spacing.extraLarge + Theme.Spacing.extraSmall)
                            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                                Text(step.title)
                                    .font(
                                        .system(
                                            size: Theme.Typography.primary,
                                            weight: .semibold
                                        )
                                    )
                                Text(step.detail)
                                    .font(.system(size: Theme.Typography.supporting))
                                    .foregroundStyle(Theme.Colors.mutedForeground)
                                    .lineSpacing(Theme.Spacing.extraSmall)
                            }
                        }
                        .padding(.vertical, Theme.Spacing.standard)
                    }
                }
                .padding(.horizontal, Theme.Spacing.extraLarge)
            }
            .frame(maxWidth: Theme.Size.readingWidth)
            .frame(maxWidth: .infinity)
        }
    }
}

nonisolated private struct HomeOnboardingStep: Sendable {
    let title: LocalizedStringResource
    let detail: LocalizedStringResource
}

nonisolated private let homeOnboardingSteps = [
    HomeOnboardingStep(
        title: "Open AgentStart in Chrome",
        detail: "Open AgentStart Mobile from the side panel and generate a pairing QR code."
    ),
    HomeOnboardingStep(
        title: "Scan the code",
        detail: "Tap the button above to open the scanner. Point at the QR code on your screen."
    ),
    HomeOnboardingStep(
        title: "You're connected",
        detail: "Your daemon will appear here. Everything is encrypted end-to-end."
    ),
]
