import SwiftUI

struct GlassCircleButton<Label: View>: View {
    let accessibilityLabel: LocalizedStringResource
    let context: AppButtonContext
    var isDisabled = false
    var isLoading = false
    @ViewBuilder let label: () -> Label
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    label()
                }
            }
            .frame(width: context.visibleHeight, height: context.visibleHeight)
            .glassEffect(.regular.interactive(), in: .circle)
            .frame(width: Theme.Size.minimumHitTarget, height: Theme.Size.minimumHitTarget)
            .contentShape(.rect)
        }
        .buttonStyle(.appPlain)
        .disabled(isDisabled || isLoading)
        .opacity(isDisabled ? 0.45 : 1)
        .accessibilityLabel(accessibilityLabel)
    }
}

struct GlassIconButton: View {
    let iconName: AgentStartIconID
    let accessibilityLabel: LocalizedStringResource
    let context: AppButtonContext
    var isDestructive = false
    var isDisabled = false
    var isLoading = false
    let action: () -> Void

    var body: some View {
        GlassCircleButton(
            accessibilityLabel: accessibilityLabel,
            context: context,
            isDisabled: isDisabled,
            isLoading: isLoading
        ) {
            if isDestructive {
                AgentStartIcon(iconName, size: context.iconSize)
                    .foregroundStyle(Theme.Colors.attention)
            } else {
                AgentStartIcon(iconName, size: context.iconSize)
            }
        } action: {
            action()
        }
    }
}

struct GlassHeaderButton: View {
    let iconName: AgentStartIconID
    let accessibilityLabel: LocalizedStringResource
    var context: AppButtonContext = .regular
    var isDisabled = false
    var isLoading = false
    let action: () -> Void

    var body: some View {
        GlassCircleButton(
            accessibilityLabel: accessibilityLabel,
            context: context,
            isDisabled: isDisabled,
            isLoading: isLoading
        ) {
            AgentStartToolbarIcon(iconName)
        } action: {
            action()
        }
    }
}

struct ProminentCircleButton: View {
    let iconName: AgentStartIconID
    let accessibilityLabel: LocalizedStringResource
    let context: AppButtonContext
    var isDisabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            AgentStartIcon(iconName, size: context.iconSize)
                .foregroundStyle(Theme.Colors.background)
                .frame(width: context.visibleHeight, height: context.visibleHeight)
                .background(Theme.Colors.foreground, in: Circle())
                .frame(width: Theme.Size.minimumHitTarget, height: Theme.Size.minimumHitTarget)
                .contentShape(.rect)
        }
        .buttonStyle(.appPlain)
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.4 : 1)
        .accessibilityLabel(accessibilityLabel)
    }
}

struct GlassProminentIconButton: View {
    let iconName: AgentStartIconID
    let accessibilityLabel: LocalizedStringResource
    let context: AppButtonContext
    var isDisabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            AgentStartIcon(iconName, size: context.iconSize)
                .frame(width: context.visibleHeight, height: context.visibleHeight)
                .contentShape(.rect)
        }
        .appProminentGlassButton()
        .buttonBorderShape(.circle)
        .controlSize(context.controlSize)
        .frame(width: context.visibleHeight, height: context.visibleHeight)
        .frame(width: Theme.Size.minimumHitTarget, height: Theme.Size.minimumHitTarget)
        .contentShape(.rect)
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.4 : 1)
        .accessibilityLabel(accessibilityLabel)
    }
}
