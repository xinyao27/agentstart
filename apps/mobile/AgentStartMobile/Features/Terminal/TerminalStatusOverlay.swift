import SwiftUI

struct TerminalConnectionStatusBanner: View {
    @Bindable var model: TerminalLiveModel
    let hostConnectionIsReady: Bool
    @State private var isDismissed = false

    var body: some View {
        if hostConnectionIsReady && showsConnectionBanner && !isDismissed {
            HStack(spacing: 0) {
                if showsRetry {
                    Button(action: model.retry) {
                        connectionBannerLabel
                    }
                    .buttonStyle(.appPlain)
                    .accessibilityLabel("Reconnect to daemon")
                } else {
                    connectionBannerLabel
                }

                Button {
                    isDismissed = true
                } label: {
                    AgentStartIcon(.x, size: Theme.Control.inlineIcon)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(
                            width: Theme.Size.minimumHitTarget,
                            height: Theme.Size.minimumHitTarget
                        )
                }
                .buttonStyle(.appPlain)
                .accessibilityLabel("Dismiss connection status")
            }
            .glassEffect(
                .regular.interactive(),
                in: .rect(cornerRadius: TerminalChromeMetrics.connectionCornerRadius)
            )
            .onChange(of: showsConnectionBanner) { _, isShowing in
                if isShowing { isDismissed = false }
            }
        }
    }

    private var connectionBannerLabel: some View {
        HStack(spacing: Theme.Spacing.small) {
            connectionIndicator
            Text(statusTitle)
                .font(.system(size: TerminalChromeMetrics.connectionText))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.leading, Theme.Spacing.medium)
        .frame(minHeight: Theme.Size.minimumHitTarget)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(.rect(cornerRadius: TerminalChromeMetrics.connectionCornerRadius))
    }

    @ViewBuilder
    private var connectionIndicator: some View {
        switch model.phase {
        case .connecting, .reconnecting, .restoring:
            AgentStartLoader(size: TerminalChromeMetrics.tabIcon)
                .frame(
                    width: TerminalChromeMetrics.tabIcon,
                    height: TerminalChromeMetrics.tabIcon
                )
        case .failed:
            Circle()
                .fill(Theme.Colors.attention)
                .frame(
                    width: TerminalChromeMetrics.connectionIndicator,
                    height: TerminalChromeMetrics.connectionIndicator
                )
        case .ended:
            Circle()
                .fill(Theme.Colors.statusNeutral)
                .frame(
                    width: TerminalChromeMetrics.connectionIndicator,
                    height: TerminalChromeMetrics.connectionIndicator
                )
        case .active:
            EmptyView()
        }
    }

    private var showsConnectionBanner: Bool {
        if case .active = model.phase { return false }
        return true
    }

    private var showsRetry: Bool {
        switch model.phase {
        case .failed, .ended:
            true
        case .connecting, .reconnecting, .restoring, .active:
            false
        }
    }

    private var statusTitle: LocalizedStringResource {
        switch model.phase {
        case .connecting:
            "Connecting"
        case .reconnecting(let attempt):
            "Reconnecting · attempt \(attempt)"
        case .restoring:
            "Restoring terminal"
        case .active:
            "Live"
        case .ended:
            "Terminal ended · tap to reconnect"
        case .failed:
            "Connection interrupted · tap to reconnect"
        }
    }
}

struct TerminalActionNoticeLabel: View {
    let message: LocalizedStringResource

    var body: some View {
        Text(message)
            .font(.system(size: Theme.Typography.metadata, weight: .regular))
            .foregroundStyle(Theme.Colors.foreground)
            .padding(.horizontal, Theme.Spacing.medium)
            .frame(minHeight: Theme.Control.regularHeight)
            .glassEffect(.regular, in: .capsule)
    }
}
