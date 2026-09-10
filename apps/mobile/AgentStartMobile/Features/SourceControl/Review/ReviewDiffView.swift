import SwiftUI

struct SourceReviewDiffView: View {
    @Bindable var model: SourceReviewModel
    let item: SourceReviewItem
    @Binding var activeHunk: Int?

    var body: some View {
        Group {
            switch model.diffPhase {
            case .idle:
                reviewState("Select a file to review.")
            case .loading:
                VStack(spacing: Theme.Spacing.medium) {
                    ProgressView().controlSize(.small)
                    Text("Loading diff…")
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .foregroundStyle(Theme.Colors.mutedForeground)
            case .failed(_, let message):
                reviewState(message, retry: true)
            case .ready(_, let diff):
                diffView(diff)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.reviewCodeCanvas)
    }

    @ViewBuilder
    private func diffView(_ diff: SourceReviewDiff) -> some View {
        switch diff {
        case .binary:
            reviewState("This file cannot be rendered as text on mobile.", title: "Binary Diff")
        case .deleted:
            reviewState(
                "This file was deleted. Add a file note or mark it reviewed.",
                title: "Deleted File"
            )
        case .document(let document):
            switch document {
            case .diff(let lines, let isTruncated):
                VStack(spacing: 0) {
                    // Why: git renders a wholly-deleted file as an ordinary diff where every
                    // line is a deletion — nothing in that rendering says so explicitly, and a
                    // reader has to infer "this file was deleted" from thousands of red lines.
                    // Stating it once, using the file's own status rather than re-scanning the
                    // diff, keeps the fact visible without hiding the actual former content.
                    if item.status == .deleted {
                        deletedFileBanner
                    }
                    SourceReviewLines(
                        lines: lines,
                        isTruncated: isTruncated,
                        filePath: item.filePath,
                        comments: model.currentComments,
                        addNote: model.openComposer,
                        editNote: model.editComment,
                        activeHunk: $activeHunk
                    )
                }
                .id(item.id)
            case .image, .html, .text:
                reviewState(
                    "This file cannot be rendered as text on mobile.",
                    title: "Binary Diff"
                )
            }
        }
    }

    private var deletedFileBanner: some View {
        HStack(spacing: Theme.Spacing.small) {
            AgentStartIcon(.trash, size: Theme.Control.inlineIcon)
                .foregroundStyle(Theme.Colors.mutedForeground)
            Text("This file was deleted.")
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
            Spacer(minLength: Theme.Spacing.small)
        }
        .padding(.horizontal, Theme.Spacing.medium)
        .padding(.vertical, Theme.Spacing.small)
        .background(Theme.Colors.reviewCodeCanvas)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Theme.Colors.rail.opacity(0.6))
                .frame(height: Theme.Size.hairline)
        }
    }

