import SwiftUI

struct FloatingGlassSurface<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(Theme.Spacing.standard)
            .glassEffect(
                .regular,
                in: .rect(cornerRadius: Theme.Radius.floatingSurface)
            )
    }
}
