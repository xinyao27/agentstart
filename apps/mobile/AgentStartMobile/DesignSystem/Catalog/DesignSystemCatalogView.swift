import SwiftUI

struct DesignSystemCatalogView: View {
    @Environment(\.appLoaderStyle) private var loaderStyle
    @State private var isConnected = true

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: Theme.Spacing.extraLarge) {
                    systemFirstSection
                    buttonSizeSection
                    unavailableStateSection
                    sheetPresentationSection
                    loaderSection
                    semanticSection
                    customGlassSection
                }
                .frame(maxWidth: Theme.Size.readingWidth, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.page)
                .padding(.vertical, Theme.Spacing.extraLarge)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(Text("Design System"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                } label: {
                    AgentStartToolbarIcon(.search)
                }
                .accessibilityLabel("Search")
            }
            ToolbarSpacer(.fixed, placement: .topBarTrailing)
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                } label: {
                    AgentStartToolbarIcon(.more)
                }
                .accessibilityLabel("More")
            }
        }
    }

    private var loaderSection: some View {
        CatalogSection(
            title: "Loader sizes and families",
            detail:
                "Agent loaders are neutral gray. Use 10 points for agent dots, 16 for workspace status, 18 for attachment progress, and 20 for previews and chat status."
        ) {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                HStack(alignment: .center, spacing: Theme.Spacing.large) {
                    loaderSizeExample(10, label: "Agent")
                    loaderSizeExample(16, label: "Workspace")
                    loaderSizeExample(18, label: "Attachment")
                    loaderSizeExample(20, label: "Preview")
                }
                Text(
                    "Every product loader uses the style selected in Settings: \(loaderStyle.title)."
                )
                .font(.caption)
                .foregroundStyle(Theme.Colors.mutedForeground)
            }
        }
    }

    private func loaderSizeExample(_ size: CGFloat, label: LocalizedStringKey) -> some View {
        VStack(spacing: Theme.Spacing.extraSmall) {
            AgentStartLoader(size: size)
                .frame(width: 20, height: 20)
            Text(label)
                .font(.caption2)
                .foregroundStyle(Theme.Colors.mutedForeground)
        }
    }

    private var systemFirstSection: some View {
        CatalogSection(
            title: "System components first",
            detail: "Navigation, toolbars, menus, sheets, and buttons receive native Liquid Glass."
        ) {
            GlassActionGroup {
                Button("Refresh", iconID: .refresh) {}
                    .buttonStyle(.glass)
                    .appButtonContext(.large)

                Button("Start session", iconID: .play) {}
                    .appProminentGlassButton()
                    .appButtonContext(.large)
            }
        }
    }

    private var buttonSizeSection: some View {
        CatalogSection(
            title: "Button sizes follow context",
            detail:
                "Visible controls are 32, 36, or 44 points; every custom hit target is at least 44 points."
        ) {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                buttonExample("Inline · filters and row accessories", context: .inline)
                buttonExample("Regular · panel actions and retry", context: .regular)
                buttonExample(
                    "Large · submit, bottom CTA, and custom sheet header", context: .large)
            }
        }
    }

    private func buttonExample(
        _ title: LocalizedStringKey,
        context: AppButtonContext
    ) -> some View {
        HStack(spacing: Theme.Spacing.small) {
            GlassIconButton(
                iconName: .filter,
                accessibilityLabel: "Example icon action",
                context: context,
                action: {}
            )
            Button("Action", iconID: .arrowRight) {}
                .buttonStyle(.glass)
                .appButtonContext(context)
            Text(title)
                .font(.caption)
                .foregroundStyle(Theme.Colors.mutedForeground)
        }
    }

    private var unavailableStateSection: some View {
        CatalogSection(
            title: "Unavailable states stay quiet",
            detail:
                "Use a 28-point neutral icon, regular body title, secondary description, and a regular 36-point retry action."
        ) {
            ContentSurface {
                AppUnavailableState(
                    "Workspace session unavailable",
                    iconID: .stack,
                    description: Text(
                        "The host did not respond. Check its connection and try again."
                    )
                ) {
                    Button("Try again") {}
                        .buttonStyle(.glass)
                        .appButtonContext(.regular)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.standard)
            }
        }
    }

    private var sheetPresentationSection: some View {
        CatalogSection(
            title: "Sheet presentation follows behavior",
            detail:
                "Page and fixed-height sheets hide the drag indicator. Only sheets with multiple usable heights show it."
        ) {
            ContentSurface {
                VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                    sheetPresentationRow(
                        "Page",
                        detail: "Creation, selection, and detail flows with their own toolbar"
                    )
                    sheetPresentationRow(
                        "Fixed",
                        detail: "Short editors, confirmations, and action drawers"
                    )
                    sheetPresentationRow(
                        "Resizable",
                        detail: "Content that moves between two or more useful heights"
                    )
                }
            }
        }
    }

    private func sheetPresentationRow(
        _ title: LocalizedStringKey,
        detail: LocalizedStringKey
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
            Text(title)
                .font(.subheadline.weight(.semibold))
            Text(detail)
                .font(.caption)
                .foregroundStyle(Theme.Colors.mutedForeground)
        }
    }

    private var semanticSection: some View {
        CatalogSection(
            title: "Content stays content",
            detail: "Status, code, diff, terminal, and transcript layers stay stable and readable."
        ) {
            ContentSurface {
                VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                    HStack(spacing: Theme.Spacing.small) {
                        SemanticBadge(
                            isConnected ? "Connected" : "Offline",
                            iconID: isConnected ? .checkCircle : .wifiSlash,
                            tint: isConnected ? Theme.Colors.success : Theme.Colors.unread
                        )

                        Spacer()

                        Toggle("Connection", isOn: $isConnected)
                            .labelsHidden()
                    }

                    Text("Worktree session")
                        .font(.headline)
                    Text("Ordinary content surfaces never stack custom glass effects.")
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var customGlassSection: some View {
        CatalogSection(
            title: "Custom glass is functional",
            detail: "Use it for temporary floating controls or HUDs, not decorative cards."
        ) {
            FloatingGlassSurface {
                Label("Agent is waiting for input", iconID: .sparkle)
                    .font(.headline)
            }
        }
    }
}

private struct CatalogSection<Content: View>: View {
    let title: LocalizedStringKey
    let detail: LocalizedStringKey
    let content: Content

    init(
        title: LocalizedStringKey,
        detail: LocalizedStringKey,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.detail = detail
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                Text(title)
                    .font(.title3.weight(.semibold))
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            content
        }
    }
}

#Preview {
    NavigationStack {
        DesignSystemCatalogView()
    }
}
