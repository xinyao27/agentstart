import SwiftUI

struct GlassActionGroup<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        GlassEffectContainer(spacing: Theme.Glass.groupSpacing) {
            HStack(spacing: Theme.Glass.groupSpacing) {
                content
            }
        }
    }
}

struct StackedGlassActionGroup<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        // Why: a GlassEffectContainer blends nearby full-width capsules and creates a dark seam
        // between vertically stacked primary and secondary actions.
        VStack(spacing: Theme.Glass.stackedActionSpacing) {
            content
        }
    }
}
