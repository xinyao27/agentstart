import SwiftUI

@main
struct AgentStartMobileApp: App {
    @State private var model: AppModel

    init() {
        let dependencies = AppDependencies.live()
        _model = State(initialValue: AppModel(dependencies: dependencies))
    }

    var body: some Scene {
        WindowGroup {
            AppView(model: model)
                .environment(
                    \.appLoaderStyle,
                    model.dependencies.settingsPreferences.loaderStyle
                )
                .progressViewStyle(AgentStartProgressViewStyle())
                .preferredColorScheme(model.dependencies.settingsPreferences.themeMode.colorScheme)
                // Why: Liquid Glass derives ordinary button labels from the environment tint.
                // Selection is a surface token, so using it here makes every ordinary action
                // render with a low-contrast grey label. Foreground keeps the default action
                // neutral; selected and destructive controls opt into their semantic tokens.
                .tint(Theme.Colors.foreground)
                .onOpenURL(perform: model.handleOpenURL)
                .task {
                    model.handleDevelopmentPairingLaunchIfNeeded()
                }
        }
    }

}
