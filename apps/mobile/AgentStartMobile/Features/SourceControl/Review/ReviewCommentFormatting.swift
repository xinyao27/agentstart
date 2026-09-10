import Foundation

nonisolated func formatSourceReviewComments(_ comments: [SourceReviewComment]) -> String {
    comments.map(formatSourceReviewComment).joined(separator: "\n\n")
}

nonisolated func formatSourceReviewComment(_ comment: SourceReviewComment) -> String {
    let escaped = comment.body
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\"", with: "\\\"")
        .replacingOccurrences(of: "\r", with: "\\r")
        .replacingOccurrences(of: "\n", with: "\\n")
    let location: String
    if comment.lineNumber == 0 {
        location = "Scope: file"
    } else if let startLine = comment.startLine, startLine != comment.lineNumber {
        location = "Lines: \(startLine)-\(comment.lineNumber)"
    } else {
        location = "Line: \(comment.lineNumber)"
    }
    let source = comment.source == "markdown" ? "Source: markdown\n" : ""
    return "File: \(comment.filePath)\n\(source)\(location)\nUser comment: \"\(escaped)\""
}
