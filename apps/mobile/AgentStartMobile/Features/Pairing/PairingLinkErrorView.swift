import SwiftUI

nonisolated enum PairingLinkError: Hashable, Sendable {
    case missingCode
    case invalidCode
}

struct PairingLinkErrorView: View {
    let error: PairingLinkError
    let onCancel: () -> Void

    var body: some View {
        ZStack {
            AppBackground()

            AppUnavailableState(title: errorMessage, iconID: .warning) {
                backHomeButton
            }
            .frame(maxWidth: Theme.Size.readingWidth)
            .padding(.horizontal, Theme.Spacing.page)
        }
        // Why: the pairing routes hide the navigation header for both valid and invalid
        // links; the screen shows its own back affordance only when it has one.
        .navigationTitle(Text(""))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            if error == .invalidCode {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onCancel) {
                        AgentStartToolbarIcon(.arrowLeft)
                    }
                    .accessibilityLabel("Cancel pairing")
                }
            }
        }
    }

    private var errorMessage: Text {
        Text(error == .missingCode ? "Missing pairing code" : "Not a valid pairing code")
    }

    private var backHomeButton: some View {
        StackedGlassActionGroup {
            Button {
                onCancel()
            } label: {
                Text("Back to home")
                    .frame(maxWidth: .infinity)
            }
            .appProminentGlassButton()
            .appButtonContext(.large)
        }
    }
}
