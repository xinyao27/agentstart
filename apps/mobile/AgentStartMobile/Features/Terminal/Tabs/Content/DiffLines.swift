import Foundation

nonisolated struct WorkspaceDiffBuildResult: Sendable {
    let lines: [WorkspaceDiffLine]
    let isTruncated: Bool
}

nonisolated enum WorkspaceDiffBuilder {
    private static let maximumTableCells = 200_000
    private static let maximumRenderedLines = 2_500
    private static let maximumBuiltLines = maximumRenderedLines + 1

    static func build(originalContent: String, modifiedContent: String) -> WorkspaceDiffBuildResult
    {
        let originalLines = splitLines(originalContent)
        let modifiedLines = splitLines(modifiedContent)
        let cells = originalLines.count.multipliedReportingOverflow(by: modifiedLines.count)
        let lines =
            if !cells.overflow, cells.partialValue <= maximumTableCells {
                buildLongestCommonSubsequence(originalLines, modifiedLines)
            } else {
                buildPrefixSuffix(originalLines, modifiedLines)
            }
        guard lines.count > maximumRenderedLines else {
            return WorkspaceDiffBuildResult(lines: lines, isTruncated: false)
        }
        return WorkspaceDiffBuildResult(
            lines: Array(lines.prefix(maximumRenderedLines)),
            isTruncated: true
        )
    }

    private static func splitLines(_ content: String) -> [String] {
        guard !content.isEmpty else { return [] }
        var lines = content.split(separator: "\n", omittingEmptySubsequences: false).map { line in
            line.last == "\r" ? String(line.dropLast()) : String(line)
        }
        if content.last == "\n" { lines.removeLast() }
        return lines
    }

    private static func buildLongestCommonSubsequence(
        _ original: [String],
        _ modified: [String]
    ) -> [WorkspaceDiffLine] {
        let rowWidth = modified.count + 1
        var table = [UInt32](repeating: 0, count: (original.count + 1) * rowWidth)
        for originalIndex in original.indices.reversed() {
            for modifiedIndex in modified.indices.reversed() {
                let offset = originalIndex * rowWidth + modifiedIndex
                if original[originalIndex] == modified[modifiedIndex] {
                    table[offset] = table[(originalIndex + 1) * rowWidth + modifiedIndex + 1] + 1
                } else {
                    table[offset] = max(
                        table[(originalIndex + 1) * rowWidth + modifiedIndex],
                        table[originalIndex * rowWidth + modifiedIndex + 1]
                    )
                }
            }
        }

        var lines: [WorkspaceDiffLine] = []
        var originalIndex = 0
        var modifiedIndex = 0
        while originalIndex < original.count, modifiedIndex < modified.count {
            if original[originalIndex] == modified[modifiedIndex] {
                guard
                    append(
                        WorkspaceDiffLine(
                            kind: .context,
                            text: original[originalIndex],
                            oldLineNumber: originalIndex + 1,
                            newLineNumber: modifiedIndex + 1
                        ),
                        to: &lines
                    )
                else { return lines }
                originalIndex += 1
                modifiedIndex += 1
            } else if table[(originalIndex + 1) * rowWidth + modifiedIndex]
                >= table[originalIndex * rowWidth + modifiedIndex + 1]
            {
                guard
                    append(
                        WorkspaceDiffLine(
                            kind: .delete,
                            text: original[originalIndex],
                            oldLineNumber: originalIndex + 1,
                            newLineNumber: nil
                        ),
                        to: &lines
                    )
                else { return lines }
                originalIndex += 1
            } else {
                guard
                    append(
                        WorkspaceDiffLine(
                            kind: .add,
                            text: modified[modifiedIndex],
                            oldLineNumber: nil,
                            newLineNumber: modifiedIndex + 1
                        ),
                        to: &lines
                    )
                else { return lines }
                modifiedIndex += 1
            }
        }
        while originalIndex < original.count {
            guard
                append(
                    WorkspaceDiffLine(
                        kind: .delete,
                        text: original[originalIndex],
                        oldLineNumber: originalIndex + 1,
                        newLineNumber: nil
                    ),
                    to: &lines
                )
            else { return lines }
            originalIndex += 1
        }
        while modifiedIndex < modified.count {
            guard
                append(
                    WorkspaceDiffLine(
                        kind: .add,
                        text: modified[modifiedIndex],
                        oldLineNumber: nil,
                        newLineNumber: modifiedIndex + 1
                    ),
                    to: &lines
                )
            else { return lines }
            modifiedIndex += 1
        }
        return lines
    }

    private static func buildPrefixSuffix(
        _ original: [String],
        _ modified: [String]
    ) -> [WorkspaceDiffLine] {
        var prefixCount = 0
        while prefixCount < original.count, prefixCount < modified.count,
            original[prefixCount] == modified[prefixCount]
        {
            prefixCount += 1
        }
        var suffixCount = 0
        while suffixCount + prefixCount < original.count,
            suffixCount + prefixCount < modified.count,
            original[original.count - suffixCount - 1] == modified[modified.count - suffixCount - 1]
        {
            suffixCount += 1
        }

        var lines: [WorkspaceDiffLine] = []
        for index in 0..<prefixCount {
            guard
                append(
                    WorkspaceDiffLine(
                        kind: .context,
                        text: original[index],
                        oldLineNumber: index + 1,
                        newLineNumber: index + 1
                    ),
                    to: &lines
                )
            else { return lines }
        }
        for index in prefixCount..<original.count - suffixCount {
            guard
                append(
                    WorkspaceDiffLine(
                        kind: .delete,
                        text: original[index],
                        oldLineNumber: index + 1,
                        newLineNumber: nil
                    ),
                    to: &lines
                )
            else { return lines }
        }
        for index in prefixCount..<modified.count - suffixCount {
            guard
                append(
                    WorkspaceDiffLine(
                        kind: .add,
                        text: modified[index],
                        oldLineNumber: nil,
                        newLineNumber: index + 1
                    ),
                    to: &lines
                )
            else { return lines }
        }
        for index in original.count - suffixCount..<original.count {
            let modifiedIndex =
                modified.count - suffixCount + index - (original.count - suffixCount)
            guard
                append(
                    WorkspaceDiffLine(
                        kind: .context,
                        text: original[index],
                        oldLineNumber: index + 1,
                        newLineNumber: modifiedIndex + 1
                    ),
                    to: &lines
                )
            else { return lines }
        }
        return lines
    }

    private static func append(
        _ line: WorkspaceDiffLine,
        to lines: inout [WorkspaceDiffLine]
    ) -> Bool {
        lines.append(line)
        return lines.count < maximumBuiltLines
    }
}
