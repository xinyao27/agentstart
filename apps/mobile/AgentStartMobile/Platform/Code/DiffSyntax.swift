import SwiftUI
import UIKit

nonisolated enum AgentStartDiffSyntaxToken: Sendable, Equatable {
    case plain
    case comment
    case keyword
    case string
    case number
    case type
    case function
    case property
}

nonisolated struct AgentStartDiffSyntaxSegment: Sendable {
    let text: String
    let token: AgentStartDiffSyntaxToken
}

// Why: the per-language rule tables (keyword sets, comment styles, extension/filename
// mapping) live in DiffSyntaxLanguages.swift so this file stays the scanning engine —
// they're the seam that grows every time a language is added, this file is the seam that
// doesn't.
nonisolated enum AgentStartDiffSyntax {
    static func segments(for text: String, filePath: String?) -> [AgentStartDiffSyntaxSegment] {
        let language = language(for: filePath)
        guard language != .plain else {
            return [AgentStartDiffSyntaxSegment(text: text, token: .plain)]
        }

        let characters = Array(text)
        var result: [AgentStartDiffSyntaxSegment] = []
        var index = 0
        while index < characters.count {
            if commentLength(at: index, in: characters, language: language) > 0 {
                append(
                    String(characters[index...]),
                    token: .comment,
                    to: &result
                )
                break
            }

            let character = characters[index]
            if character == "\"" || character == "'" || character == "`" {
                let end = quotedEnd(from: index, in: characters, quote: character)
                append(
                    String(characters[index..<end]),
                    token: .string,
                    to: &result
                )
                index = end
                continue
            }

            if character.isNumber {
                let end = numberEnd(from: index, in: characters)
                append(
                    String(characters[index..<end]),
                    token: .number,
                    to: &result
                )
                index = end
                continue
            }

            if isIdentifierStart(character) {
                let end = identifierEnd(from: index, in: characters)
                let value = String(characters[index..<end])
                let token = classify(
                    value,
                    startingAt: index,
                    endingAt: end,
                    characters: characters,
                    language: language
                )
                append(value, token: token, to: &result)
                index = end
                continue
            }

            append(String(character), token: .plain, to: &result)
            index += 1
        }
        return result
    }

    private static func classify(
        _ value: String,
        startingAt start: Int,
        endingAt end: Int,
        characters: [Character],
        language: Language
    ) -> AgentStartDiffSyntaxToken {
        if keywords(for: language).contains(value) { return .keyword }
        if literals(for: language).contains(value) { return .keyword }
        if isProperty(at: end, in: characters, language: language) { return .property }
        if language == .yaml,
            isYamlValue(startingAt: start, in: characters)
        {
            return .string
        }
        if nextNonWhitespace(at: end, in: characters) == "(" { return .function }
        if value.first?.isUppercase == true, value.count > 1 { return .type }
        return .plain
    }

    private static func quotedEnd(from start: Int, in characters: [Character], quote: Character)
        -> Int
    {
        var index = start + 1
        while index < characters.count {
            if characters[index] == "\\" {
                index += 2
                continue
            }
            if characters[index] == quote { return index + 1 }
            index += 1
        }
        return characters.count
    }

    private static func numberEnd(from start: Int, in characters: [Character]) -> Int {
        var index = start
        while index < characters.count,
            characters[index].isNumber || characters[index] == "." || characters[index] == "_"
        { index += 1 }
        return index
    }

    private static func identifierEnd(from start: Int, in characters: [Character]) -> Int {
        var index = start
        while index < characters.count, isIdentifierPart(characters[index]) { index += 1 }
        return index
    }

    private static func isIdentifierStart(_ character: Character) -> Bool {
        character == "_" || character == "$" || character.isLetter
    }

    private static func isIdentifierPart(_ character: Character) -> Bool {
        isIdentifierStart(character) || character.isNumber
    }

    private static func isProperty(at index: Int, in characters: [Character], language: Language)
        -> Bool
    {
        guard language == .yaml || language == .json else { return false }
        var cursor = index
        while cursor < characters.count, characters[cursor].isWhitespace { cursor += 1 }
        guard cursor < characters.count else { return false }
        if language == .yaml {
            while cursor < characters.count, characters[cursor] == "-" {
                cursor += 1
                while cursor < characters.count, isIdentifierPart(characters[cursor]) {
                    cursor += 1
                }
                while cursor < characters.count, characters[cursor].isWhitespace { cursor += 1 }
            }
        }
        return cursor < characters.count && characters[cursor] == ":"
    }

    private static func isYamlValue(startingAt start: Int, in characters: [Character]) -> Bool {
        var cursor = start
        while cursor > 0, characters[cursor - 1] != "\n" { cursor -= 1 }
        while cursor < start, characters[cursor].isWhitespace { cursor += 1 }
        while cursor < start {
            if characters[cursor] == ":" { return true }
            cursor += 1
        }
        return false
    }

    private static func nextNonWhitespace(at index: Int, in characters: [Character]) -> Character? {
        var cursor = index
        while cursor < characters.count, characters[cursor].isWhitespace { cursor += 1 }
        return cursor < characters.count ? characters[cursor] : nil
    }

    private static func append(
        _ text: String,
        token: AgentStartDiffSyntaxToken,
        to segments: inout [AgentStartDiffSyntaxSegment]
    ) {
        guard !text.isEmpty else { return }
        if segments.last?.token == token {
            let previous = segments.removeLast()
            segments.append(AgentStartDiffSyntaxSegment(text: previous.text + text, token: token))
        } else {
            segments.append(AgentStartDiffSyntaxSegment(text: text, token: token))
        }
    }
}

