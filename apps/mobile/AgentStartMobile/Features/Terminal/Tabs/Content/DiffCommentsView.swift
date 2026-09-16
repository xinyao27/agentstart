import SwiftUI

struct WorkspaceDiffCommentsPane: View {
    let lines: [WorkspaceDiffLine]
    let isTruncated: Bool
    let filePath: String
    let source: WorkspaceFileDiffSource
    @Bindable var model: WorkspaceDiffCommentsModel
    @State private var activeCommentLine: Int?
    @State private var commentDraft = ""

    var body: some View {
        VStack(spacing: 0) {
            WorkspaceDiffCommentsBar(model: model)
            GeometryReader { geometry in
                ScrollView([.horizontal, .vertical]) {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(AgentStartInlineDiff.renderLines(lines)) { renderedLine in
                            WorkspaceDiffCommentLine(
                                renderedLine: renderedLine,
                                filePath: filePath,
                                comments: comments(for: renderedLine.line),
                                activeCommentLine: activeCommentLine,
                                commentDraft: $commentDraft,
                                isBusy: model.isBusy,
                                startComment: startComment,
                                cancelComment: cancelComment,
                                saveComment: saveComment,
                                deleteComment: { comment in Task { await model.delete(comment) } }
                            )
                        }
                        if isTruncated {
                            Text("… diff truncated for mobile preview …")
                                .font(
                                    Theme.Typography.code
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
        }
        .background(Theme.Colors.diffCodeCanvas)
        .task { await model.load() }
        .alert(
            "Review notes",
            isPresented: Binding(
                get: { model.errorMessage != nil || model.feedbackMessage != nil },
                set: { if !$0 { model.dismissMessage() } }
            )
        ) {
            Button("OK", action: model.dismissMessage)
        } message: {
            Text(verbatim: model.errorMessage ?? model.feedbackMessage ?? "")
        }
        .sheet(isPresented: $model.isShowingSend) {
            WorkspaceDiffNotesSendSheet(model: model)
        }
    }

    private func comments(for line: WorkspaceDiffLine) -> [SourceReviewComment] {
        guard let lineNumber = line.newLineNumber else { return [] }
        return model.comments.filter {
            $0.filePath == filePath && $0.source != "markdown" && $0.lineNumber == lineNumber
        }
    }

    private func startComment(_ line: Int) {
        activeCommentLine = line
        commentDraft = ""
    }

    private func cancelComment() {
        activeCommentLine = nil
        commentDraft = ""
    }

    private func saveComment(_ line: Int) {
        Task {
            if await model.add(
                filePath: filePath,
                lineNumber: line,
                body: commentDraft,
                source: source
            ) {
                cancelComment()
            }
        }
    }
}

private struct WorkspaceDiffCommentsBar: View {
    @Bindable var model: WorkspaceDiffCommentsModel

    var body: some View {
        HStack(spacing: Theme.Spacing.small) {
            AgentStartIcon(.chat, size: 16)
                .foregroundStyle(Theme.Colors.mutedForeground)
            Text(commentLabel)
                .font(Theme.Typography.metadata.weight(.regular))
                .foregroundStyle(Theme.Colors.mutedForeground)
            Spacer(minLength: Theme.Spacing.small)
            // Why: the bar below draws this region's one glass surface, so its actions are solid
            // chips on top of it. A `.glass` / `.glassProminent` button inside a glass panel
            // renders a second blur and a second shadow in the same place, which is what the
            // browser action bar already stopped doing.
            WorkspaceDiffNotesAction(
                "Copy",
                iconID: .copy,
                isPrimary: false,
                isDisabled: model.comments.isEmpty || model.isBusy
            ) {
                model.copyNotes()
            }
            WorkspaceDiffNotesAction(
                "Send",
                iconID: .upload,
                isPrimary: true,
                isDisabled: model.unsentComments.isEmpty || model.isBusy
            ) {
                model.isShowingSend = true
            }
        }
        .padding(.horizontal, Theme.Spacing.standard)
        .padding(.vertical, Theme.Spacing.small)
        .glassEffect(.regular, in: .rect(cornerRadius: Theme.Radius.control))
        .padding(.horizontal, Theme.Spacing.small)
        .padding(.top, Theme.Spacing.small)
    }

    private var commentLabel: String {
        switch model.comments.count {
        case 0: "No review notes"
        case 1: "1 review note"
        default: "\(model.comments.count) review notes"
        }
    }
}

/// The solid action chip used inside a surface that already draws the region's glass.
private struct WorkspaceDiffNotesAction: View {
    let title: LocalizedStringKey
    let iconID: AgentStartIconID
    let isPrimary: Bool
    let isDisabled: Bool
    let action: () -> Void

    init(
        _ title: LocalizedStringKey,
        iconID: AgentStartIconID,
        isPrimary: Bool,
        isDisabled: Bool,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.iconID = iconID
        self.isPrimary = isPrimary
        self.isDisabled = isDisabled
        self.action = action
    }

    var body: some View {
        Button(title, iconID: iconID, action: action)
            .font(Theme.Typography.metadata)
            // Why: a solid primary inverts the label, matching the browser bar's solid circular
            // send button rather than introducing a third surface treatment.
            .foregroundStyle(isPrimary ? Theme.Colors.background : Theme.Colors.foreground)
            .padding(.horizontal, Theme.Spacing.medium)
            .frame(minHeight: Theme.Control.regularHeight)
            .background(
                isPrimary ? Theme.Colors.foreground : Theme.Colors.keycap,
                in: .rect(cornerRadius: Theme.Radius.control)
            )
            .buttonStyle(.appPlain)
            .appButtonContext(.regular)
            .disabled(isDisabled)
    }
}

private struct WorkspaceDiffCommentLine: View {
    let renderedLine: AgentStartDiffRenderLine
    let filePath: String
    let comments: [SourceReviewComment]
    let activeCommentLine: Int?
    let commentDraft: Binding<String>
    let isBusy: Bool
    let startComment: (Int) -> Void
    let cancelComment: () -> Void
    let saveComment: (Int) -> Void
    let deleteComment: (SourceReviewComment) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top, spacing: 0) {
                AgentStartDiffCodeGutter(kind: line.kind, lineNumber: lineNumber, tintPrefix: true)
                AgentStartDiffSyntaxText(
                    text: line.text,
                    filePath: filePath,
                    inlineSegments: renderedLine.inlineSegments,
                    emphasisColor: agentstartDiffEmphasisColor(line.kind)
                )
                .textSelection(.enabled)
                .frame(
                    maxWidth: .infinity, minHeight: AgentStartDiffCodeLayout.minimumLineHeight,
                    alignment: .topLeading
                )
                .font(.system(size: AgentStartDiffCodeLayout.codeFontSize, design: .monospaced))
                .padding(.horizontal, AgentStartDiffCodeLayout.codeHorizontalPadding)
                if let lineNumber = line.newLineNumber {
                    GlassIconButton(
                        iconName: .add,
                        accessibilityLabel: "Add note on line \(lineNumber)",
                        context: .inline,
                        isDisabled: isBusy
                    ) { startComment(lineNumber) }
                }
            }
            .background(agentstartDiffBackground(line.kind))

            ForEach(comments) { comment in
                commentView(comment)
            }
            if let lineNumber = line.newLineNumber, activeCommentLine == lineNumber {
                composer(lineNumber)
            }
        }
        .padding(.horizontal, Theme.Spacing.small)
    }

    private func commentView(_ comment: SourceReviewComment) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.small) {
            HStack(spacing: Theme.Spacing.small) {
                AgentStartIcon(.chat, size: 14)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                Text("Line \(comment.lineNumber)")
                    .font(Theme.Typography.metadata.weight(.regular))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                Spacer(minLength: 4)
                GlassIconButton(
                    iconName: .x,
                    accessibilityLabel: "Delete note on line \(comment.lineNumber)",
                    context: .inline,
                    isDestructive: true,
                    isDisabled: isBusy
                ) { deleteComment(comment) }
            }
            Text(verbatim: comment.body)
                .font(Theme.Typography.metadata)
                .foregroundStyle(Theme.Colors.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Theme.Spacing.medium)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Colors.content, in: .rect(cornerRadius: Theme.Radius.control))
    }

    private func composer(_ lineNumber: Int) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.small) {
            TextEditor(text: commentDraft)
                .font(Theme.Typography.code)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 80)
                .padding(Theme.Spacing.small)
                .background(
                    Theme.Colors.content,
                    in: .rect(cornerRadius: Theme.Radius.control)
                )
            HStack {
                Spacer(minLength: 0)
                // Why: no glass layer here. This composer sits inside the diff editor surface, so
                // the field is a solid content box and its actions are solid chips — wrapping the
                // whole thing in glass and then putting glass buttons inside it drew two blurs.
                WorkspaceDiffNotesAction(
                    "Cancel",
                    iconID: .x,
                    isPrimary: false,
                    isDisabled: false
                ) {
                    cancelComment()
                }
                WorkspaceDiffNotesAction(
                    "Save note",
                    iconID: .check,
                    isPrimary: true,
                    isDisabled: commentDraft.wrappedValue
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                        .isEmpty || isBusy
                ) {
                    saveComment(lineNumber)
                }
            }
        }
        .padding(Theme.Spacing.medium)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var line: WorkspaceDiffLine { renderedLine.line }

    private var lineNumber: String {
        (line.newLineNumber ?? line.oldLineNumber).map(String.init) ?? ""
    }
}

