import SwiftUI

// Renders a ```mermaid fence as a live diagram. Mermaid.js is loaded from a CDN inside
// a sandboxed, non-persistent WKWebView (see MermaidWebView) rather than bundled: every other PR
// and session feature in this app already requires network access, so a CDN dependency adds no
// new offline gap in practice. The cost is that a diagram simply can't render without a network
// path to the CDN — which is why failure of any kind, including a load timeout, always degrades
// to the raw fenced source instead of a stuck spinner.
struct MermaidDiagramView: View {
    let source: String
    var fontSize: CGFloat = 17

    @Environment(\.colorScheme) private var colorScheme
    @State private var phase = RenderPhase.loading
    @State private var renderedHeight: CGFloat?

    private enum RenderPhase: Equatable {
        case loading
        case rendered
        case failed
    }

    private static let loadTimeout: Duration = .seconds(8)
    private static let placeholderHeight: CGFloat = 120

    var body: some View {
        Group {
            switch phase {
            case .failed:
                MermaidFallbackView(source: source, fontSize: fontSize)
            case .loading, .rendered:
                renderingView
            }
        }
        // Why: colorScheme is folded into the task id (not just source) so a light/dark switch
        // restarts the timeout and re-arms failure detection for the fresh WKWebView load that
        // updateUIView triggers when the resolved theme colors change.
        .task(id: "\(colorScheme)|\(source)") {
            phase = .loading
            renderedHeight = nil
            try? await Task.sleep(for: Self.loadTimeout)
            guard !Task.isCancelled, phase == .loading else { return }
            phase = .failed
        }
    }

    private var renderingView: some View {
        MermaidWebView(
            source: source,
            colorScheme: colorScheme,
            onHeight: { height in
                renderedHeight = height
                phase = .rendered
            },
            onFailure: { phase = .failed }
        )
        .frame(height: renderedHeight ?? Self.placeholderHeight)
        .overlay {
            if phase == .loading {
                AgentStartLoader(size: Theme.Control.regularIcon)
            }
        }
        .background(Theme.Colors.content)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.content, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.content, style: .continuous)
                .stroke(Theme.Colors.divider, lineWidth: Theme.Size.hairline)
        )
        .padding(.bottom, Theme.Spacing.small)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Mermaid diagram"))
    }
}

private struct MermaidFallbackView: View {
    let source: String
    let fontSize: CGFloat

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Text(verbatim: source)
                .font(.system(size: fontSize * 0.88, design: .monospaced))
                .foregroundStyle(Theme.Colors.foreground)
                .padding(Theme.Spacing.small)
        }
        .background(Theme.Colors.content)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.content, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.content, style: .continuous)
                .stroke(Theme.Colors.divider, lineWidth: Theme.Size.hairline)
        )
        .padding(.bottom, Theme.Spacing.small)
    }
}
