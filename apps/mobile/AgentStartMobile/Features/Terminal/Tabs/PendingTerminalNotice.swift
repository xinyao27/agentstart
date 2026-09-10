import SwiftUI

struct PendingTerminalNotice: View {
    let didTimeOut: Bool
    let retry: () -> Void
    let dismiss: () -> Void

    var body: some View {
        HStack(spacing: Theme.Spacing.small) {
            if didTimeOut {
                AgentStartIcon(.warning, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.attention)
            } else {
                AgentStartLoader(size: Theme.Control.inlineIcon)
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                Text(didTimeOut ? "Couldn't start terminal" : "Starting terminal")
                    .font(.system(size: Theme.Typography.metadata, weight: .regular))
                    .foregroundStyle(Theme.Colors.foreground)
                    .lineLimit(1)
                Text(
                    didTimeOut
                        ? "The host did not respond. Try again."
                        : "You can switch tabs while it connects."
                )
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineLimit(1)
            }

            Spacer(minLength: 0)

            if didTimeOut {
                Button("Retry", action: retry)
                    .font(.system(size: Theme.Typography.metadata, weight: .regular))
                    .buttonStyle(.appPlain)
                    .foregroundStyle(Theme.Colors.foreground)
                    .frame(minHeight: Theme.Size.minimumHitTarget)
                    .contentShape(.interaction, .rect)
            }

            Button(action: dismiss) {
                AgentStartIcon(.x, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(
                        width: Theme.Size.minimumHitTarget,
                        height: Theme.Size.minimumHitTarget
                    )
            }
            .buttonStyle(.appPlain)
            .accessibilityLabel("Dismiss starting terminal notice")
        }
        .padding(.leading, Theme.Spacing.medium)
        .padding(.trailing, Theme.Spacing.extraSmall)
        .frame(minHeight: Theme.Size.minimumHitTarget)
        .glassEffect(
            .regular,
            in: .rect(cornerRadius: Theme.Radius.control)
        )
        .accessibilityElement(children: .contain)
    }
}
