import Foundation

nonisolated private let workspaceSourceQueryMaxBytes = 2_048

nonisolated func workspaceSourceQueryWithinLimit(_ value: String) -> Bool {
    value.utf8.count <= workspaceSourceQueryMaxBytes
}

nonisolated enum WorkspacePasteIntent: Hashable, Sendable {
    case githubNumber(Int)
    case githubLink(slug: WorkspaceRepoSlug, number: Int)
}

nonisolated struct WorkspaceCrossRepoPrompt: Hashable, Sendable {
    let query: String
    let slug: WorkspaceRepoSlug
    let number: Int
    let repoID: String
    let repoName: String
}

nonisolated func workspacePasteIntent(_ value: String) -> WorkspacePasteIntent? {
    guard value.utf8.count <= 2_048 else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    let numeric = trimmed.hasPrefix("#") ? String(trimmed.dropFirst()) : trimmed
    if !trimmed.contains("://"), numeric.allSatisfy(\.isNumber), let number = Int(numeric),
        number > 0
    {
        return .githubNumber(number)
    }
    guard let components = URLComponents(string: trimmed),
        components.host != nil,
        components.scheme == "https" || components.scheme == "http"
    else { return nil }
    let path = components.path.split(separator: "/").map(String.init)
    if path.count >= 4, path[2].lowercased() == "pull", let number = Int(path[3]), number > 0 {
        return .githubLink(
            slug: WorkspaceRepoSlug(owner: path[0], repo: path[1]),
            number: number
        )
    }
    return nil
}

nonisolated extension WorkspaceRepoSlug {
    func matches(_ other: WorkspaceRepoSlug) -> Bool {
        owner.localizedCaseInsensitiveCompare(other.owner) == .orderedSame
            && repo.localizedCaseInsensitiveCompare(other.repo) == .orderedSame
    }
}
