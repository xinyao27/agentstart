import SwiftUI

@MainActor
extension WorkspaceCreationSheet {
    var creationForm: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Pick a repository and agent to spin up a new workspace.")
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .padding(.bottom, Theme.Spacing.standard)

                if model.repos.isEmpty {
                    Text("No repositories found")
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Theme.Spacing.extraLarge)
                } else {
                    repositoryPicker
                    workspaceNameField
                    agentPicker
                    advancedFields

                    if let message = model.errorMessage {
                        Text(verbatim: message)
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.attention)
                            .padding(.top, Theme.Spacing.small)
                    }

                    // Why: the flow's primary action spans the sheet; an intrinsic trailing pill
                    // made the disabled action both inconsistent and difficult to find.
                    Group {
                        if model.isCreating {
                            AgentStartLoader(size: Theme.Control.largeIcon)
                                .frame(
                                    maxWidth: .infinity,
                                    minHeight: Theme.Size.minimumHitTarget
                                )
                        } else {
                            Button {
                                create()
                            } label: {
                                Text("Create Workspace").frame(maxWidth: .infinity)
                            }
                            .appProminentGlassButton()
                            .appButtonContext(.large)
                            .disabled(!model.canCreate)
                        }
                    }
                    .padding(.top, Theme.Spacing.standard)
                }
            }
            .frame(maxWidth: Theme.Size.readingWidth)
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.top, Theme.Spacing.medium)
            .padding(.bottom, Theme.Spacing.huge)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    var repositoryPicker: some View {
        creationField(title: "Repository") {
            Button {
                presentedSheet = .picker(.repository)
            } label: {
                HStack(spacing: Theme.Spacing.small) {
                    if let repo = model.selectedRepo {
                        Rectangle()
                            .fill(repoBadgeColor(repo.badgeColor))
                            .frame(
                                width: Theme.Spacing.small,
                                height: Theme.Spacing.small
                            )
                    }
                    Text(verbatim: model.selectedRepo?.name ?? "Select a repository")
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(
                            model.selectedRepo == nil
                                ? Theme.Colors.mutedForeground : Theme.Colors.foreground
                        )
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    AgentStartIcon(.chevronDown, size: Theme.Control.inlineIcon)
                }
                .workspaceCreationControl()
            }
            .buttonStyle(.appPlain)
            .accessibilityRepresentation {
                Button {
                    presentedSheet = .picker(.repository)
                } label: {
                    Text(verbatim: model.selectedRepo?.name ?? "Select a repository")
                }
            }
        }
    }

    var workspaceNameField: some View {
        creationField(title: workspaceNameLabel, isOptional: true) {
            if let selection = visibleSourceSelection {
                HStack(spacing: Theme.Spacing.small) {
                    AgentStartIcon(sourceGlyph(selection), size: Theme.Typography.supporting)
                    Text(verbatim: selection.label)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.foreground)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if let url = sourceURL(selection) {
                        GlassCircleButton(
                            accessibilityLabel: "Open selected source",
                            context: .inline
                        ) {
                            AgentStartIcon(.externalLink, size: Theme.Control.inlineIcon)
                                .foregroundStyle(Theme.Colors.mutedForeground)
                        } action: {
                            openURL(url)
                        }
                    }
                    GlassCircleButton(
                        accessibilityLabel: "Clear selected source",
                        context: .inline
                    ) {
                        AgentStartIcon(.x, size: Theme.Control.inlineIcon)
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    } action: {
                        model.clearSourceSelection()
                    }
                }
                .frame(minHeight: Theme.Size.minimumHitTarget)
            } else {
                Button {
                    model.clearCreationError()
                    presentedSheet = .source
                } label: {
                    Text(model.name.isEmpty ? "Type a name or search a source" : model.name)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(
                            model.name.isEmpty
                                ? Theme.Colors.mutedForeground : Theme.Colors.foreground
                        )
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .workspaceCreationControl()
                }
                .buttonStyle(.appPlain)
            }
        }
    }

    var agentPicker: some View {
        creationField(title: "Agent") {
            Button {
                presentedSheet = .picker(.agent)
            } label: {
                HStack(spacing: Theme.Spacing.small) {
                    WorkspaceAgentIcon(agentID: model.selectedAgentID)
                    Text(verbatim: model.selectedAgent?.label ?? "Blank Terminal")
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.foreground)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    AgentStartIcon(.chevronDown, size: Theme.Control.inlineIcon)
                }
                .workspaceCreationControl()
            }
            .buttonStyle(.appPlain)
            .accessibilityRepresentation {
                Button {
                    presentedSheet = .picker(.agent)
                } label: {
                    Text(verbatim: model.selectedAgent?.label ?? "Blank Terminal")
                }
            }
        }
    }

    var advancedFields: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(Theme.Motion.stateChange) {
                    model.isAdvancedExpanded.toggle()
                }
            } label: {
                HStack(spacing: Theme.Spacing.extraSmall) {
                    Text("Advanced")
                        .font(.system(size: Theme.Typography.supporting))
                    AgentStartIcon(
                        model.isAdvancedExpanded ? .arrowUp : .arrowDown,
                        size: Theme.Control.inlineIcon
                    )
                }
                .foregroundStyle(Theme.Colors.mutedForeground)
                .frame(minHeight: Theme.Size.minimumHitTarget)
            }
            .buttonStyle(.appPlain)

            if model.isAdvancedExpanded {
                if visibleSourceSelection != nil {
                    creationField(title: "Name") {
                        TextField("Workspace name", text: workspaceNameBinding)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .workspaceCreationControl()
                    }
                }
                if shouldShowBranchName {
                    creationField(title: "Branch name") {
                        TextField("Derived from name", text: $model.branchName)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .workspaceCreationControl()
                    }
                }
                if let reusableBranch = model.reuseEligibleBranch {
                    Toggle(isOn: reuseBranchBinding) {
                        VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                            Text("Reuse eligible branch")
                                .font(.system(size: Theme.Typography.supporting))
                                .foregroundStyle(Theme.Colors.foreground)
                            Text("Branch “\(reusableBranch)”")
                                .font(.system(size: Theme.Typography.metadata))
                                .foregroundStyle(Theme.Colors.mutedForeground)
                                .lineLimit(1)
                        }
                    }
                    .frame(minHeight: 52)
                    .padding(.bottom, Theme.Spacing.medium)
                }
                creationField(title: "Note", isOptional: true) {
                    TextField("Write a note", text: $model.note, axis: .vertical)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .lineLimit(1...4)
                        .workspaceCreationControl()
                }
                WorkspaceSetupSection(model: model)
            }
        }
    }

    func creationField<Content: View>(
        title: LocalizedStringKey,
        isOptional: Bool = false,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
            if isOptional {
                Text(
                    "\(Text(title).font(.system(size: Theme.Typography.metadata, weight: .semibold))) \(Text("[Optional]").font(.system(size: Theme.Typography.metadata)))"
                )
                .foregroundStyle(Theme.Colors.mutedForeground)
            } else {
                Text(title)
                    .font(
                        .system(size: Theme.Typography.metadata, weight: .semibold)
                    )
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
            content()
        }
        .padding(.bottom, Theme.Spacing.medium)
    }
}
