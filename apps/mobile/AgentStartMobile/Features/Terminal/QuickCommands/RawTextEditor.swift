import SwiftUI
import UIKit

struct TerminalRawTextEditor: UIViewRepresentable {
    @Binding var text: String
    let font: UIFont

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
        view.delegate = context.coordinator
        view.backgroundColor = .clear
        view.font = font
        view.smartDashesType = .no
        view.smartInsertDeleteType = .no
        view.smartQuotesType = .no
        view.autocapitalizationType = .none
        view.autocorrectionType = .no
        view.spellCheckingType = .no
        view.text = text
        return view
    }

    func updateUIView(_ view: UITextView, context _: Context) {
        guard view.text != text else { return }
        view.text = text
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        private let text: Binding<String>

        init(text: Binding<String>) {
            self.text = text
        }

        func textViewDidChange(_ textView: UITextView) {
            text.wrappedValue = textView.text
        }
    }
}