    private func reviewState(
        _ message: String,
        title: LocalizedStringResource? = nil,
        retry: Bool = false
    ) -> some View {
        VStack(spacing: Theme.Spacing.medium) {
            if let title {
                Text(title).font(.system(size: Theme.Typography.supporting, weight: .semibold))
            }
            Text(verbatim: message)
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .multilineTextAlignment(.center)
            if retry {
                Button("Try again") { Task { await model.loadCurrentDiff() } }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
            }
        }
        .padding(Theme.Spacing.extraLarge)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct SourceReviewLines: View {
    let lines: [WorkspaceDiffLine]
    let isTruncated: Bool
    let filePath: String
    let comments: [SourceReviewComment]
    let addNote: (Int) -> Void
    let editNote: (SourceReviewComment) -> Void
    @Binding var activeHunk: Int?

    var body: some View {
        let hunks = sourceReviewHunkStarts(lines)
        VStack(spacing: 0) {
            GeometryReader { geometry in
                ScrollViewReader { proxy in
                    ScrollView([.horizontal, .vertical]) {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(AgentStartInlineDiff.renderLines(lines)) { renderedLine in
                                SourceReviewLine(
                                    renderedLine: renderedLine,
                                    filePath: filePath,
                                    comments: comments.filter { comment in
                                        renderedLine.line.newLineNumber.map {
                                            $0 == comment.lineNumber
                                        }
                                            == true
                                    },
                                    addNote: addNote,
                                    editNote: editNote
                                )
                                .id(renderedLine.id)
                            }
                            if isTruncated {
                                Text("Diff truncated for mobile preview.")
                                    .font(
                                        .system(
                                            size: Theme.Typography.code,
                                            design: .monospaced
                                        )
                                    )
                                    .foregroundStyle(Theme.Colors.mutedForeground)
                                    .padding(Theme.Spacing.medium)
                            }
                        }
                        // Why: a two-axis SwiftUI ScrollView centers a short LazyVStack; a diff
                        // must start at the content edge, not float mid-viewport.
                        .frame(
                            minWidth: geometry.size.width,
                            minHeight: geometry.size.height,
                            alignment: .topLeading
                        )
                    }
                    .onChange(of: activeHunk) { _, value in
                        guard let value, hunks.indices.contains(value) else { return }
                        withAnimation(Theme.Motion.stateChange) {
                            proxy.scrollTo(hunks[value], anchor: .top)
                        }
                    }
                }
            }
        }
        .background(Theme.Colors.reviewCodeCanvas)
    }
}

func sourceReviewHunkStarts(_ lines: [WorkspaceDiffLine]) -> [Int] {
    var result: [Int] = []
    var wasChanged = false
    for (index, line) in lines.enumerated() {
        let changed: Bool
        switch line.kind {
        case .context: changed = false
        case .add, .delete: changed = true
        }
        if changed, !wasChanged { result.append(index) }
        wasChanged = changed
    }
    return result
}

private struct SourceReviewLine: View {
    let renderedLine: AgentStartDiffRenderLine
    let filePath: String
    let comments: [SourceReviewComment]
    let addNote: (Int) -> Void
    let editNote: (SourceReviewComment) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            AgentStartDiffCodeGutter(
                kind: line.kind,
                lineNumber: lineNumber,
                minimumHeight: AgentStartDiffCodeLayout.reviewLineHeight,
                isReview: true
            )
            codeCell
            if !comments.isEmpty {
                HStack(spacing: 0) {
                    ForEach(comments) { comment in
                        Button {
                            editNote(comment)
                        } label: {
                            AgentStartIcon(.chat, size: 12)
                                .frame(
                                    width: Theme.Size.minimumHitTarget,
                                    height: Theme.Size.minimumHitTarget
                                )
                        }
                        .buttonStyle(.appPlain)
                        .foregroundStyle(
                            comment.diffIdentity == nil
                                ? Theme.Colors.mutedForeground
                                : Theme.Colors.unread
                        )
                    }
                }
            }
        }
        .font(.system(size: AgentStartDiffCodeLayout.codeFontSize, design: .monospaced))
        .background(agentstartDiffBackground(line.kind, isReview: true))
    }

    private var canComment: Bool {
        guard line.newLineNumber != nil else { return false }
        if case .delete = line.kind { return false }
        return true
    }

    @ViewBuilder
    private var codeCell: some View {
        if canComment {
            Button {
                if let number = line.newLineNumber { addNote(number) }
            } label: {
                codeLabel
                    .contentShape(.rect)
            }
            .buttonStyle(.appPlain)
        } else {
            codeLabel
        }
    }

    private var codeLabel: some View {
        AgentStartDiffSyntaxText(
            text: line.text,
            filePath: filePath,
            inlineSegments: renderedLine.inlineSegments,
            emphasisColor: agentstartDiffEmphasisColor(line.kind, isReview: true),
            isReview: true,
            foregroundOpacity: line.kind == .delete ? 0.5 : 1
        )
        .frame(
            maxWidth: .infinity, minHeight: AgentStartDiffCodeLayout.reviewLineHeight,
            alignment: .leading
        )
        .padding(.horizontal, AgentStartDiffCodeLayout.codeHorizontalPadding)
    }

    private var line: WorkspaceDiffLine { renderedLine.line }

    private var lineNumber: String {
        (line.newLineNumber ?? line.oldLineNumber).map(String.init) ?? ""
    }
}
