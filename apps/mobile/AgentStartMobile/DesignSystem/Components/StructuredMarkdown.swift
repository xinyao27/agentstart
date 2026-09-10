import SwiftUI
import Textual

struct AppStructuredMarkdown: View {
    let content: String
    var fontSize: CGFloat = 17
    var supportsMath = true

    var body: some View {
        // Why: mermaid fences render as live diagrams (MermaidDiagramView), which Textual's
        // per-block CodeBlockStyle can't drive since it only receives already-formatted content,
        // not the block's raw source. Splitting mermaid fences out before handing the rest to
        // StructuredText keeps every other fence on Textual's normal code-block rendering.
        let segments = splitMermaidSegments(normalizedContent)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(segments.indices, id: \.self) { index in
                segmentView(segments[index])
            }
        }
    }

    @ViewBuilder
    private func segmentView(_ segment: MarkdownSegment) -> some View {
        switch segment {
        case .text(let text):
            StructuredText(
                markdown: text,
                syntaxExtensions: supportsMath ? [.math] : []
            )
            .font(.system(size: fontSize))
            .foregroundStyle(Theme.Colors.foreground)
            .textual.headingStyle(AppStructuredMarkdownHeadingStyle())
            .textual.overflowMode(.wrap)
            .textual.textSelection(.enabled)
        case .mermaid(let source):
            MermaidDiagramView(source: source, fontSize: fontSize)
        }
    }

    private var normalizedContent: String {
        var output: [String] = []
        var mathLines: [String]?
        for line in content.components(separatedBy: "\n") {
            guard line.trimmingCharacters(in: .whitespaces) == "$$" else {
                if mathLines != nil {
                    mathLines?.append(line)
                } else {
                    output.append(line)
                }
                continue
            }
            if let collectedLines = mathLines {
                output.append("$$\(collectedLines.joined(separator: "\n"))$$")
                mathLines = nil
            } else {
                mathLines = []
            }
        }
        if let mathLines {
            output.append("$$")
            output.append(contentsOf: mathLines)
        }
        return output.joined(separator: "\n")
    }

}

private struct AppStructuredMarkdownHeadingStyle: StructuredText.HeadingStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .fontWeight(.bold)
            .textual.lineSpacing(.fontScaled(0.35))
            .textual.blockSpacing(.fontScaled(top: 0.5, bottom: 0.5))
    }
}

private enum MarkdownSegment: Equatable {
    case text(String)
    case mermaid(String)
}

private let markdownFenceMarker = "```"

// Splits unindented ``` fences tagged `mermaid` out of the raw markdown, leaving every other
// fence untouched for StructuredText. The fence must start the line, and the lowercased language
// hint is everything after the backticks.
private func splitMermaidSegments(_ content: String) -> [MarkdownSegment] {
    let lines = content.components(separatedBy: "\n")
    var segments: [MarkdownSegment] = []
    var textLines: [String] = []
    var index = 0

    func flushText() {
        guard !textLines.isEmpty else { return }
        segments.append(.text(textLines.joined(separator: "\n")))
        textLines = []
    }

    while index < lines.count {
        let line = lines[index]
        let languageHint =
            line.hasPrefix(markdownFenceMarker)
            ? line.dropFirst(markdownFenceMarker.count)
                .trimmingCharacters(in: .whitespaces)
                .lowercased()
            : nil
        guard languageHint == "mermaid" else {
            textLines.append(line)
            index += 1
            continue
        }

        index += 1
        var body: [String] = []
        while index < lines.count, !lines[index].hasPrefix(markdownFenceMarker) {
            body.append(lines[index])
            index += 1
        }
        index += 1  // Consume the closing fence, or stop at EOF if it never closed.
        flushText()
        segments.append(.mermaid(body.joined(separator: "\n")))
    }
    flushText()
    return segments
}
