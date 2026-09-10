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
        let shape = RoundedRectangle(
            cornerRadius: Theme.Radius.content,
            style: .continuous
        )
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
        .background(
            Theme.Colors.content,
            in: shape
        )
        .overlay(shape.stroke(Theme.Colors.divider, lineWidth: Theme.Size.hairline))
    }
}