struct WorkspaceDiffNotesSendSheet: View {
    @Bindable var model: WorkspaceDiffCommentsModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if model.isLoadingTerminals {
                        HStack(spacing: 8) {
                            AgentStartLoader(size: Theme.Control.inlineIcon)
                            Text("Loading agent sessions…")
                        }
                    } else {
                        ForEach(model.terminals ?? []) { terminal in
                            Button {
                                Task {
                                    if await model.sendNotes(to: terminal) { dismiss() }
                                }
                            } label: {
                                Label(terminal.title, iconID: .terminal)
                            }
                            .disabled(model.isBusy)
                        }
                        Button("New Agent Session", iconID: .add) {
                            Task {
                                if await model.sendNotes(to: nil) { dismiss() }
                            }
                        }
                        .disabled(model.isBusy)
                    }
                } header: {
                    Text("\(model.unsentComments.count) unsent notes")
                }
                Button("Copy Notes", iconID: .copy) {
                    model.copyNotes()
                    dismiss()
                }
                .disabled(model.comments.isEmpty || model.isBusy)
            }
            .navigationTitle("Send Review Notes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                SheetDismissToolbarItem(accessibilityLabel: "Close send review notes") {
                    model.isShowingSend = false
                    dismiss()
                }
            }
            .task { await model.loadTerminals() }
        }
        // Why: matches the other NavigationStack list sheets — no drag handle,
        // sized to page.
        .appSheetPresentation(.page)
    }
}
