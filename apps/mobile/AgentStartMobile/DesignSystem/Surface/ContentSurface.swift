import SwiftUI

struct ContentSurface<Content: View, Footer: View>: View {
    private let content: Content
    private let footer: Footer?

    init(@ViewBuilder content: () -> Content) where Footer == EmptyView {
        self.content = content()
        footer = nil
    }

    init(
        @ViewBuilder content: () -> Content,
        @ViewBuilder footer: () -> Footer
    ) {
        self.content = content()
        self.footer = footer()
    }

    var body: some View {
        VStack(spacing: 0) {
            content
                .padding(Theme.Spacing.standard)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let footer {
                Divider()
                    .padding(.horizontal, Theme.Spacing.standard)
                footer
                    .padding(.horizontal, Theme.Spacing.standard)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentSurfaceBackground()
    }
}

/// The one owner of the content-card treatment: fill, continuous corner and hairline edge.
///
/// Feature code and Design System components both draw cards, so this lives here instead of each
/// call site deriving its own fill/radius/stroke recipe — those had already drifted apart.
extension View {
    func contentSurfaceBackground(
        radius: CGFloat = Theme.Radius.content,
        fill: Color = Theme.Colors.content
    ) -> some View {
        modifier(ContentSurfaceBackground(radius: radius, fill: fill))
    }
}

private struct ContentSurfaceBackground: ViewModifier {
    let radius: CGFloat
    let fill: Color

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        content
            .background(fill, in: shape)
            .overlay(shape.stroke(Theme.Colors.divider, lineWidth: Theme.Size.hairline))
    }
}
