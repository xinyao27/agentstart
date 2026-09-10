import SwiftUI

enum AppSheetPresentation {
    case fixed(PresentationDetent)
    case page
}

private struct AppSheetPresentationModifier: ViewModifier {
    let presentation: AppSheetPresentation

    // Why: no sheet in AgentStart shows a drag indicator — every one dismisses through its own
    // header or nav-bar action, at one fixed size. Both cases hard-code `.hidden` so a
    // sheet cannot grow a resize grabber that implies a gesture the app does not support.
    @ViewBuilder
    func body(content: Content) -> some View {
        switch presentation {
        case .fixed(let detent):
            content
                .presentationDetents([detent])
                .presentationDragIndicator(.hidden)
        case .page:
            content
                .presentationSizing(.page)
                .presentationDragIndicator(.hidden)
        }
    }
}

extension View {
    func appSheetPresentation(_ presentation: AppSheetPresentation) -> some View {
        modifier(AppSheetPresentationModifier(presentation: presentation))
    }
}
