import SwiftUI

struct PairingConfirmView: View {
    @State private var model: PairingModel
    @State private var pairingTask: Task<Void, Never>?
    @State private var didStartDevelopmentAutoPair = false

    private let onPaired: (HostProfile) -> Void
    private let onCancel: () -> Void

    init(
        offer: PairingOffer,
        runtime: any PairingRuntime,
        onPaired: @escaping (HostProfile) -> Void,
        onCancel: @escaping () -> Void
    ) {
        _model = State(initialValue: PairingModel(offer: offer, runtime: runtime))
        self.onPaired = onPaired
        self.onCancel = onCancel
    }

    var body: some View {
        ZStack {
            AppBackground()

            GeometryReader { geometry in
                ScrollView {
                    status
                        .frame(maxWidth: Theme.Size.readingWidth)
                        .frame(minHeight: geometry.size.height)
                        .padding(.horizontal, Theme.Spacing.page)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        // Why: this route hides the native stack header — its only navigation affordance is
        // the 36pt circular back control inside the page content. Keeping a toolbar title adds
        // a second header row and pushes the centered confirmation group off-centre.
        .navigationTitle(Text(""))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .overlay(alignment: .topLeading) {
            GlassHeaderButton(
                iconName: .arrowLeft,
                accessibilityLabel: "Cancel pairing",
                action: cancelPairing
            )
            .padding(.top, Theme.Spacing.small)
            .padding(.leading, Theme.Spacing.standard)
        }
        .task {
            startDevelopmentAutoPairIfNeeded()
        }
        .onDisappear {
            pairingTask?.cancel()
            pairingTask = nil
        }
    }

    @ViewBuilder
    private var status: some View {
        switch model.phase {
        case .ready:
            readyContent
        case .connecting:
            connectingContent
        case .failed(let message):
            failedContent(message)
        }
    }

    private var readyContent: some View {
        VStack(spacing: 0) {
            Text("Pair with this daemon?")
                .font(.system(size: Theme.Typography.emphasis, weight: .semibold))
                .foregroundStyle(Theme.Colors.foreground)
                .multilineTextAlignment(.center)
            Text("You opened a pairing link from your daemon. Confirm to add it to your hosts.")
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                // Why: cap the explanatory copy at a readable measure inside the padded
                // content column. Letting it use the whole phone width packs extra words onto
                // the first line and reads as a wall of text.
                .frame(maxWidth: PairingConfirmMetrics.copyWidth)
                .padding(.top, Theme.Spacing.small)
                .padding(.bottom, Theme.Spacing.extraLarge)
            readyActions
        }
    }

    private var readyActions: some View {
        StackedGlassActionGroup {
            Button {
                beginPairing()
            } label: {
                Text("Pair")
                    .font(.system(size: Theme.Typography.supporting))
                    .frame(maxWidth: .infinity)
            }
            .appProminentGlassButton()
            .appButtonContext(.large)

            Button(role: .cancel) {
                cancelPairing()
            } label: {
                Text("Cancel")
                    .font(.system(size: Theme.Typography.supporting))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.glass)
            .appButtonContext(.large)
        }
    }

    private var connectingContent: some View {
        VStack(spacing: Theme.Spacing.standard) {
            ProgressView()
                .controlSize(.large)
            Text("Connecting…")
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.mutedForeground)
            PairingLog(entries: model.logEntries)
                .frame(maxWidth: .infinity)
        }
    }

    private func failedContent(_ message: LocalizedStringResource) -> some View {
        AppUnavailableState(title: Text(message), iconID: .warning) {
            VStack(spacing: Theme.Spacing.standard) {
                PairingLog(entries: model.logEntries)
                    .frame(maxWidth: .infinity)
                StackedGlassActionGroup {
                    Button {
                        cancelPairing()
                    } label: {
                        Text("Back to home")
                            .frame(maxWidth: .infinity)
                    }
                    .appProminentGlassButton()
                    .appButtonContext(.large)
                }
            }
        }
    }

    private func beginPairing() {
        pairingTask?.cancel()
        pairingTask = Task {
            if let host = await model.pair() {
                onPaired(host)
            }
        }
    }

    private func cancelPairing() {
        pairingTask?.cancel()
        pairingTask = nil
        onCancel()
    }

    private func startDevelopmentAutoPairIfNeeded() {
        #if DEBUG && targetEnvironment(simulator)
            guard !didStartDevelopmentAutoPair,
                ProcessInfo.processInfo.arguments.contains("--development-auto-pair"),
                URL(string: model.offer.endpoint)?.host == "127.0.0.1"
            else { return }
            didStartDevelopmentAutoPair = true
            beginPairing()
        #endif
    }
}

private enum PairingConfirmMetrics {
    // Why: explanatory copy stays readable while actions can use the wider page column.
    static let copyWidth: CGFloat = 330
}
