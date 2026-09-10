import Foundation

nonisolated struct TerminalTappedFile: Hashable, Sendable {
    let pathText: String
    let line: Int?
    let column: Int?

    static func parse(_ rawValue: String) -> TerminalTappedFile? {
        if let url = URL(string: rawValue), url.scheme?.lowercased() == "file" {
            return parseFileURL(url, rawValue: rawValue)
        }
        guard looksLikePath(rawValue) else { return nil }
        return parseTrailingLocation(rawValue)
            ?? TerminalTappedFile(pathText: rawValue, line: nil, column: nil)
    }

    private static func parseFileURL(_ url: URL, rawValue: String) -> TerminalTappedFile? {
        var path = url.path(percentEncoded: false)
        if let host = url.host, !host.isEmpty, !isLocalHost(host) {
            path = "//\(host)\(path)"
        } else if path.range(of: #"^/[A-Za-z]:/"#, options: .regularExpression) != nil {
            path.removeFirst()
        }
        guard !path.isEmpty else { return nil }
        if let location = parseHash(url.fragment) {
            return TerminalTappedFile(pathText: path, line: location.line, column: location.column)
        }
        let encodedPath = URLComponents(string: rawValue)?.percentEncodedPath ?? ""
        guard encodedPath.range(of: "%3a", options: [.caseInsensitive]) == nil else {
            return TerminalTappedFile(pathText: path, line: nil, column: nil)
        }
        return parseTrailingLocation(path)
            ?? TerminalTappedFile(pathText: path, line: nil, column: nil)
    }

    private static func parseTrailingLocation(_ value: String) -> TerminalTappedFile? {
        let pattern = #"^(.*?):([0-9]+)(?::([0-9]+))?$"#
        guard let expression = try? NSRegularExpression(pattern: pattern),
            let match = expression.firstMatch(
                in: value,
                range: NSRange(value.startIndex..., in: value)
            ),
            let pathRange = Range(match.range(at: 1), in: value),
            let lineRange = Range(match.range(at: 2), in: value),
            !pathRange.isEmpty
        else { return nil }
        let path = String(value[pathRange])
        guard !path.hasSuffix("/"), !path.hasSuffix("\\"),
            let line = Int(value[lineRange]), line > 0
        else { return nil }
        let column: Int?
        if match.range(at: 3).location != NSNotFound,
            let columnRange = Range(match.range(at: 3), in: value),
            let parsed = Int(value[columnRange]), parsed > 0
        {
            column = parsed
        } else {
            column = nil
        }
        return TerminalTappedFile(pathText: path, line: line, column: column)
    }

    private static func parseHash(_ fragment: String?) -> (line: Int, column: Int?)? {
        guard let fragment else { return nil }
        let pattern = #"^L([0-9]+)(?:C([0-9]+))?$"#
        guard
            let expression = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
            let match = expression.firstMatch(
                in: fragment,
                range: NSRange(fragment.startIndex..., in: fragment)
            ),
            let lineRange = Range(match.range(at: 1), in: fragment),
            let line = Int(fragment[lineRange]), line > 0
        else { return nil }
        let column: Int?
        if match.range(at: 2).location != NSNotFound,
            let range = Range(match.range(at: 2), in: fragment),
            let parsed = Int(fragment[range]), parsed > 0
        {
            column = parsed
        } else {
            column = nil
        }
        return (line, column)
    }

    private static func looksLikePath(_ value: String) -> Bool {
        value.range(
            of:
                #"^(?:~[\\/]|[\\/]|\.{1,2}[\\/]|[A-Za-z]:[\\/]|[A-Za-z0-9._-]+[\\/]|(?=[A-Za-z0-9._-]*\.[A-Za-z0-9]))"#,
            options: .regularExpression
        ) != nil
    }

    private static func isLocalHost(_ host: String) -> Bool {
        ["localhost", "127.0.0.1", "::1", "[::1]"].contains(host.lowercased())
    }
}

nonisolated struct TerminalFileOpenRequest: Hashable, Sendable {
    let hostID: String
    let worktreeID: String
    let terminalID: String?
    let cwd: String?
    let tappedFile: TerminalTappedFile
}

nonisolated struct TerminalArtifactSource: Hashable, Sendable {
    let hostID: String
    let worktreeID: String
    let absolutePath: String
    let grantID: String
    let terminalID: String?
    let pathText: String
    let cwd: String?
}

nonisolated enum TerminalFileDestination: Hashable, Sendable {
    case worktree(relativePath: String, absolutePath: String, provider: String)
    case artifact(TerminalArtifactSource)
}

nonisolated struct TerminalArtifactLoad: Sendable {
    let source: TerminalArtifactSource
    let document: WorkspaceFileDocument
}

nonisolated protocol TerminalFileRepository: Sendable {
    func resolveTerminalFile(_ request: TerminalFileOpenRequest) async throws
        -> TerminalFileDestination?
    func openTerminalWorktreeFile(
        for hostID: String,
        worktreeID: String,
        relativePath: String
    ) async throws
    func loadTerminalArtifact(_ source: TerminalArtifactSource) async throws -> TerminalArtifactLoad
    func saveTerminalArtifact(
        _ source: TerminalArtifactSource,
        content: String,
        baseContent: String
    ) async throws -> TerminalArtifactSource
}

nonisolated enum TerminalArtifactError: Error {
    case changedOnHost
    case invalidImage
    case unsupportedBinary
    case unavailable
}
