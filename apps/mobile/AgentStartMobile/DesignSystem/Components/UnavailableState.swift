import SwiftUI

/// The compact, neutral empty/error-state layout shared by product features.
struct AppUnavailableState<Actions: View>: View {
    private let title: Text
    private let description: Text?
    private let iconID: AgentStartIconID
    private let actions: Actions

    init(
        _ title: LocalizedStringKey,
        iconID: AgentStartIconID,
        description: Text? = nil,
        @ViewBuilder actions: () -> Actions
    ) {
        self.title = Text(title)
        self.description = description
        self.iconID = iconID
        self.actions = actions()
    }

    init(
        title: Text,
        iconID: AgentStartIconID,
        description: Text? = nil,
        @ViewBuilder actions: () -> Actions
    ) {
        self.title = title
        self.description = description
        self.iconID = iconID
        self.actions = actions()
    }

    var body: some View {
        VStack(spacing: Theme.Spacing.standard) {
            AgentStartIcon(iconID, size: 28)
                .foregroundStyle(Theme.Colors.mutedForeground)

            VStack(spacing: Theme.Spacing.extraSmall) {
                title
                    .font(.body)
                    .foregroundStyle(Theme.Colors.foreground)

                if let description {
                    description
                        .font(.subheadline)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            actions
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, Theme.Spacing.huge)
    }
}

extension AppUnavailableState where Actions == EmptyView {
    init(
        _ title: LocalizedStringKey,
        iconID: AgentStartIconID,
        description: Text? = nil
    ) {
        self.init(title, iconID: iconID, description: description) { EmptyView() }
    }

    init(
        title: Text,
        iconID: AgentStartIconID,
        description: Text? = nil
    ) {
        self.init(title: title, iconID: iconID, description: description) { EmptyView() }
    }
}