struct AgentStartDiffSyntaxText: View {
    let text: String
    let filePath: String?
    let inlineSegments: [AgentStartDiffInlineSegment]?
    let emphasisColor: Color?
    let isReview: Bool
    let foregroundOpacity: Double

    init(
        text: String,
        filePath: String?,
        inlineSegments: [AgentStartDiffInlineSegment]? = nil,
        emphasisColor: Color? = nil,
        isReview: Bool = false,
        foregroundOpacity: Double = 1
    ) {
        self.text = text
        self.filePath = filePath
        self.inlineSegments = inlineSegments
        self.emphasisColor = emphasisColor
        self.isReview = isReview
        self.foregroundOpacity = foregroundOpacity
    }

    var body: some View {
        Text(attributedText)
            .font(.system(size: AgentStartDiffCodeLayout.codeFontSize, design: .monospaced))
    }

    private var attributedText: AttributedString {
        let result = styledSegments.reduce(into: AttributedString()) { result, value in
            var segment = AttributedString(value.text)
            segment.foregroundColor = color(for: value.token)
            if value.isEmphasized, let emphasisColor {
                segment.backgroundColor = emphasisColor
            }
            result += segment
        }
        guard let hangingIndentStyle else { return result }
        // Why: iOS marks NSParagraphStyle's Sendable conformance unavailable, so
        // AttributeContainer.paragraphStyle cannot take one without a concurrency
        // diagnostic. NSMutableAttributedString.addAttribute takes `Any` instead, and this
        // branch only runs for lines that actually have leading indentation, so unindented
        // rows keep the plain AttributedString path.
        let indented = NSMutableAttributedString(result)
        indented.addAttribute(
            .paragraphStyle,
            value: hangingIndentStyle,
            range: NSRange(location: 0, length: indented.length)
        )
        return AttributedString(indented)
    }

    // Why: a plain SwiftUI `Text` wraps a long line back to its own frame's left edge, which
    // discards the code's own leading indentation — a deeply nested line's wrapped
    // continuation then lands almost at the gutter, one step from where the un-indented first
    // visual row sits. Measuring the exact monospace advance of the line's leading spaces and
    // feeding it to NSParagraphStyle.headIndent reproduces that indentation as a hanging
    // indent, so every wrapped row lines up under where the code content itself began.
    private var hangingIndentStyle: NSParagraphStyle? {
        let leadingSpaces = text.prefix { $0 == " " }.count
        guard leadingSpaces > 0 else { return nil }
        let font = UIFont.monospacedSystemFont(
            ofSize: AgentStartDiffCodeLayout.codeFontSize, weight: .regular)
        let spaceWidth = (" " as NSString).size(withAttributes: [.font: font]).width
        let style = NSMutableParagraphStyle()
        style.firstLineHeadIndent = 0
        style.headIndent = spaceWidth * CGFloat(leadingSpaces)
        return style
    }

    private var styledSegments:
        [(text: String, token: AgentStartDiffSyntaxToken, isEmphasized: Bool)]
    {
        guard let inlineSegments else {
            return AgentStartDiffSyntax.segments(for: text, filePath: filePath).map {
                (text: $0.text, token: $0.token, isEmphasized: false)
            }
        }
        return inlineSegments.flatMap { inline in
            AgentStartDiffSyntax.segments(for: inline.text, filePath: filePath).map {
                (text: $0.text, token: $0.token, isEmphasized: inline.isEmphasized)
            }
        }
    }

    private func color(for token: AgentStartDiffSyntaxToken) -> Color {
        let color: Color
        switch token {
        case .plain:
            color = isReview ? Theme.Colors.reviewCodePlain : Theme.Colors.diffCodePlain
        case .comment:
            color = isReview ? Theme.Colors.reviewCodeComment : Theme.Colors.diffCodeComment
        case .keyword:
            color = isReview ? Theme.Colors.reviewCodeKeyword : Theme.Colors.diffCodeKeyword
        case .string:
            color = isReview ? Theme.Colors.reviewCodeString : Theme.Colors.diffCodeString
        case .number:
            color = isReview ? Theme.Colors.reviewCodeNumber : Theme.Colors.diffCodeNumber
        case .type:
            color = isReview ? Theme.Colors.reviewCodeType : Theme.Colors.diffCodeType
        case .function:
            color = isReview ? Theme.Colors.reviewCodeFunction : Theme.Colors.diffCodeFunction
        case .property:
            color = isReview ? Theme.Colors.reviewCodeProperty : Theme.Colors.diffCodeProperty
        }
        return color.opacity(foregroundOpacity)
    }
}
