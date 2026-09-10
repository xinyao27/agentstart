import SwiftUI

struct WorkspaceDiffPane: View {
    let lines: [WorkspaceDiffLine]
    let isTruncated: Bool
    let filePath: String?
    let source: WorkspaceFileDiffSource?
    let commentsModel: WorkspaceDiffCommentsModel?

    init(
        lines: [WorkspaceDiffLine],
        isTruncated: Bool,
        filePath: String? = nil,
        source: WorkspaceFileDiffSource? = nil,
        commentsModel: WorkspaceDiffCommentsModel? = nil
    ) {
        self.lines = lines
        self.isTruncated = isTruncated
        self.filePath = filePath
        self.source = source
        self.commentsModel = commentsModel
    }

    var body: some View {
        if let filePath, let source, let commentsModel {
            WorkspaceDiffCommentsPane(
                lines: lines,
                isTruncated: isTruncated,
                filePath: filePath,
                source: source,
                model: commentsModel
            )
        } else {
            plainDiff
        }
    }

    private var plainDiff: some View {
        GeometryReader { geometry in
            ScrollView([.horizontal, .vertical]) {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(AgentStartInlineDiff.renderLines(lines)) { renderedLine in
                        WorkspaceDiffLineRow(renderedLine: renderedLine, filePath: filePath)
                    }
                    if isTruncated {
                        Text("… diff truncated for mobile preview …")
                            .font(
                                .system(
                                    size: Theme.Typography.code,
                                    design: .monospaced
                                )
                            )
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .padding(
                                .leading,
                                AgentStartDiffCodeLayout.indicatorWidth
                                    + AgentStartDiffCodeLayout.prefixWidth
                                    + AgentStartDiffCodeLayout.lineNumberWidth
                                    + AgentStartDiffCodeLayout.lineNumberTrailing
                                    + AgentStartDiffCodeLayout.dividerWidth
                                    + AgentStartDiffCodeLayout.codeHorizontalPadding
                            )
                            .padding(.vertical, 4)
                    }
                }
                .frame(
                    minWidth: geometry.size.width,
                    minHeight: geometry.size.height,
                    alignment: .topLeading
                )
                .padding(.vertical, 8)
            }
            .background(Theme.Colors.diffCodeCanvas)
        }
        .background(Theme.Colors.diffCodeCanvas)
    }
}

private struct WorkspaceDiffLineRow: View {
    let renderedLine: AgentStartDiffRenderLine
    let filePath: String?

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            AgentStartDiffCodeGutter(kind: line.kind, lineNumber: lineNumber, tintPrefix: true)
            AgentStartDiffSyntaxText(
                text: line.text,
                filePath: filePath,
                inlineSegments: renderedLine.inlineSegments,
                emphasisColor: agentstartDiffEmphasisColor(line.kind)
            )
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .font(.system(size: AgentStartDiffCodeLayout.codeFontSize, design: .monospaced))
            .padding(.horizontal, AgentStartDiffCodeLayout.codeHorizontalPadding)
        }
        .frame(minHeight: AgentStartDiffCodeLayout.minimumLineHeight, alignment: .topLeading)
        .background(agentstartDiffBackground(line.kind))
    }

    private var line: WorkspaceDiffLine { renderedLine.line }

    private var lineNumber: String {
        (line.newLineNumber ?? line.oldLineNumber).map(String.init) ?? ""
    }
}
