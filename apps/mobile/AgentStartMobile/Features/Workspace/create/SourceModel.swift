import Foundation

extension WorkspaceCreationModel {
    func searchSources(query: String) async {
        let repoID = selectedRepoID
        guard !repoID.isEmpty, workspaceSourceQueryWithinLimit(query) else {
            sourceRefs = []
            return
        }
        isSearchingSources = true
        sourceError = nil
        defer { isSearchingSources = false }
        do {
            try await Task.sleep(for: .milliseconds(220))
            let refs = try await repository.workspaceSourceRefs(
                for: hostID,
                repoID: repoID,
                query: query
            )
            guard selectedRepoID == repoID, !Task.isCancelled else { return }
            sourceRefs = refs
        } catch is CancellationError {
            return
        } catch {
            guard selectedRepoID == repoID else { return }
            sourceRefs = []
            sourceError = String(localized: "Failed to search branches.")
        }
    }

    func searchHostedSources(query: String) async {
        let repoID = selectedRepoID
        guard !repoID.isEmpty, workspaceSourceQueryWithinLimit(query) else {
            hostedSources = []
            return
        }
        isSearchingSources = true
        sourceError = nil
        defer { isSearchingSources = false }
        do {
            try await Task.sleep(for: .milliseconds(220))
            let sources = try await repository.workspaceHostedSources(
                for: hostID,
                repoID: repoID,
                query: query
            )
            guard selectedRepoID == repoID, !Task.isCancelled else { return }
            hostedSources = sources
            if let pasted = await resolvePastedSource(query) { hostedSources = [pasted] }
        } catch is CancellationError {
            return
        } catch {
            guard selectedRepoID == repoID else { return }
            hostedSources = []
            sourceError =
                (error as? WorkspaceHostedSourceError)?.message
                ?? String(localized: "Failed to load review sources.")
        }
    }

    func searchSmartSources(query: String) async {
        let repoID = selectedRepoID
        guard !repoID.isEmpty, workspaceSourceQueryWithinLimit(query) else {
            hostedSources = []
            sourceRefs = []
            return
        }
        isSearchingSources = true
        sourceError = nil
        defer { isSearchingSources = false }
        async let githubResult = hostedSourceResult(repoID: repoID, query: query)
        async let branchResult: [WorkspaceSourceRef]? =
            query.trimmingCharacters(
                in: .whitespacesAndNewlines
            ).isEmpty
            ? []
            : try? repository.workspaceSourceRefs(
                for: hostID,
                repoID: repoID,
                query: query
            )
        let github = await githubResult
        let branches = await branchResult ?? []
        guard selectedRepoID == repoID, !Task.isCancelled else { return }
        hostedSources = github.sources
        sourceRefs = branches
        if github.needsRemote {
            sourceError = WorkspaceHostedSourceError.githubRemoteRequired.message
        }
        if let pasted = await resolvePastedSource(query) {
            hostedSources = [pasted]
        }
    }

    func useWorkspaceName(_ value: String) {
        clearCreationError()
        sourceSelection = nil
        reuseEligibleBranch = nil
        baseBranch = ""
        branchName = ""
        name = value
        lastAutoName = ""
    }

    func createBranch(named value: String) {
        clearCreationError()
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        sourceSelection = .newBranch(trimmed)
        reuseEligibleBranch = nil
        baseBranch = ""
        branchName = trimmed
        name = trimmed
        lastAutoName = trimmed
    }

    func selectSourceBranch(_ source: WorkspaceSourceRef) {
        clearCreationError()
        let isCheckedOut = (existingBranchesByRepo[selectedRepoID] ?? []).contains { branch in
            branch.replacingOccurrences(of: "refs/heads/", with: "") == source.localBranchName
        }
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let shouldAutoName =
            trimmedName.isEmpty || name == lastAutoName
            || source.localBranchName.hasPrefix(trimmedName)
            || source.refName.hasPrefix(trimmedName)
        let canReuse = source.refName == source.localBranchName && !isCheckedOut
        let producedOverride = shouldAutoName && canReuse
        reuseEligibleBranch = canReuse ? source.localBranchName : nil
        sourceSelection = .branch(
            refName: source.refName,
            localBranchName: source.localBranchName,
            isReused: producedOverride
        )
        baseBranch = source.refName
        branchName = producedOverride ? source.localBranchName : ""
        if shouldAutoName {
            name = producedOverride ? source.localBranchName : ""
            lastAutoName = name
        }
    }

    func selectHostedSource(_ source: WorkspaceHostedSource) async -> Bool {
        clearCreationError()
        let repoID = selectedRepoID
        isResolvingSource = true
        sourceError = nil
        defer { isResolvingSource = false }
        do {
            let base = try await repository.resolveWorkspaceHostedSource(
                for: hostID,
                repoID: repoID,
                source: source
            )
            guard repoID == selectedRepoID, !Task.isCancelled else { return false }
            sourceSelection = .hosted(item: source, base: base)
            baseBranch = base.baseBranch
            branchName = base.branchNameOverride ?? ""
            name = workspaceSourceSeedName(source.title)
            lastAutoName = name
            reuseEligibleBranch = nil
            return true
        } catch is CancellationError {
            return false
        } catch {
            sourceError =
                (error as? WorkspaceHostedSourceError)?.message
                ?? String(localized: "Failed to resolve base branch.")
            return false
        }
    }

