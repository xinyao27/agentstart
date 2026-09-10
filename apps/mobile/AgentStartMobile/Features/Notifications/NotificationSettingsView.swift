import SwiftUI
import UIKit

struct NotificationSettingsView: View {
    @State private var model: NotificationSettingsModel
    @Environment(\.scenePhase) private var scenePhase

    init() {
        _model = State(initialValue: NotificationSettingsModel())
    }

    var body: some View {
        VStack {
            ContentSurface {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .center, spacing: Theme.Spacing.small) {
                        VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                            Text("Agent notifications")
                                .font(.system(size: Theme.Typography.primary))
                            Text(hint)
                                .font(.system(size: Theme.Typography.metadata))
                                .foregroundStyle(Theme.Colors.mutedForeground)
                                // Why: this row is a compact two-line row on iPhone. Letting the
                                // copy grow to three lines makes the card 50% taller and shifts
                                // every following section down.
                                .lineLimit(2)
                                .allowsTightening(true)
                                .minimumScaleFactor(0.82)
                        }
                        // Why: SwiftUI's empty-label Toggle otherwise wins the HStack's width
                        // negotiation and steals a word from the supporting copy. Giving the
                        // text the higher priority preserves the old flex-1 row measurement.
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .layoutPriority(1)
                        Toggle(
                            "",
                            isOn: Binding(
                                get: { model.isEnabled },
                                set: { nextValue in
                                    Task { await model.setEnabled(nextValue) }
                                }
                            )
                        )
                        .labelsHidden()
                        .toggleStyle(.switch)
                        .accessibilityLabel("Agent notifications")
                    }
                    .disabled(model.permission == .denied || model.isUpdating)
                    // Why: the row carries only its 44pt minimum; a second vertical inset here
                    // makes the card visibly taller than the other settings rows.
                    .frame(
                        maxWidth: .infinity,
                        minHeight: Theme.Size.minimumHitTarget,
                        alignment: .leading
                    )

                    if model.permission == .denied {
                        Button("Open Settings") {
                            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                                return
                            }
                            UIApplication.shared.open(url)
                        }
                        .buttonStyle(.glass)
                        .appButtonContext(.inline)
                        .padding(.top, Theme.Spacing.small)
                    }
                }
            }
            .frame(maxWidth: .infinity)
            Spacer()
        }
        .padding(Theme.Spacing.page)
        .background { AppBackground() }
        .navigationTitle(Text("Notifications"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await model.refresh()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await model.refresh() }
        }
    }

    private var hint: LocalizedStringKey {
        if model.permission == .denied {
            "Notifications are disabled in system settings."
        } else {
            "See alerts while AgentStart is connected to your daemon."
        }
    }
}
