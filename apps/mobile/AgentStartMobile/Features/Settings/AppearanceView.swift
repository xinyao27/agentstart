import SwiftUI

struct AppearanceSettingsView: View {
    @State private var isLoaderPickerPresented = false
    let preferences: SettingsPreferences

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SettingsHeading(
                    title: "THEME",
                    detail: "Choose how AgentStart looks on this device."
                )
                Picker(
                    "Theme",
                    selection: Binding(
                        get: { preferences.themeMode },
                        set: { preferences.selectTheme($0) }
                    )
                ) {
                    ForEach(AppThemeMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                // Why: this is a full 44pt control. SwiftUI's segmented picker otherwise takes
                // its smaller intrinsic height, which breaks the 44pt control rhythm and pulls
                // every section below it upward.
                .frame(maxWidth: .infinity, minHeight: Theme.Control.largeHeight)
                // Why: SettingsSpacing.headingToContent keeps every settings screen's
                // heading-to-control gap identical across the cluster.
                .padding(.top, SettingsSpacing.headingToContent)

                SettingsHeading(
                    title: "LOADING",
                    detail: "Choose the animation shown while agents are working on this device."
                )
                .padding(.top, SettingsSpacing.betweenSections)

                SettingsSection {
                    Button {
                        isLoaderPickerPresented = true
                    } label: {
                        HStack(spacing: Theme.Spacing.small) {
                            AgentStartLoader(size: Theme.Control.largeIcon)
                                .frame(width: Theme.Control.largeIcon)
                            VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                                Text("Loader")
                                    .font(.system(size: Theme.Typography.supporting))
                                Text(preferences.loaderStyle.title)
                                    .font(.system(size: Theme.Typography.metadata))
                                    .foregroundStyle(Theme.Colors.mutedForeground)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            AgentStartIcon(
                                .chevronRight,
                                size: Theme.Control.inlineIcon
                            )
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .frame(width: Theme.Control.largeIcon)
                        }
                        .padding(.horizontal, Theme.Spacing.medium)
                        .padding(.vertical, Theme.Spacing.medium)
                        .frame(minHeight: Theme.Size.minimumHitTarget)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.appPlain)
                }
                .padding(.top, SettingsSpacing.headingToContent)
            }
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.top, Theme.Spacing.standard)
            .padding(.bottom, Theme.Spacing.extraLarge)
        }
        .background { AppBackground() }
        .navigationTitle(Text("Appearance"))
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isLoaderPickerPresented) {
            LoaderPickerSheet(preferences: preferences)
        }
    }
}
