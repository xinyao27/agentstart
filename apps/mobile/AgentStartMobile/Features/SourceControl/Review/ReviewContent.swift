import SwiftUI

struct SourceReviewHeader: View {
    @Bindable var model: SourceReviewModel

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
            // Why: one leading line, not a split left/right row — the file summary below
            // states this file's own position ("File N of M"); stating this row's meaning
            // ("… reviewed", "… unsent notes") inline is what keeps the two numbers from
            // reading as an unexplained duplicate the way a bare, unlabeled count would.
            // Why: `Text("\(count) …")` interpolation goes through LocalizedStringKey, which
            // silently applies locale thousands grouping ("5,436"). `verbatim` keeps these
            // review counts ungrouped.
            Text(
                verbatim:
                    "\(model.reviewedCount)/\(model.snapshot?.items.count ?? 0) reviewed · \(model.unsentComments.count) unsent \(model.unsentComments.count == 1 ? "note" : "notes")"
            )
            .font(.system(size: Theme.Typography.metadata))
            .foregroundStyle(Theme.Colors.mutedForeground)
            Menu {
                ForEach(SourceReviewFilter.allCases) { filter in
                    Button {
                        Task { await model.selectFilter(filter) }
                    } label: {
                        HStack(spacing: Theme.Spacing.small) {
                            if model.filter == filter {
                                AgentStartIcon(.check, size: Theme.Control.inlineIcon)
                            }
                            Text(filter.title)
                        }
                    }
                    .accessibilityAddTraits(model.filter == filter ? .isSelected : [])
                }
            } label: {
                HStack(spacing: Theme.Spacing.small) {
                    AgentStartIcon(.filter, size: Theme.Control.inlineIcon)
                    Text("Filter · \(filterTitle)")
                        .font(.system(size: Theme.Typography.supporting))
                }
                .frame(width: Theme.Control.reviewFilterWidth, height: Theme.Control.regularHeight)
                .glassEffect(.regular.interactive(), in: .capsule)
                // Why: Menu labels inherit the system accent by default. This stays in the
                // same neutral foreground as the rest of the review header — an accented
                // filter reads as a primary action rather than a selector.
                .foregroundStyle(Theme.Colors.foreground)
            }
            .appButtonContext(.regular)
            .tint(Theme.Colors.foreground)
            .accessibilityLabel("Filter review files")
            .accessibilityValue("\(filterTitle) selected")
        }
    }

    private var filterTitle: String {
        String(localized: model.filter.title)
    }
}

struct SourceReviewFileSummary: View {
    @Bindable var model: SourceReviewModel
    let item: SourceReviewItem
    let moveHunk: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.small) {
            HStack(spacing: Theme.Spacing.small) {
                Text(verbatim: item.status.label)
                    .font(.system(size: Theme.Typography.metadata, design: .monospaced))
                    .foregroundStyle(item.status.color)
                    .frame(width: Theme.Spacing.extraLarge)
                VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                    // Why: the identifying information on this card — the file being
                    // reviewed — must never tail-truncate; this card has room for it to wrap.
                    Text(verbatim: item.filePath)
                        .font(.system(size: Theme.Typography.supporting))
                    Text(scopeLabel)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
                Spacer(minLength: Theme.Spacing.small)
            }
            HStack(spacing: Theme.Spacing.medium) {
                fileNavButton("Previous file", icon: .arrowLeft, direction: -1)
                // Why: labelled "File N of M" (not a bare fraction) so it reads as this
                // file's position in the list — distinct from the "N/M reviewed" progress
                // count above, which the same digits could otherwise be mistaken for. Plain
                // digit interpolation avoids LocalizedStringKey/LocalizedStringResource locale
                // thousands grouping (e.g. "1,234"), which matters because a review can hold
                // thousands of files.
                Text(verbatim: "File \(model.currentIndex + 1) of \(model.visibleItems.count)")
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                fileNavButton("Next file", icon: .arrowRight, direction: 1)
                Spacer(minLength: Theme.Spacing.small)
                if item.isReviewed { reviewBadge(Text("Reviewed"), color: Theme.Colors.success) }
                if item.changedSinceReview {
                    reviewBadge(Text("Changed"), color: Theme.Colors.unread)
                }
            }
            if item.noteCount > 0 || item.staleNoteCount > 0 {
                HStack(spacing: Theme.Spacing.medium) {
                    if item.noteCount > 0 {
                        Text(verbatim: "\(item.noteCount) notes")
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                    if item.staleNoteCount > 0 {
                        reviewBadge(
                            Text(verbatim: "\(item.staleNoteCount) stale"),
                            color: Theme.Colors.unread)
                    }
                }
            }
            SourceReviewHunkNavigation(
                disabled: model.currentHunkCount == 0,
                moveHunk: moveHunk
            )
            ForEach(model.fileComments) { comment in
                Button {
                    model.editComment(comment)
                } label: {
                    Text(verbatim: comment.body)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineLimit(2)
                        .frame(
                            maxWidth: .infinity,
                            minHeight: Theme.Size.minimumHitTarget,
                            alignment: .leading
                        )
                        .padding(.horizontal, Theme.Spacing.medium)
                        .background(
                            Theme.Colors.selection,
                            in: .rect(cornerRadius: Theme.Radius.control)
                        )
                }
                .buttonStyle(.appPlain)
            }
        }
        .padding(.top, Theme.Spacing.small)
    }

    private func fileNavButton(
        _ label: LocalizedStringResource,
        icon: AgentStartIconID,
        direction: Int
    ) -> some View {
        GlassIconButton(
            iconName: icon,
            accessibilityLabel: label,
            context: .inline
        ) { Task { await model.move(direction) } }
    }

    private func reviewBadge(_ title: Text, color: Color) -> some View {
        title
            .font(.system(size: Theme.Typography.metadata))
            .foregroundStyle(color)
    }

    private var scopeLabel: String {
        let scope = String(localized: item.scope.title)
        guard let oldPath = item.oldPath else { return scope }
        return "\(scope) from \(oldPath)"
    }

}

