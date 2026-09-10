import SwiftUI

struct WorkspacePressedRowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Theme.Colors.selection : Color.clear)
            .contentShape(Rectangle())
    }
}
