import SwiftUI

nonisolated enum ActionBannerStyle: Sendable {
    case failure
    case success
}

/// The shared dismissible banner for the result of a user action.
///
/// A failed action is not a decision point, so it never takes an alert: it floats over the
/// page that owns it, keeps the page's content visible, and offers a retry when the action
/// can be repeated. Success uses the same surface so the two results read as one family.
struct ActionBanner: View {
    let message: LocalizedStringResource
    var style: ActionBannerStyle = .failure
    var retry: (() -> Void)?
    let dismiss: () -> Void

    var body: some View {
        HStack(spacing: Theme.Spacing.small) {
            AgentStartIcon(iconID, size: Theme.Control.regularIcon)
                .foregroundStyle(
                    style == .failure ? Theme.Colors.attention : Theme.Colors.success
                )

            Text(message)
                .font(Theme.Typography.metadata)
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)

            if let retry {
                Button("Try again", action: retry)
                    .font(Theme.Typography.metadata)
                    .buttonStyle(.appPlain)
                    .foregroundStyle(Theme.Colors.foreground)
                    .appButtonContext(.inline)
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
            .accessibilityLabel("Dismiss")
        }
        .padding(.leading, Theme.Spacing.medium)
        .padding(.trailing, Theme.Spacing.extraSmall)
        .frame(minHeight: Theme.Size.minimumHitTarget)
        .glassEffect(
            .regular.interactive(),
            in: .rect(cornerRadius: Theme.Radius.control)
        )
        .accessibilityElement(children: .contain)
    }

    private var iconID: AgentStartIconID {
        switch style {
        case .failure: .warning
        case .success: .checkCircle
        }
    }
}

extension View {
    /// Floats an `ActionBanner` over the top of the receiver while `message` is present.
    func actionBanner(
        _ message: LocalizedStringResource?,
        style: ActionBannerStyle = .failure,
        retry: (() -> Void)? = nil,
        dismiss: @escaping () -> Void
    ) -> some View {
        overlay(alignment: .top) {
            if let message {
                ActionBanner(message: message, style: style, retry: retry, dismiss: dismiss)
                    .padding(.horizontal, Theme.Spacing.page)
                    .padding(.top, Theme.Spacing.small)
                    .appMotionTransition(edge: .top)
            }
        }
    }
}
