import SwiftUI

struct SettingsView: View {
    @State private var cleanupModel: CredentialCleanupModel
    @State private var loadTask: Task<Void, Never>?
    let showAppearance: () -> Void
    let showTerminal: () -> Void
    let showBrowser: () -> Void
    let showNotifications: () -> Void
    let showTroubleshooting: () -> Void
    let showAbout: () -> Void
    let showDesignSystem: () -> Void
    let showsDebugNavigation: Bool

    init(
        credentialCleanupRepository: any CredentialCleanupRepository,
        showAppearance: @escaping () -> Void,
        showTerminal: @escaping () -> Void,
        showBrowser: @escaping () -> Void,
        showNotifications: @escaping () -> Void,
        showTroubleshooting: @escaping () -> Void,
        showAbout: @escaping () -> Void,
        showDesignSystem: @escaping () -> Void = {},
        showsDebugNavigation: Bool = false
    ) {
        _cleanupModel = State(
            initialValue: CredentialCleanupModel(repository: credentialCleanupRepository)
        )
        _loadTask = State(initialValue: nil)
        self.showAppearance = showAppearance
        self.showTerminal = showTerminal
        self.showBrowser = showBrowser
        self.showNotifications = showNotifications
        self.showTroubleshooting = showTroubleshooting
        self.showAbout = showAbout
        self.showDesignSystem = showDesignSystem
        self.showsDebugNavigation = showsDebugNavigation
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: Theme.Spacing.medium) {
                navigationSection
                if cleanupModel.state.needsAttention {
                    credentialCleanupSection
                }
                #if DEBUG
                    if showsDebugNavigation {
                        debugNavigationSection
                    }
                #endif
                externalLinks
            }
            .padding(.horizontal, Theme.Spacing.page)
            // Why: a 16pt content inset gives the one-pixel separator rules a whole-pixel
            // rounding origin on a 3x display.
            .padding(.top, Theme.Spacing.standard)
            .padding(.bottom, Theme.Spacing.extraLarge)
        }
        .background { AppBackground() }
        .navigationTitle(Text("Settings"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            loadTask?.cancel()
            loadTask = Task { @MainActor in
                await cleanupModel.load()
            }
        }
        .onDisappear {
            loadTask?.cancel()
            loadTask = nil
        }
    }

    private var navigationSection: some View {
        SettingsSection {
            SettingsNavigationRow(title: "Appearance", glyph: .palette, action: showAppearance)
            SettingsDivider(emphasized: true)
            SettingsNavigationRow(title: "Terminal", glyph: .terminal, action: showTerminal)
            SettingsDivider(emphasized: true)
            SettingsNavigationRow(title: "Browser", glyph: .globe, action: showBrowser)
            SettingsDivider(emphasized: true)
            SettingsNavigationRow(
                title: "Notifications",
                glyph: .bell,
                action: showNotifications
            )
            SettingsDivider(emphasized: true)
            SettingsNavigationRow(
                title: "Troubleshooting",
                glyph: .wrench,
                action: showTroubleshooting
            )
            SettingsDivider(emphasized: true)
            SettingsNavigationRow(title: "About", glyph: .info, action: showAbout)
        }
    }

    private var credentialCleanupSection: some View {
        SettingsSection {
            HStack(spacing: Theme.Spacing.small) {
                AgentStartIcon(.key, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.unread)
                    .frame(width: Theme.Control.largeIcon)
                VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                    Text("Pairing credential cleanup")
                        .font(.system(size: Theme.Typography.supporting))
                    Text(cleanupModel.message)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineSpacing(Theme.Spacing.extraSmall)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Group {
                    if cleanupModel.isRetrying {
                        ProgressView()
                    } else {
                        Button("Retry") {
                            Task { await cleanupModel.retry() }
                        }
                        .buttonStyle(.glass)
                        .appButtonContext(.inline)
                    }
                }
                .frame(
                    minWidth: SettingsViewMetrics.cleanupActionWidth,
                    minHeight: Theme.Control.inlineHeight
                )
            }
            .padding(Theme.Spacing.medium)
        }
    }

    private var externalLinks: some View {
        SettingsSection {
            if let privacyURL = URL(
                string: "https://github.com/xinyao27/agentstart/blob/main/PRIVACY.md"
            ) {
                SettingsLinkRow(title: "Privacy Policy", glyph: .shield, destination: privacyURL)
            }
            if let supportURL = URL(string: "https://github.com/xinyao27/agentstart/issues") {
                SettingsDivider(emphasized: true)
                SettingsLinkRow(title: "Support", glyph: .lifebuoy, destination: supportURL)
            }
        }
    }

    #if DEBUG
        private var debugNavigationSection: some View {
            SettingsSection {
                SettingsNavigationRow(
                    title: "Design System",
                    glyph: .shapes,
                    trailing: "DEV ONLY",
                    action: showDesignSystem
                )
            }
        }
    #endif
}

private enum SettingsViewMetrics {
    // Why: retry and loader states reserve the same footprint so credential status never shifts.
    static let cleanupActionWidth: CGFloat = 64
}
