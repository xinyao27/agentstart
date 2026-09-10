import Foundation
import Observation

@Observable
@MainActor
final class AppModel {
    let dependencies: AppDependencies
    var routes: [AppRoute] = []
    var homeRevision = 0
    var hostRevision = 0
    var isActivityInsightsPresented = false
    var isNotificationOptInPresented = false
    @ObservationIgnored var deepLinkTask: Task<Void, Never>?
    @ObservationIgnored var didHandleDevelopmentPairingLaunch = false

    init(dependencies: AppDependencies) {
        self.dependencies = dependencies
    }
}
