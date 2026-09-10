import SwiftUI

struct SourceReviewComposerSheet: View {
    @Bindable var model: SourceReviewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                Text(composerLocation)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                TextEditor(text: $model.composerBody)
                    .font(.system(size: Theme.Typography.supporting))
                    .scrollContentBackground(.hidden)
                    .padding(Theme.Spacing.small)
                    .background(
                        Theme.Colors.content,
                        in: .rect(cornerRadius: Theme.Radius.control)
                    )
                    .overlay {
                        RoundedRectangle(
                            cornerRadius: Theme.Radius.control,
                            style: .continuous
                        )
                        .stroke(Theme.Colors.divider, lineWidth: Theme.Size.hairline)
                    }
            }
            .padding(Theme.Spacing.page)
            .navigationTitle(isEditing ? "Edit Note" : "Add Note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        model.closeComposer()
                        dismiss()
                    }
                }
                if isEditing {
                    ToolbarItem(placement: .bottomBar) {
                        Button("Delete", role: .destructive) {
                            Task {
                                await model.deleteComposerComment()
                                if model.composer == nil { dismiss() }
                            }
                        }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            await model.saveComposer()
                            if model.composer == nil { dismiss() }
                        }
                    }
                    .disabled(
                        model.composerBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .appSheetPresentation(.fixed(.medium))
    }

    private var isEditing: Bool {
        if case .edit = model.composer { return true }
        return false
    }

    private var composerLocation: LocalizedStringResource {
        switch model.composer {
        case .create(let line) where line > 0: "Line \(line)"
        case .create, .edit, nil: "File note"
        }
    }
}

struct SourceReviewActionsSheet: View {
    @Bindable var model: SourceReviewModel
    let showSend: () -> Void
    let openSession: () -> Void
    let confirmDiscard: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Button("Copy Notes", iconID: .copy) {
                    model.copyNotes()
                    dismiss()
                }
                .disabled(model.snapshot?.comments.isEmpty != false)
                Button("Send Unsent Notes", iconID: .upload) { showSend() }
                    .disabled(model.unsentComments.isEmpty)
                Button("Clear Sent Notes", iconID: .trash, role: .destructive) {
                    Task {
                        await model.clearSentNotes()
                        dismiss()
                    }
                }
                .disabled(model.snapshot?.comments.contains(where: { $0.sentAt != nil }) != true)
                Button("Stage Reviewed Files", iconID: .checkCircle) {
                    Task {
                        await model.stageReviewed()
                        dismiss()
                    }
                }
                .disabled(model.reviewedUnstagedCount == 0 || model.busyAction != nil)
                Button("Mark Unreviewed", iconID: .x) {
                    Task {
                        await model.markUnreviewed()
                        dismiss()
                    }
                }
                .disabled(model.currentItem?.isReviewed != true)
                Button("Open in Session", iconID: .fileText) { openSession() }
                    .disabled(model.currentItem?.scope == .branch || model.currentItem == nil)
                // Why: destructive and one tap, so — matching the Source Control fix, which
                // moved this same discard action out of an equal-weight footer button and
                // into `.swipeActions` — it does not sit next to Stage as a peer affordance.
                // A single-file review page has no list row to attach a swipe to, so this
                // sheet (already the file's secondary-action surface) is where it lives
                // instead, one deliberate step away from the primary Stage/Mark Reviewed row.
                Button("Discard File", iconID: .trash, role: .destructive) {
                    dismiss()
                    confirmDiscard()
                }
                .disabled(model.currentItem?.canDiscard != true || model.busyAction != nil)
            }
            .navigationTitle("Review Actions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                SheetDismissToolbarItem(
                    accessibilityLabel: "Close review actions",
                    action: dismiss.callAsFunction
                )
            }
        }
        // Why: matches the other NavigationStack action sheets (Source Control
        // actions) — no drag handle, sized to page.
        .appSheetPresentation(.page)
    }
}

struct SourceReviewSendSheet: View {
    @Bindable var model: SourceReviewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if model.isLoadingTerminals {
                        HStack(spacing: Theme.Spacing.small) {
                            ProgressView().controlSize(.small)
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
                            .disabled(model.busyAction != nil || model.unsentComments.isEmpty)
                        }
                        Button("New Agent Session", iconID: .add) {
                            Task {
                                if await model.sendNotes(to: nil) { dismiss() }
                            }
                        }
                        .disabled(model.busyAction != nil || model.unsentComments.isEmpty)
                    }
                } header: {
                    // Why: plain digit interpolation avoids locale thousands grouping, and the
                    // label pluralizes "note"/"notes" on a count of one.
                    Text(
                        verbatim:
                            "\(model.unsentComments.count) unsent \(model.unsentComments.count == 1 ? "note" : "notes")"
                    )
                }
                Button("Copy Notes", iconID: .copy) {
                    model.copyNotes()
                    dismiss()
                }
                .disabled(model.snapshot?.comments.isEmpty != false)
            }
            .navigationTitle("Send Notes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                SheetDismissToolbarItem(
                    accessibilityLabel: "Close send notes",
                    action: dismiss.callAsFunction
                )
            }
            .task { await model.loadTerminals() }
        }
        // Why: matches the other NavigationStack list sheets — no drag handle,
        // sized to page.
        .appSheetPresentation(.page)
    }
}

struct SourceReviewCompletionSheet: View {
    @Bindable var model: SourceReviewModel
    let showSend: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Theme.Spacing.large) {
                Text(
                    "\(model.snapshot?.items.count ?? 0) files reviewed, \(model.snapshot?.comments.count ?? 0) notes"
                )
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.mutedForeground)
                HStack(spacing: Theme.Spacing.small) {
                    Button("Stage Reviewed") {
                        Task {
                            await model.stageReviewed()
                            dismiss()
                        }
                    }
                    .buttonStyle(.glass)
                    .buttonBorderShape(.capsule)
                    .appButtonContext(.regular)
                    .disabled(model.reviewedUnstagedCount == 0)
                    Button("Send Notes") {
                        dismiss()
                        showSend()
                    }
                    .appProminentGlassButton()
                    .buttonBorderShape(.capsule)
                    .appButtonContext(.regular)
                    .disabled(model.unsentComments.isEmpty)
                }
                Spacer(minLength: 0)
            }
            .padding(Theme.Spacing.large)
            .navigationTitle("Review Complete")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                SheetDismissToolbarItem(
                    accessibilityLabel: "Close review complete",
                    action: dismiss.callAsFunction
                )
            }
        }
        .appSheetPresentation(.fixed(.medium))
    }
}
