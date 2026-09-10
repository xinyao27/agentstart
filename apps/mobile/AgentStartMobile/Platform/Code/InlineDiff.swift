import Foundation

nonisolated struct AgentStartDiffInlineSegment: Sendable, Equatable {
    let text: String
    let isEmphasized: Bool
}

nonisolated struct AgentStartDiffRenderLine: Identifiable, Sendable {
    let id: Int
    let line: WorkspaceDiffLine
    let inlineSegments: [AgentStartDiffInlineSegment]
}

nonisolated enum AgentStartInlineDiff {
    private struct Token: Equatable {
        let value: String
    }

    static func renderLines(_ lines: [WorkspaceDiffLine]) -> [AgentStartDiffRenderLine] {
        var result = lines.enumerated().map { index, line in
            AgentStartDiffRenderLine(
                id: index,
                line: line,
                inlineSegments: [AgentStartDiffInlineSegment(text: line.text, isEmphasized: false)]
            )
        }

        var cursor = 0
        while cursor < lines.count {
            guard lines[cursor].kind == .delete else {
                cursor += 1
                continue
            }

            let deletionStart = cursor
            while cursor < lines.count, lines[cursor].kind == .delete { cursor += 1 }
            let deletionEnd = cursor
            let additionStart = cursor
            while cursor < lines.count, lines[cursor].kind == .add { cursor += 1 }
            let additionEnd = cursor
            let pairCount = min(deletionEnd - deletionStart, additionEnd - additionStart)
            guard pairCount > 0 else { continue }

            for offset in 0..<pairCount {
                let oldText = lines[deletionStart + offset].text
                let newText = lines[additionStart + offset].text
                result[deletionStart + offset] = AgentStartDiffRenderLine(
                    id: deletionStart + offset,
                    line: lines[deletionStart + offset],
                    inlineSegments: segments(oldText, comparedWith: newText)
                )
                result[additionStart + offset] = AgentStartDiffRenderLine(
                    id: additionStart + offset,
                    line: lines[additionStart + offset],
                    inlineSegments: segments(newText, comparedWith: oldText)
                )
            }
        }

        return result
    }

    static func segments(_ value: String, comparedWith other: String)
        -> [AgentStartDiffInlineSegment]
    {
        guard !value.isEmpty else { return [] }
        let left = tokenize(value)
        let right = tokenize(other)
        guard !left.isEmpty, !right.isEmpty else {
            return [AgentStartDiffInlineSegment(text: value, isEmphasized: true)]
        }
        guard left.count <= 240, right.count <= 240 else {
            return [AgentStartDiffInlineSegment(text: value, isEmphasized: value != other)]
        }

        let width = right.count + 1
        var table = [UInt16](repeating: 0, count: (left.count + 1) * width)
        for leftIndex in left.indices.reversed() {
            for rightIndex in right.indices.reversed() {
                let offset = leftIndex * width + rightIndex
                table[offset] =
                    left[leftIndex] == right[rightIndex]
                    ? table[(leftIndex + 1) * width + rightIndex + 1] + 1
                    : max(
                        table[(leftIndex + 1) * width + rightIndex],
                        table[leftIndex * width + rightIndex + 1]
                    )
            }
        }

        var changed = Array(repeating: true, count: left.count)
        var leftIndex = 0
        var rightIndex = 0
        while leftIndex < left.count, rightIndex < right.count {
            if left[leftIndex] == right[rightIndex] {
                changed[leftIndex] = false
                leftIndex += 1
                rightIndex += 1
            } else if table[(leftIndex + 1) * width + rightIndex]
                >= table[leftIndex * width + rightIndex + 1]
            {
                leftIndex += 1
            } else {
                rightIndex += 1
            }
        }

        var result: [AgentStartDiffInlineSegment] = []
        for (index, token) in left.enumerated() {
            append(
                AgentStartDiffInlineSegment(text: token.value, isEmphasized: changed[index]),
                to: &result
            )
        }
        return result
    }

    private static func tokenize(_ value: String) -> [Token] {
        var tokens: [Token] = []
        var current = ""
        var currentClass: TokenClass?

        for character in value {
            let nextClass = TokenClass(character)
            if currentClass != nextClass, !current.isEmpty {
                tokens.append(Token(value: current))
                current = ""
            }
            currentClass = nextClass
            current.append(character)
        }
        if !current.isEmpty { tokens.append(Token(value: current)) }
        return tokens
    }

    private enum TokenClass: Equatable {
        case word
        case whitespace
        case punctuation

        init(_ character: Character) {
            if character.isWhitespace {
                self = .whitespace
            } else if character.isLetter || character.isNumber || character == "_" {
                self = .word
            } else {
                self = .punctuation
            }
        }
    }

    private static func append(
        _ segment: AgentStartDiffInlineSegment,
        to result: inout [AgentStartDiffInlineSegment]
    ) {
        guard !segment.text.isEmpty else { return }
        if result.last?.isEmphasized == segment.isEmphasized {
            let previous = result.removeLast()
            result.append(
                AgentStartDiffInlineSegment(
                    text: previous.text + segment.text,
                    isEmphasized: segment.isEmphasized
                )
            )
        } else {
            result.append(segment)
        }
    }
}
