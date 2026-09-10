import SwiftUI
import UserNotifications

struct NotificationOptInView: View {
    let onFinished: () -> Void
    @State private var busyChoice: NotificationOptInChoice?
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                VStack(spacing: 0) {
                    AgentStartIcon(.bellRinging, size: Theme.Spacing.huge)
                        .frame(width: Theme.Spacing.huge * 2, height: Theme.Spacing.huge * 2)
                        .padding(.bottom, Theme.Spacing.extraLarge)
                    Text("NOTIFICATIONS")
                        .font(.system(size: Theme.Typography.metadata, weight: .semibold))
                        .tracking(0.5)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .padding(.bottom, Theme.Spacing.small)
                    Text("Stay updated while connected")
                        .font(.system(size: Theme.Typography.emphasis, weight: .semibold))
                        .multilineTextAlignment(.center)
                    Text(
                        "See an alert on this device while AgentStart is connected to your daemon."
                    )
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .multilineTextAlignment(.center)
                    .lineSpacing(Theme.Spacing.extraSmall)
                    .padding(.top, Theme.Spacing.medium)
                }
                .frame(maxWidth: 448)
                .frame(maxWidth: .infinity, minHeight: 420)

                VStack(spacing: Theme.Spacing.small) {
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.attention)
                            .multilineTextAlignment(.center)
                            .accessibilityLabel(errorMessage)
                    }
                    choiceButton(
                        title: "Enable notifications",
                        choice: .enable,
                        isProminent: true
                    )
                    choiceButton(title: "Not now", choice: .skip, isProminent: false)
                    Text("You can change this any time in Settings.")
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: 448)
                .frame(maxWidth: .infinity)
                .padding(.bottom, Theme.Spacing.standard)
            }
            .padding(.horizontal, Theme.Spacing.extraLarge)
            .frame(maxWidth: .infinity, minHeight: 720)
        }
        .scrollIndicators(.hidden)
        .background { AppBackground() }
        .interactiveDismissDisabled()
    }

    @ViewBuilder
    private func choiceButton(
        title: LocalizedStringKey,
        choice: NotificationOptInChoice,
        isProminent: Bool
    ) -> some View {
        if busyChoice == choice {
            AgentStartLoader(size: Theme.Control.largeIcon)
                .frame(maxWidth: .infinity, minHeight: Theme.Size.minimumHitTarget)
        } else if isProminent {
            Button {
                Task { await choose(choice) }
            } label: {
                Text(title).frame(maxWidth: .infinity)
            }
            .appProminentGlassButton()
            .appButtonContext(.large)
            .disabled(busyChoice != nil)
        } else {
            Button {
                Task { await choose(choice) }
            } label: {
                Text(title).frame(maxWidth: .infinity)
            }
            .buttonStyle(.glass)
            .appButtonContext(.large)
            .disabled(busyChoice != nil)
        }
    }

    private func choose(_ choice: NotificationOptInChoice) async {
        guard busyChoice == nil else { return }
        busyChoice = choice
        errorMessage = nil
        do {
            let enabled: Bool
            if choice == .enable {
                enabled = try await UNUserNotificationCenter.current().requestAuthorization(
                    options: [.alert, .badge, .sound]
                )
            } else {
                enabled = false
            }
            NotificationPreference.save(enabled)
            onFinished()
        } catch {
            errorMessage = "Notification settings could not be updated. Try again."
            busyChoice = nil
        }
    }
}

private enum NotificationOptInChoice {
    case enable
    case skip
}
