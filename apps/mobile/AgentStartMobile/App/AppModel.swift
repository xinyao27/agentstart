import Foundation
import Observation
import SwiftUI

@Observable
@MainActor
final class AppModel {
    let dependencies: AppDependencies
    var selectedTab: AppTab = .home
    var isNotificationOptInPresented = false
    var homeRevision = 0
    var hostRevision = 0
    @ObservationIgnored var deepLinkTask: Task<Void, Never>?
    @ObservationIgnored var didHandleDevelopmentPairingLaunch = false

    // Why: Home and Settings are peer tabs, so the app holds one navigation stack per tab. Only
    // the stacks' contents live here; every mutation goes through the accessors below so a route
    // cannot land in the wrong tab's history.
    private var homeRoutes: [AppRoute] = []
    private var settingsRoutes: [AppRoute] = []

    init(dependencies: AppDependencies) {
        self.dependencies = dependencies
    }

    func routes(for tab: AppTab) -> [AppRoute] {
        switch tab {
        case .home: homeRoutes
        case .settings: settingsRoutes
        }
    }

    func setRoutes(_ routes: [AppRoute], for tab: AppTab) {
        switch tab {
        case .home: homeRoutes = routes
        case .settings: settingsRoutes = routes
        }
    }

    func push(_ route: AppRoute) {
        setRoutes(routes(for: route.tab) + [route], for: route.tab)
    }

    func popLast(for tab: AppTab) {
        var routes = routes(for: tab)
        guard !routes.isEmpty else { return }
        routes.removeLast()
        setRoutes(routes, for: tab)
    }

    func popAll(for tab: AppTab) {
        setRoutes([], for: tab)
    }

    /// A stack binding for the tab's `NavigationStack`, so SwiftUI drives it the same way the
    /// accessors above do.
    func binding(for tab: AppTab) -> Binding<[AppRoute]> {
        Binding(
            get: { self.routes(for: tab) },
            set: { self.setRoutes($0, for: tab) }
        )
    }
}

extension AppModel {
    // Why: the design-system catalog is development navigation, not a user setting. It is the
    // Settings tab's only conditional row, so it is declared once here rather than duplicated by
    // whichever view happens to build that screen.
    nonisolated static var showsDebugNavigation: Bool {
        #if DEBUG
            true
        #else
            false
        #endif
    }
}
