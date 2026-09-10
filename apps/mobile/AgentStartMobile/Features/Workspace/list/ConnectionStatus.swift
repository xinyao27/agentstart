import SwiftUI

nonisolated enum WorkspaceHostCompatibility: Equatable, Sendable {
    case compatible
    case mobileTooOld(requiredVersion: Int?)
    case desktopTooOld(requiredVersion: Int?)
}

struct WorkspaceAuthenticationBanner: View {
    let canRetry: Bool
    let retry: () -> Void
    let repair: () -> Void
    let remove: () -> Void

    var body: some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.small) {
                Text(
                    "Authentication failed — try reconnecting first; if it keeps failing, "
                        + "re-pair from the daemon."
                )
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.attention)

                GlassActionGroup {
                    if canRetry {
                        actionButton("Retry", action: retry)
                    }
                    actionButton("Re-pair", action: repair)
                    actionButton("Remove", isDestructive: true, action: remove)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.medium)
        .padding(.top, Theme.Spacing.small)
    }

    private func actionButton(
        _ title: LocalizedStringResource,
        isDestructive: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(title, action: action)
            .buttonStyle(.glass)
            .tint(isDestructive ? Theme.Colors.attention : nil)
            .appButtonContext(.inline)
    }
}

struct WorkspaceProtocolBlockView: View {
    let compatibility: WorkspaceHostCompatibility
    let backToHosts: () -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack {
            ContentSurface {
                VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                    Text(title)
                        .font(
                            .system(
                                size: Theme.Typography.primary,
                                weight: .semibold
                            )
                        )
                        .foregroundStyle(Theme.Colors.foreground)
                    Text(bodyText)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                    VStack(spacing: Theme.Spacing.small) {
                        fullWidthButton(primaryActionTitle, isProminent: true) {
                            if let primaryActionURL { openURL(primaryActionURL) }
                        }
                        fullWidthButton("Back to hosts", action: backToHosts)
                    }
                    Text(
                        "Already updated? Go back to Hosts and refresh the connection. If this "
                            + "message stays, remove this host and pair it again."
                    )
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.standard)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background { AppBackground() }
    }

    private var isMobileTooOld: Bool {
        if case .mobileTooOld = compatibility { return true }
        return false
    }

    private var title: LocalizedStringResource {
        isMobileTooOld ? "Update AgentStart Mobile" : "Update the AgentStart daemon"
    }

    private var bodyText: LocalizedStringResource {
        if isMobileTooOld {
            return
                "This daemon needs a newer AgentStart Mobile app. Install the latest mobile build, then try this host again."
        }
        return
            "This paired daemon is too old for your current AgentStart Mobile app. Update the daemon, then try this host again."
    }

    private var primaryActionTitle: LocalizedStringResource {
        isMobileTooOld ? "Open App Store" : "Open GitHub Releases"
    }

    private var primaryActionURL: URL? {
        if isMobileTooOld {
            return URL(string: "https://apps.apple.com/app/id6810343597")
        }
        return URL(string: "https://github.com/xinyao27/agentstart/releases")
    }

    @ViewBuilder
    private func fullWidthButton(
        _ title: LocalizedStringResource,
        isProminent: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        let button = Button(action: action) {
            Text(title)
                .frame(maxWidth: .infinity)
        }
        if isProminent {
            button
                .appProminentGlassButton()
                .appButtonContext(.large)
        } else {
            button
                .buttonStyle(.glass)
                .appButtonContext(.large)
        }
    }
}
