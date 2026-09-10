import Foundation

nonisolated struct HomeHostWorkspaceSnapshot: Sendable {
    let host: HostProfile
    let connection: RuntimeConnectionSnapshot?
    let workspaces: [WorkspaceSummary]
    let accounts: AccountsSnapshot?
    let activityStats: ActivityStatsSummary?
}

nonisolated struct HomeSnapshot: Sendable {
    let hosts: [HomeHostWorkspaceSnapshot]
    let recentWorkspace: RecentWorkspace?

    var workspaceCount: Int { hosts.reduce(0) { $0 + $1.workspaces.count } }
    var workingCount: Int {
        hosts.reduce(0) { count, host in
            count
                + host.workspaces.filter {
                    $0.activity == .working || $0.activity == .active
                }.count
        }
    }
    var attentionCount: Int {
        hosts.reduce(0) { count, host in
            count + host.workspaces.filter { $0.activity == .permission }.count
        }
    }
    var resumeTarget: (host: HostProfile, workspace: WorkspaceSummary)? {
        if let recentWorkspace,
            let host = hosts.first(where: {
                $0.host.id == recentWorkspace.hostID && $0.connection?.phase == .connected
            }),
            let workspace = host.workspaces.first(where: { $0.id == recentWorkspace.workspaceID })
        {
            return (host.host, workspace)
        }
        for snapshot in hosts where snapshot.connection?.phase == .connected {
            if let active = snapshot.workspaces.first(where: \.isActive) {
                return (snapshot.host, active)
            }
            if let recent = snapshot.workspaces
                .filter({ $0.lastOutput != nil })
                .max(by: {
                    ($0.lastOutput ?? .distantPast) < ($1.lastOutput ?? .distantPast)
                })
            {
                return (snapshot.host, recent)
            }
            if let first = snapshot.workspaces.first {
                return (snapshot.host, first)
            }
        }
        return nil
    }
    var primaryConnectedHost: HostProfile? {
        hosts.first(where: { $0.connection?.phase == .connected })?.host
    }

    var primaryConnectedSnapshot: HomeHostWorkspaceSnapshot? {
        hosts.first(where: { $0.connection?.phase == .connected })
    }
}

nonisolated enum HomePhase: Sendable {
    case loading
    case loaded(HomeSnapshot)
    case failed(LocalizedStringResource)
}
