import SwiftUI
import UIKit

// Why: `navigationBarBackButtonHidden` only hides the visible back button — the
// system's interactive edge-swipe-back gesture keeps working underneath it, so a
// screen guarding a dirty draft can still be swiped away with no confirmation and
// no way to intercept it in SwiftUI. Toggle the underlying UIKit gesture recognizer
// directly instead.
private struct InteractivePopGestureConfigurator: UIViewControllerRepresentable {
    let isDisabled: Bool

    func makeUIViewController(context: Context) -> UIViewController {
        UIViewController()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        DispatchQueue.main.async {
            uiViewController.navigationController?.interactivePopGestureRecognizer?.isEnabled =
                !isDisabled
        }
    }

    static func dismantleUIViewController(_ uiViewController: UIViewController, coordinator: ()) {
        uiViewController.navigationController?.interactivePopGestureRecognizer?.isEnabled = true
    }
}

extension View {
    func disablesInteractivePopGesture(_ isDisabled: Bool) -> some View {
        background(InteractivePopGestureConfigurator(isDisabled: isDisabled))
    }
}
