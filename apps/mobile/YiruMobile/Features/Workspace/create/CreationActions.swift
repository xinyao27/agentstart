import SwiftUI

@MainActor
extension WorkspaceCreationSheet {
    func create() {
        Task {
            guard let workspace = await model.create() else { return }
            dismiss()
            onCreated(workspace)
        }
    }

    var trustPromptBinding: Binding<WorkspaceSetupTrustPrompt?> {
        Binding(
            get: { model.trustPrompt },
            set: { prompt in
                if prompt == nil { model.dismissTrustPrompt() }
            }
        )
    }

    func completeTrustAction(
        _ action: @escaping @MainActor () async -> WorkspaceSummary?
    ) {
        Task {
            guard let workspace = await action() else { return }
            dismiss()
            onCreated(workspace)
        }
    }

    func repoBadgeColor(_ value: String) -> Color {
        switch value.lowercased() {
        case "red": .red
        case "orange": .orange
        case "yellow": .yellow
        case "green": .green
        case "blue": .blue
        case "purple": .purple
        case "pink": .pink
        default: Theme.Colors.mutedForeground
        }
    }

    func sourceGlyph(_ selection: WorkspaceSourceSelection) -> YiruIconID {
        switch selection {
        case .branch, .newBranch: .gitMerge
        case .hosted: .gitPullRequest
        }
    }

    var visibleSourceSelection: WorkspaceSourceSelection? {
        if case .newBranch = model.sourceSelection { return nil }
        return model.sourceSelection
    }

    var workspaceNameLabel: LocalizedStringKey {
        model.selectedRepo?.kind == .folder ? "Workspace name" : "Name or 'Create From'"
    }

    var shouldShowBranchName: Bool {
        guard let selection = model.sourceSelection else { return true }
        if case .hosted = selection { return false }
        return true
    }

    var workspaceNameBinding: Binding<String> {
        Binding(get: { model.name }, set: { model.updateWorkspaceName($0) })
    }

    var reuseBranchBinding: Binding<Bool> {
        Binding(
            get: {
                if case .branch(_, _, let isReused) = model.sourceSelection { return isReused }
                return false
            },
            set: { model.setReuseSelectedBranch($0) }
        )
    }

    func sourceURL(_ selection: WorkspaceSourceSelection) -> URL? {
        guard case .hosted(let item, _) = selection else { return nil }
        return URL(string: item.url)
    }
}
