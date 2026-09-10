import SwiftUI

private struct WorkspaceCreationControl: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: Theme.Typography.supporting))
            .foregroundStyle(Theme.Colors.foreground)
            .padding(.horizontal, Theme.Spacing.medium)
            .frame(minHeight: Theme.Control.largeHeight)
            .glassEffect(
                .regular.interactive(),
                in: .rect(cornerRadius: Theme.Radius.control)
            )
    }
}

extension View {
    func workspaceCreationControl() -> some View {
        modifier(WorkspaceCreationControl())
    }
}
