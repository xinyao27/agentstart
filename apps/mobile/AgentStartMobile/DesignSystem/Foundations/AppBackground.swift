import SwiftUI

struct AppBackground: View {
    var body: some View {
        Theme.Colors.background
            .ignoresSafeArea()
            .accessibilityHidden(true)
    }
}
