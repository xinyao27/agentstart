import SwiftUI

enum AppButtonContext: Hashable, Sendable {
    case inline
    case regular
    case large

    var controlSize: ControlSize {
        switch self {
        case .inline: .small
        case .regular: .regular
        case .large: .large
        }
    }

    var visibleHeight: CGFloat {
        switch self {
        case .inline: Theme.Control.inlineHeight
        case .regular: Theme.Control.regularHeight
        case .large: Theme.Control.largeHeight
        }
    }

    var iconSize: CGFloat {
        switch self {
        case .inline: Theme.Control.inlineIcon
        case .regular: Theme.Control.regularIcon
        case .large: Theme.Control.largeIcon
        }
    }
}

struct AppPlainButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(.interaction, .rect)
    }
}

extension ButtonStyle where Self == AppPlainButtonStyle {
    static var appPlain: AppPlainButtonStyle { AppPlainButtonStyle() }
}

private struct AppButtonContextModifier: ViewModifier {
    let context: AppButtonContext
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    // Why: the pinned visible height plus the hit-target padding is what keeps every
    // control on one rhythm at normal text sizes. At an accessibility size the scaled
    // label no longer fits that height and truncates to an unreadable "M…", and the
    // padding — derived from the same fixed number — no longer matches the capsule the
    // glass style actually draws, so adjacent controls overlap. Above the accessibility
    // threshold the control is left to size itself; a scaled control already clears the
    // minimum hit target on its own.
    @ViewBuilder
    func body(content: Content) -> some View {
        let sized = content.controlSize(context.controlSize)
        if dynamicTypeSize.isAccessibilitySize {
            sized.contentShape(.rect)
        } else {
            sized
                .frame(height: context.visibleHeight)
                .padding(
                    .vertical,
                    max(0, (Theme.Size.minimumHitTarget - context.visibleHeight) / 2)
                )
                .contentShape(.rect)
        }
    }
}

extension View {
    func appButtonContext(_ context: AppButtonContext) -> some View {
        modifier(AppButtonContextModifier(context: context))
    }

    func appProminentGlassButton() -> some View {
        buttonStyle(.glassProminent).modifier(AppProminentGlassLabelColor())
    }
}

private struct AppProminentGlassLabelColor: ViewModifier {
    @Environment(\.isEnabled) private var isEnabled

    // Why: prominent glass needs the adaptive canvas color while enabled, but its disabled
    // surface becomes pale enough that the same label color disappears.
    func body(content: Content) -> some View {
        content.foregroundStyle(isEnabled ? Theme.Colors.background : Theme.Colors.mutedForeground)
    }
}
