import SwiftUI

struct SourceFileRow: View {
    let entry: SourceFileEntry
    let isBusy: Bool
    let isDisabled: Bool
    let open: () -> Void
    let stage: () -> Void
    let unstage: () -> Void
    let discard: () -> Void

    var body: some View {
        HStack(spacing: Theme.Spacing.small) {
            Button(action: open) {
                HStack(spacing: Theme.Spacing.small) {
                    Text(verbatim: entry.status.label)
                        .font(.system(size: Theme.Typography.metadata, design: .monospaced))
                        .foregroundStyle(entry.status.color)
                        .frame(width: Theme.Spacing.large)
                    // Why: the basename — the part that identifies which file this is — is
                    // the load-bearing information in a list of hundreds of paths. Splitting
                    // it onto its own line keeps it fully visible instead of tail-truncating
                    // exactly the identifying suffix while the shared directory prefix
                    // repeats down the list.
                    VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                        Text(verbatim: fileName)
                            .font(.system(size: Theme.Typography.supporting))
                            .foregroundStyle(
                                entry.canOpen
                                    ? Theme.Colors.foreground : Theme.Colors.mutedForeground
                            )
                            .lineLimit(1)
                        if let directoryPath {
                            Text(verbatim: directoryPath)
                                .font(.system(size: Theme.Typography.metadata))
                                .foregroundStyle(Theme.Colors.mutedForeground)
                                .lineLimit(1)
                                .truncationMode(.head)
                        }
                        if let detail {
                            Text(verbatim: detail)
                                .font(.system(size: Theme.Typography.metadata))
                                .foregroundStyle(Theme.Colors.mutedForeground)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.appPlain)
            .disabled(isDisabled || !entry.canOpen)

            // Why: this must be a sibling of the "open" button, not nested inside its
            // label — a Button's label content isn't independently hit-testable, so an
            // inline stage button nested inside the row's own Button would never receive
            // its own taps.
            trailingAccessory
        }
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.vertical, Theme.Spacing.small)
        .frame(minHeight: Theme.Size.minimumHitTarget)
        .opacity(isDisabled && !isBusy ? 0.8 : 1)
        .listRowInsets(EdgeInsets())
        .listRowBackground(Theme.Colors.background)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if entry.area == .staged {
                Button {
                    unstage()
                } label: {
                    Label("Unstage", iconID: .remove)
                }
                .disabled(isDisabled)
            } else if entry.canDiscard {
                // Why: staging already has a visible, always-on affordance below (see
                // trailingAccessory) — a first-time user must be able to stage without
                // being told, which a swipe-only control can't guarantee. Discard is
                // destructive and secondary, so it keeps the iOS convention (Mail,
                // Reminders) of living only behind a swipe.
                Button(role: .destructive) {
                    discard()
                } label: {
                    Label("Discard", iconID: .trash)
                }
                .disabled(isDisabled)
            }
        }
    }

    @ViewBuilder
    private var trailingAccessory: some View {
        if isBusy {
            ProgressView()
                .controlSize(.small)
                .frame(
                    width: Theme.Size.minimumHitTarget,
                    height: Theme.Size.minimumHitTarget
                )
        } else if entry.canStage {
            GlassIconButton(
                iconName: .add,
                accessibilityLabel: "Stage file",
                context: .inline,
                isDisabled: isDisabled,
                action: stage
            )
            .accessibilityValue(Text(verbatim: entry.path))
        } else if entry.canOpen {
            AgentStartIcon(.arrowRight, size: 16)
                .foregroundStyle(Theme.Colors.mutedForeground)
                .frame(width: Theme.Spacing.large)
        }
    }

    // Why: git status paths are always "/"-separated regardless of host OS — this is a
    // repo-relative git path, not a local filesystem path, so splitting on "/" directly
    // (rather than a platform path utility) is the correct, unambiguous parse.
    private var fileName: String {
        entry.path.split(separator: "/").last.map(String.init) ?? entry.path
    }

    private var directoryPath: String? {
        guard let slashIndex = entry.path.lastIndex(of: "/") else { return nil }
        return String(entry.path[..<slashIndex])
    }

    private var detail: String? {
        if let oldPath = entry.oldPath { return String(localized: "from \(oldPath)") }
        if entry.conflictStatus == .unresolved { return String(localized: "Unresolved conflict") }
        return nil
    }
}
