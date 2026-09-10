import SwiftUI

/// The single neutral dismiss affordance for a `NavigationStack`-hosted sheet or full-screen
/// cover whose close neither discards a draft nor confirms a change — a read-only viewer, an
/// action/selection list, or a completed-state summary. A screen with a genuine dirty draft
/// keeps its own text "Cancel" paired with a confirming action ("Save"/"Add"/"Create"/…)
/// instead of this component; those two affordances mean different things and must stay
/// different.
///
/// Custom docked-panel or sheet headers built outside a system toolbar do not use this type —
/// they call `GlassHeaderButton(iconName: .x, …)` directly, the same glyph this renders inside
/// a real `ToolbarItem`.
struct SheetDismissToolbarItem: ToolbarContent {
    let accessibilityLabel: LocalizedStringResource
    let action: () -> Void

    var body: some ToolbarContent {
        // Why: a neutral dismiss is not "cancel" or "confirm" — using `.topBarLeading` instead
        // of `.cancellationAction`/`.confirmationAction` keeps the placement fixed at the
        // top-left regardless of which HIG role SwiftUI would otherwise infer, matching the
        // corner readers already expect for Activity insights and every docked-panel header.
        ToolbarItem(placement: .topBarLeading) {
            Button(action: action) {
                AgentStartToolbarIcon(.x)
            }
            .accessibilityLabel(accessibilityLabel)
        }
    }
}
