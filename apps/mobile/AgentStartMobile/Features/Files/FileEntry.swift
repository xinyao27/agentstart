import Foundation

nonisolated struct WorkspaceDirectoryEntry: Hashable, Sendable {
    let name: String
    let isDirectory: Bool
    let isSymlink: Bool
}

nonisolated enum WorkspaceFileKind: Hashable, Sendable {
    case directory
    case text
    case binary
}

nonisolated struct WorkspaceFileRow: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let relativePath: String
    let depth: Int
    let kind: WorkspaceFileKind
    let state: State

    enum State: Hashable, Sendable {
        case item
        case loading
        case failed(String)
    }
}

nonisolated struct WorkspaceDirectoryState: Sendable {
    var entries: [WorkspaceDirectoryEntry]
    var isLoading = false
    var error: String?
}

nonisolated enum WorkspaceFileProjection {
    private static let excludedNames: Set<String> = [".git", "node_modules"]
    private static let binaryExtensions: Set<String> = [
        "avif", "bmp", "gif", "heic", "ico", "jpeg", "jpg", "mov", "mp3", "mp4", "pdf",
        "png", "webp", "zip",
    ]
    private static let imageExtensions: Set<String> = [
        "bmp", "gif", "ico", "jpeg", "jpg", "png", "webp",
    ]

    static func rows(
        cache: [String: WorkspaceDirectoryState],
        expanded: Set<String>
    ) -> [WorkspaceFileRow] {
        var result: [WorkspaceFileRow] = []
        visit("", depth: 0, cache: cache, expanded: expanded, rows: &result)
        return result
    }

    static func canPreview(_ row: WorkspaceFileRow) -> Bool {
        switch row.kind {
        case .directory: false
        case .text: true
        case .binary: imageExtensions.contains(fileExtension(row.relativePath))
        }
    }

    static func isMarkdown(_ path: String) -> Bool {
        ["md", "mdx", "markdown"].contains(fileExtension(path))
    }

    private static func visit(
        _ relativePath: String,
        depth: Int,
        cache: [String: WorkspaceDirectoryState],
        expanded: Set<String>,
        rows: inout [WorkspaceFileRow]
    ) {
        let entries = (cache[relativePath]?.entries ?? [])
            .filter { !excludedNames.contains($0.name) }
            .sorted {
                if $0.isDirectory != $1.isDirectory { return $0.isDirectory }
                return $0.name.localizedStandardCompare($1.name) == .orderedAscending
            }
        for entry in entries {
            let childPath = join(relativePath, entry.name)
            let kind: WorkspaceFileKind =
                entry.isDirectory
                ? .directory
                : binaryExtensions.contains(fileExtension(childPath)) ? .binary : .text
            rows.append(
                WorkspaceFileRow(
                    id: "\(entry.isDirectory ? "dir" : "file"):\(childPath)",
                    name: entry.name,
                    relativePath: childPath,
                    depth: depth,
                    kind: kind,
                    state: .item
                )
            )
            guard entry.isDirectory, expanded.contains(childPath) else { continue }
            if cache[childPath]?.isLoading == true {
                rows.append(statusRow(path: childPath, depth: depth + 1, state: .loading))
            } else if let error = cache[childPath]?.error {
                rows.append(statusRow(path: childPath, depth: depth + 1, state: .failed(error)))
            } else {
                visit(childPath, depth: depth + 1, cache: cache, expanded: expanded, rows: &rows)
            }
        }
    }

    private static func statusRow(
        path: String,
        depth: Int,
        state: WorkspaceFileRow.State
    ) -> WorkspaceFileRow {
        WorkspaceFileRow(
            id: "status:\(path)",
            name: "",
            relativePath: path,
            depth: depth,
            kind: .directory,
            state: state
        )
    }

    private static func join(_ parent: String, _ name: String) -> String {
        parent.isEmpty ? name : "\(parent)/\(name)"
    }

    private static func fileExtension(_ path: String) -> String {
        URL(fileURLWithPath: path).pathExtension.lowercased()
    }
}