private struct SourceReviewHunkNavigation: View {
    let disabled: Bool
    let moveHunk: (Int) -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    // Why: "Previous"/"Next" side by side stop fitting one row at an accessibility text
    // size and truncate to "Previ…", which loses the only thing that distinguishes them.
    // Stacking keeps both labels whole.
    @ViewBuilder
    var body: some View {
        let layout =
            dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(
                VStackLayout(
                    alignment: .leading,
                    spacing: Theme.Spacing.extraLarge
                ))
            : AnyLayout(HStackLayout(spacing: Theme.Glass.groupSpacing))
        layout {
            // Why: both directions used to render the same "Hunk" label with only the
            // chevron distinguishing them — a label that carries no meaning. Reading as
            // "Previous"/"Next" of a fixed "Hunk" subject makes the pair self-explanatory,
            // with the fuller "Previous/Next hunk" reserved for VoiceOver.
            hunkButton("Previous hunk", visibleLabel: "Previous", icon: .arrowUp, direction: -1)
            hunkButton("Next hunk", visibleLabel: "Next", icon: .arrowDown, direction: 1)
        }
        .padding(.top, Theme.Spacing.small)
    }

    private func hunkButton(
        _ accessibilityTitle: LocalizedStringResource,
        visibleLabel: LocalizedStringResource,
        icon: AgentStartIconID,
        direction: Int
    ) -> some View {
        Button(String(localized: visibleLabel), iconID: icon) {
            moveHunk(direction)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.capsule)
        .controlSize(.small)
        .frame(minHeight: Theme.Size.minimumHitTarget)
        .disabled(disabled)
        .accessibilityLabel(accessibilityTitle)
    }
}

struct SourceReviewFooter: View {
    @Bindable var model: SourceReviewModel
    let item: SourceReviewItem
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    // Why: the exact height this bar settles to (44pt control + 8pt top/6pt bottom padding).
    // Pinning it, rather than trusting a GlassEffectContainer's self-reported size, is the
    // same fix `SourceControlActionBar.contentHeight` applies — a `GlassEffectContainer`
    // wrapping a system `.glassProminent` button reports the wrong size to anything that
    // measures it, so this bar is a plain container instead, sized deterministically.
    static let contentHeight: CGFloat =
        Theme.Control.regularHeight + (Theme.Spacing.small * 2)

    // Why: three capsules in one row cannot hold their scaled labels at an accessibility
    // text size — they collapse to "+ …" / "✓ M…", which names none of the actions. Stacking
    // full-width rows keeps every label readable, and the bar's pinned height has to be
    // released with it so the taller stack is not clipped.
    @ViewBuilder
    var body: some View {
        let isAccessibility = dynamicTypeSize.isAccessibilitySize
        // Why: the glass capsule paints past its layout bounds at an accessibility control
        // size, so the 8pt row gap that reads correctly at normal sizes lets stacked
        // capsules visually collide. The wider gap is measured against that overdraw.
        let layout =
            isAccessibility
            ? AnyLayout(VStackLayout(spacing: Theme.Spacing.extraLarge))
            : AnyLayout(HStackLayout(spacing: Theme.Spacing.small))
        layout {
            if item.canStage {
                action("Stage", iconID: .add) { await model.stageCurrent() }
            }
            if item.canUnstage {
                action("Unstage", iconID: .undo) { await model.unstageCurrent() }
            }
            Button("Note", iconID: .noteAdd) { model.openComposer(line: 0) }
                .buttonStyle(.glass)
                .buttonBorderShape(.capsule)
                .frame(maxWidth: isAccessibility ? .infinity : nil)
                .appButtonContext(.regular)
            Button(item.isReviewed ? "Reviewed" : "Mark Reviewed", iconID: .check) {
                Task { await model.markReviewed() }
            }
            .appProminentGlassButton()
            .buttonBorderShape(.capsule)
            // Why: this is the longest label in the bar and at an accessibility size it does
            // not fit one line even full-width. `fixedSize(vertical:)` is what makes the label
            // wrap instead of truncating to "Mark Revie…", which would hide which action the
            // primary button performs.
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, minHeight: Theme.Control.regularHeight)
            .appButtonContext(.regular)
        }
        .padding(.horizontal, Theme.Spacing.medium)
        .padding(.vertical, Theme.Spacing.small)
        .frame(height: isAccessibility ? nil : Self.contentHeight)
        .frame(maxWidth: .infinity)
        .background(Theme.Colors.background)
    }

    private func action(
        _ title: LocalizedStringResource,
        iconID: AgentStartIconID,
        operation: @escaping () async -> Void
    ) -> some View {
        Button(String(localized: title), iconID: iconID) { Task { await operation() } }
            .buttonStyle(.glass)
            .buttonBorderShape(.capsule)
            .frame(maxWidth: dynamicTypeSize.isAccessibilitySize ? .infinity : nil)
            .appButtonContext(.regular)
            .disabled(model.busyAction != nil)
    }
}
