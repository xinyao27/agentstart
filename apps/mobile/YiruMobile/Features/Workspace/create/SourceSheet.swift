import SwiftUI

struct WorkspaceSourceSheet: View {
    @Environment(\.dismiss) private var dismiss
    @FocusState private var isSearchFocused: Bool
    @State private var mode = WorkspaceSourceMode.smart
    @Bindable var model: WorkspaceCreationModel

    var body: some View {
        VStack(spacing: 0) {
            header
            VStack(spacing: Theme.Spacing.small) {
                searchField
                modeBar
                if let prompt = model.crossRepoPrompt { crossRepoPrompt(prompt) }
                ScrollView {
                    sourceRows
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .padding(.horizontal, Theme.Spacing.page)
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .background { AppBackground() }
        .appSheetPresentation(.page)
        .task {
            // Why: seed the source drawer from the current repository each time it opens, so a
            // prior folder/name choice cannot leak into a later Git repository selection.
            mode = model.selectedRepo?.kind == .folder ? .text : .smart
            try? await Task.sleep(for: .milliseconds(120))
            isSearchFocused = true
        }
        .task(id: searchScope) { await search() }
        .onChange(of: mode) { _, _ in model.resetSourceResults() }
    }

    private var header: some View {
        HStack(spacing: Theme.Spacing.medium) {
            GlassHeaderButton(
                iconName: .arrowLeft,
                accessibilityLabel: "Back to workspace form",
                action: { dismiss() }
            )

            Text("Name or 'Create From'")
                .font(.system(size: Theme.Typography.primary, weight: .semibold))
                .foregroundStyle(Theme.Colors.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button("Done") {
                model.useWorkspaceName(model.name)
                dismiss()
            }
            .font(.system(size: Theme.Typography.supporting))
            .buttonStyle(.glass)
            .appButtonContext(.inline)
        }
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.top, Theme.Spacing.standard)
        .padding(.bottom, Theme.Spacing.extraLarge)
    }

    private var searchField: some View {
        TextField("Type a name or search a source", text: $model.name)
            .font(.system(size: Theme.Typography.supporting))
            .foregroundStyle(Theme.Colors.foreground)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($isSearchFocused)
            .padding(.horizontal, Theme.Spacing.standard)
            .frame(minHeight: Theme.Control.largeHeight)
            .glassEffect(.regular.interactive(), in: .capsule)
    }

    private var modeBar: some View {
        WorkspaceSourceModeLayout(spacing: Theme.Spacing.small) {
            if model.selectedRepo?.kind == .git {
                modeButton(.smart, title: "Smart", glyph: .sparkle)
                modeButton(.github, title: "GitHub", glyph: .githubLogo)
                modeButton(.branch, title: "Branch", glyph: .gitMerge)
            }
            modeButton(.text, title: "Name", glyph: .textFormat)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func modeButton(
        _ value: WorkspaceSourceMode,
        title: LocalizedStringKey,
        glyph: YiruIconID
    ) -> some View {
        Button {
            mode = value
        } label: {
            HStack(spacing: Theme.Spacing.extraSmall) {
                YiruIcon(
                    glyph,
                    size: Theme.Control.inlineIcon
                )
                Text(title)
                    .font(.system(size: Theme.Typography.metadata))
            }
            .foregroundStyle(
                mode == value ? Theme.Colors.foreground : Theme.Colors.mutedForeground
            )
            .padding(.horizontal, Theme.Spacing.medium)
            .frame(minHeight: Theme.Size.minimumHitTarget)
        }
        .buttonStyle(.appPlain)
        .glassEffect(
            mode == value ? .regular.tint(Theme.Colors.selection) : .regular,
            in: .capsule
        )
        .accessibilityAddTraits(mode == value ? .isSelected : [])
    }

    private func crossRepoPrompt(_ prompt: WorkspaceCrossRepoPrompt) -> some View {
        ContentSurface {
            VStack(alignment: .leading, spacing: Theme.Spacing.small) {
                Text("This item lives in \(prompt.slug.owner)/\(prompt.slug.repo).")
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                HStack(spacing: Theme.Spacing.small) {
                    Spacer(minLength: 0)
                    Button("Cancel") { model.dismissCrossRepoPrompt() }
                        .font(.system(size: Theme.Typography.metadata))
                        .buttonStyle(.glass)
                        .appButtonContext(.inline)
                    Button("Switch to \(prompt.repoName)") {
                        Task {
                            if await model.acceptCrossRepoSource() { dismiss() }
                        }
                    }
                    .font(.system(size: Theme.Typography.metadata))
                    .appProminentGlassButton()
                    .appButtonContext(.inline)
                }
            }
        }
    }

    @ViewBuilder
    private var sourceRows: some View {
        if let error = model.sourceError {
            Text(verbatim: error)
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.attention)
                .frame(maxWidth: .infinity, minHeight: 80)
        } else if hasRows {
            LazyVStack(spacing: 0) {
                if mode == .smart, !trimmedName.isEmpty {
                    nameRow
                    rowDivider
                }
                if mode == .branch, shouldOfferBranchCreation {
                    createBranchRow
                    if !model.sourceRefs.isEmpty { rowDivider }
                }
                if mode == .smart || mode == .github {
                    hostedRows
                }
                if mode == .smart || mode == .branch {
                    branchRows
                }
                if model.isSearchingSources || model.isResolvingSource {
                    YiruLoader(size: Theme.Control.inlineIcon)
                        .frame(maxWidth: .infinity, minHeight: 52)
                }
            }
            .background(
                Theme.Colors.content,
                in: .rect(cornerRadius: Theme.Radius.content)
            )
        } else if model.isSearchingSources || model.isResolvingSource {
            YiruLoader(size: Theme.Control.inlineIcon)
                .frame(maxWidth: .infinity, minHeight: 80)
        } else {
            Text(emptyHint)
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .frame(maxWidth: .infinity, minHeight: 80, alignment: .leading)
                .padding(.horizontal, Theme.Spacing.medium)
                .background(
                    Theme.Colors.content,
                    in: .rect(cornerRadius: Theme.Radius.content)
                )
        }
    }

    private var nameRow: some View {
        sourceRow(
            title: String(localized: "Use \"\(trimmedName)\""),
            subtitle: String(localized: "Name this workspace"),
            glyph: .sparkle
        ) {
            model.useWorkspaceName(trimmedName)
            dismiss()
        }
    }

    private var createBranchRow: some View {
        sourceRow(
            title: String(localized: "Create branch \"\(trimmedName)\""),
            subtitle: String(localized: "New branch"),
            glyph: .gitMerge
        ) {
            model.createBranch(named: trimmedName)
            dismiss()
        }
    }

    @ViewBuilder
    private var hostedRows: some View {
        let sources = visibleHostedSources
        ForEach(Array(sources.enumerated()), id: \.element.id) { index, source in
            sourceRow(
                title: source.title,
                subtitle: String(localized: "PR #") + String(source.number),
                glyph: .githubLogo,
                status: source.state
            ) {
                Task {
                    if await model.selectHostedSource(source) { dismiss() }
                }
            }
            if index < sources.count - 1 || !visibleSourceRefs.isEmpty { rowDivider }
        }
    }

    @ViewBuilder
    private var branchRows: some View {
        let refs = visibleSourceRefs
        ForEach(Array(refs.enumerated()), id: \.element.id) { index, source in
            sourceRow(
                title: source.localBranchName,
                subtitle: source.refName,
                glyph: .gitMerge
            ) {
                model.selectSourceBranch(source)
                dismiss()
            }
            if index < refs.count - 1 { rowDivider }
        }
    }

    private var rowDivider: some View {
        Divider().padding(.horizontal, Theme.Spacing.medium)
    }

    private func sourceRow(
        title: String,
        subtitle: String,
        glyph: YiruIconID,
        status: String? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.small) {
                YiruIcon(glyph, size: Theme.Control.inlineIcon)
                    .frame(width: Theme.Spacing.large)
                VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                    Text(verbatim: title)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.foreground)
                        .lineLimit(1)
                    Text(verbatim: subtitle)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if let status {
                    Text(verbatim: status.capitalized)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .padding(.horizontal, Theme.Spacing.small)
                        .padding(.vertical, Theme.Spacing.extraSmall)
                        .background(Theme.Colors.selection, in: .capsule)
                }
            }
            .padding(.horizontal, Theme.Spacing.medium)
            .frame(minHeight: 56)
            .contentShape(.rect)
        }
        .buttonStyle(.appPlain)
        .disabled(model.isResolvingSource)
    }

    private func search() async {
        switch mode {
        case .smart:
            await model.searchSmartSources(query: model.name)
        case .github:
            await model.searchHostedSources(query: model.name)
        case .branch:
            await model.searchSources(query: model.name)
        case .text:
            break
        }
    }

    private var searchScope: String {
        "\(mode.rawValue):\(model.selectedRepoID):\(model.name)"
    }

    private var visibleHostedSources: [WorkspaceHostedSource] {
        switch mode {
        case .smart: model.hostedSources
        case .github: model.hostedSources
        case .branch, .text: []
        }
    }

    private var visibleSourceRefs: [WorkspaceSourceRef] {
        mode == .smart || mode == .branch ? model.sourceRefs : []
    }

    private var hasRows: Bool {
        (mode == .smart && !trimmedName.isEmpty)
            || (mode == .branch && shouldOfferBranchCreation)
            || !visibleHostedSources.isEmpty || !visibleSourceRefs.isEmpty
    }

    private var shouldOfferBranchCreation: Bool {
        !trimmedName.isEmpty
            && !model.sourceRefs.contains {
                $0.refName == trimmedName || $0.localBranchName == trimmedName
            }
    }

    private var emptyHint: LocalizedStringKey {
        switch mode {
        case .smart: "Start typing to create a name or find a source."
        case .github: "Start typing to search GitHub pull requests."
        case .branch: "No matching branches."
        case .text: "No results found."
        }
    }

    private var trimmedName: String {
        model.name.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
