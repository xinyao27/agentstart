import SwiftUI

struct AgentStartLoader: View {
    @Environment(\.accessibilityReduceMotion) private var reducesMotion
    @Environment(\.appLoaderStyle) private var selectedStyle
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.controlSize) private var controlSize
    @State private var animationStart = Date()
    private let size: CGFloat?

    init(size: CGFloat? = nil) {
        self.size = size
    }

    var body: some View {
        let resolvedSize = resolvedSize
        AgentStartLoaderCanvas(
            style: selectedStyle,
            size: resolvedSize,
            colorScheme: colorScheme,
            reducesMotion: reducesMotion,
            animationStart: animationStart
        )
    }

    private var resolvedSize: CGFloat {
        if let size { return size }
        switch controlSize {
        case .mini: return 10
        case .small: return 13
        case .regular: return 16
        case .large, .extraLarge: return 20
        @unknown default: return 16
        }
    }
}

/// A Settings-owned preview that may render a style other than the app's selection.
struct AgentStartLoaderPreview: View {
    let style: AppLoaderStyle
    let size: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reducesMotion
    @Environment(\.colorScheme) private var colorScheme
    @State private var animationStart = Date()

    var body: some View {
        AgentStartLoaderCanvas(
            style: style,
            size: size,
            colorScheme: colorScheme,
            reducesMotion: reducesMotion,
            animationStart: animationStart
        )
    }
}

private struct AgentStartLoaderCanvas: View {
    let style: AppLoaderStyle
    let size: CGFloat
    let colorScheme: ColorScheme
    let reducesMotion: Bool
    let animationStart: Date

    var body: some View {
        let renderer = LoaderRenderer(style: style, size: Double(size))
        // Why: the loader applies its own depth/opacity curve on top of the color it is
        // given, so feeding it mutedForeground a second time washes every dot out. The
        // resulting curve is neutral grey on the content surface, never blue.
        let color = Theme.Colors.foreground
        let palette = LoaderPalette(color: color, colorScheme: colorScheme)
        TimelineView(.animation(paused: reducesMotion)) { timeline in
            Canvas { context, _ in
                renderer.draw(
                    context: &context,
                    time: renderer.usesSynchronizedClock
                        ? ProcessInfo.processInfo.systemUptime
                        : timeline.date.timeIntervalSince(animationStart),
                    color: color,
                    palette: palette,
                    reducesMotion: reducesMotion
                )
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct AgentStartProgressViewStyle: ProgressViewStyle {
    func makeBody(configuration: Configuration) -> some View {
        if let fractionCompleted = configuration.fractionCompleted {
            VStack(spacing: Theme.Spacing.small) {
                configuration.label
                SwiftUI.ProgressView(value: fractionCompleted)
                    .progressViewStyle(.linear)
                    .tint(Theme.Colors.mutedForeground)
            }
        } else {
            VStack(spacing: Theme.Spacing.small) {
                AgentStartLoader()
                configuration.label
            }
        }
    }
}

private enum LoaderRenderer {
    case legacy(LoaderLegacyRenderer)
    case aicss(LoaderAICSSRenderer)

    init(style: AppLoaderStyle, size: Double) {
        switch style {
        case .working, .searching, .solving, .listening, .composing, .shaping:
            self = .legacy(LoaderLegacyRenderer(style: style, size: size))
        case .s1, .s2, .s3, .s4, .s5, .b1, .b2, .b3, .b4, .b5, .c1, .c2,
            .c3, .c4, .c5, .m1, .m2, .m3, .m4, .m5:
            self = .aicss(LoaderAICSSRenderer(style: style, size: size))
        }
    }

    var usesSynchronizedClock: Bool {
        switch self {
        case .legacy: true
        case .aicss: false
        }
    }

    func draw(
        context: inout GraphicsContext,
        time: TimeInterval,
        color: Color,
        palette: LoaderPalette,
        reducesMotion: Bool
    ) {
        switch self {
        case .legacy(let renderer):
            renderer.draw(
                context: &context,
                time: time,
                palette: palette,
                reducesMotion: reducesMotion
            )
        case .aicss(let renderer):
            renderer.draw(
                context: &context,
                time: time,
                color: color,
                reducesMotion: reducesMotion
            )
        }
    }
}
