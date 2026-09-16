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
    let dismiss: () -> Void

    var body: some View {
        HStack(spacing: Theme.Spacing.small) {
            Text(message)
                .font(Theme.Typography.metadata.weight(.regular))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
            // Why: a failure notice never dismisses itself, so it has to be closable — and by a
            // 44pt target rather than the glyph.
            Button(action: dismiss) {
                AgentStartIcon(.x, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(
                        width: Theme.Size.minimumHitTarget,
                        height: Theme.Size.minimumHitTarget
                    )
            }
            .buttonStyle(.appPlain)
            .accessibilityLabel("Dismiss message")
        }
        .padding(.leading, Theme.Spacing.medium)
        .frame(minHeight: Theme.Control.regularHeight)
        .glassEffect(.regular, in: .capsule)
    }
}

/// Progress for a workspace mutation, with the cancel the operation was missing.
struct TerminalOperationProgress: View {
    let operation: TerminalWorkspaceOperation
    let canCancel: Bool
    let cancel: () -> Void

    var body: some View {
        HStack(spacing: Theme.Spacing.small) {
            AgentStartLoader(
                size: Theme.Control.inlineIcon,
                accessibilityLabel: title
            )
            Text(title)
                .font(Theme.Typography.metadata.weight(.regular))
                .foregroundStyle(Theme.Colors.foreground)
                .lineLimit(1)
            Spacer(minLength: Theme.Spacing.small)
            // Why: a mutation that blocks every other action in the session needs a way out, not
            // just a spinner. The control appears only when stopping it is actually possible.
            if canCancel {
                Button("Cancel", action: cancel)
                    .font(Theme.Typography.metadata)
                    .foregroundStyle(Theme.Colors.foreground)
                    .buttonStyle(.appPlain)
                    .padding(.horizontal, Theme.Spacing.medium)
                    .frame(minHeight: Theme.Control.inlineHeight)
                    .background(
                        Theme.Colors.keycap,
                        in: .rect(cornerRadius: Theme.Radius.control)
                    )
            }
        }
        .padding(.leading, Theme.Spacing.medium)
        .padding(.trailing, Theme.Spacing.extraSmall)
        .padding(.vertical, Theme.Spacing.extraSmall)
        .frame(minHeight: Theme.Control.largeHeight)
        .glassEffect(.regular, in: .capsule)
        .accessibilityElement(children: .contain)
    }

    private var title: LocalizedStringResource {
        switch operation {
        case .creating: "Starting terminal…"
        case .resuming: "Resuming workspace…"
        case .closing: "Closing tab…"
        }
    }
}