    func clearSourceSelection() {
        clearCreationError()
        guard sourceSelection != nil else { return }
        let shouldClearName = name == lastAutoName
        sourceSelection = nil
        reuseEligibleBranch = nil
        sourceRefs = []
        hostedSources = []
        baseBranch = ""
        branchName = ""
        if shouldClearName { name = "" }
        lastAutoName = ""
    }

    func updateWorkspaceName(_ value: String) {
        clearCreationError()
        name = value
    }

    func setReuseSelectedBranch(_ shouldReuse: Bool) {
        guard case .branch(let refName, let localBranchName, _) = sourceSelection,
            reuseEligibleBranch == localBranchName
        else { return }
        sourceSelection = .branch(
            refName: refName,
            localBranchName: localBranchName,
            isReused: shouldReuse
        )
        // Why: opting out of reuse must drop the exact existing-branch override, so the
        // workspace can derive a fresh branch from its name or accept one entered explicitly in
        // Advanced. Keeping the old value makes the create path silently ignore that edit.
        branchName = shouldReuse ? localBranchName : ""
    }

    func resetSourceResults() {
        sourceRefs = []
        hostedSources = []
        sourceError = nil
        // Why: changing source modes invalidates the current paste lookup scope.
        // Remember a dismissed prompt so switching tabs does not immediately show
        // the same cross-repository prompt again for the unchanged query.
        if let prompt = crossRepoPrompt { dismissedPasteQuery = prompt.query }
        crossRepoPrompt = nil
    }

    func dismissCrossRepoPrompt() {
        dismissedPasteQuery =
            crossRepoPrompt?.query
            ?? name.trimmingCharacters(
                in: .whitespacesAndNewlines
            )
        crossRepoPrompt = nil
    }

    func acceptCrossRepoSource() async -> Bool {
        guard let prompt = crossRepoPrompt else { return false }
        isResolvingSource = true
        sourceError = nil
        defer {
            isResolvingSource = false
        }
        do {
            clearSourceSelection()
            selectedRepoID = prompt.repoID
            let source = try await repository.workspacePastedGitHubSource(
                for: hostID,
                repoID: prompt.repoID,
                number: prompt.number,
                slug: prompt.slug
            )
            guard let source else {
                sourceError = String(localized: "Selected pull request was not found.")
                return false
            }
            crossRepoPrompt = nil
            return await selectHostedSource(source)
        } catch is CancellationError {
            return false
        } catch {
            sourceError = String(localized: "Failed to load the selected pull request.")
            return false
        }
    }

    private func hostedSourceResult(
        repoID: String,
        query: String
    ) async -> (sources: [WorkspaceHostedSource], needsRemote: Bool) {
        do {
            return (
                try await repository.workspaceHostedSources(
                    for: hostID,
                    repoID: repoID,
                    query: query
                ),
                false
            )
        } catch WorkspaceHostedSourceError.githubRemoteRequired {
            return ([], true)
        } catch {
            return ([], false)
        }
    }

    private func resolvePastedSource(_ query: String) async -> WorkspaceHostedSource? {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let intent = workspacePasteIntent(trimmed), trimmed != dismissedPasteQuery else {
            if crossRepoPrompt?.query != trimmed { crossRepoPrompt = nil }
            return nil
        }
        do {
            switch intent {
            case .githubNumber(let number):
                crossRepoPrompt = nil
                return try await repository.workspacePastedGitHubSource(
                    for: hostID, repoID: selectedRepoID, number: number, slug: nil)
            case .githubLink(let slug, let number):
                if let repo = await matchingRepo(slug), repo.id != selectedRepoID {
                    crossRepoPrompt = WorkspaceCrossRepoPrompt(
                        query: trimmed,
                        slug: slug,
                        number: number,
                        repoID: repo.id,
                        repoName: repo.name
                    )
                    return nil
                }
                crossRepoPrompt = nil
                return try await repository.workspacePastedGitHubSource(
                    for: hostID, repoID: selectedRepoID, number: number, slug: slug)
            }
        } catch {
            return nil
        }
    }

    private func matchingRepo(_ slug: WorkspaceRepoSlug) async -> WorkspaceRepo? {
        if let projected = repos.first(where: { $0.slug?.matches(slug) == true }) {
            return projected
        }
        for repo in repos where repo.kind == .git {
            if let resolved = try? await repository.workspaceRepoSlug(for: hostID, repoID: repo.id),
                resolved.matches(slug)
            {
                return repo
            }
        }
        return nil
    }

    private func workspaceSourceSeedName(_ title: String) -> String {
        let lower = title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let mapped = lower.unicodeScalars.map { scalar -> Character in
            CharacterSet.alphanumerics.contains(scalar) || ".-_".unicodeScalars.contains(scalar)
                ? Character(String(scalar)) : "-"
        }
        let collapsed = String(mapped).replacingOccurrences(
            of: "-+",
            with: "-",
            options: .regularExpression
        )
        return String(
            collapsed.trimmingCharacters(in: CharacterSet(charactersIn: ".-_"))
                .prefix(48)
        )
    }
}
