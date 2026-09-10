import SwiftUI

struct TerminalSessionHeader: View {
    let title: String

    var body: some View {
        // Why: a single-line title with no tab-count subtitle. The tab strip immediately below
        // already lists every open tab by name, so a "N tabs" line would restate it.
        Text(verbatim: title)
            .font(.system(size: Theme.Typography.emphasis, weight: .semibold))
            .foregroundStyle(Theme.Colors.foreground)
            .lineLimit(1)
            // Why: keep both the owner and the workspace suffix visible when the name is long.
            // Middle truncation yields `we…hitecture-gap` instead of dropping the suffix, which
            // is the half that identifies the workspace.
            .truncationMode(.middle)
            // Why: the title occupies the center area between the 44pt back hit target and the
            // trailing menu. A 220pt principal slot leaves room for the repository prefix while
            // letting the navigation bar own the hard edge constraints on the smallest device;
            // stated explicitly so a long workspace name cannot swallow the title margins.
            .frame(maxWidth: 220)
    }
}
