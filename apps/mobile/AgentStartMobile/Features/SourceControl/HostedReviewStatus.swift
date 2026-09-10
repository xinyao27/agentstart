import SwiftUI

struct HostedReviewReviewersCard: View {
    let reviewers: [HostedReviewReviewer]
    let busyAction: String?
    let showPicker: () -> Void
    let remove: (String) -> Void

    var body: some View {
        HostedReviewSection(
            title: "Reviewers",
            trailing: {
                GlassIconButton(
                    iconName: .add,
                    accessibilityLabel: "Add or remove reviewers",
                    context: .inline,
                    action: showPicker
                )
            }
        ) {
            if reviewers.isEmpty {
                Text("No reviewers requested")
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.mutedForeground)
            } else {
                ForEach(reviewers) { reviewer in
                    HStack(spacing: Theme.Spacing.small) {
                        HostedReviewAvatar(url: reviewer.avatarURL, label: reviewer.login)
                        Text(
                            verbatim: reviewer.name.map { "\($0) (\(reviewer.login))" }
                                ?? reviewer.login
                        )
                        .font(.system(size: Theme.Typography.supporting))
                        .lineLimit(1)
                        Spacer(minLength: Theme.Spacing.small)
                        Text(verbatim: reviewer.status)
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                        if busyAction == "reviewer:\(reviewer.login)" {
                            ProgressView()
                                .controlSize(.small)
                                .frame(
                                    width: Theme.Control.inlineHeight,
                                    height: Theme.Control.inlineHeight
                                )
                        } else {
                            GlassIconButton(
                                iconName: .x,
                                accessibilityLabel: "Remove \(reviewer.login)",
                                context: .inline,
                                isDestructive: true
                            ) {
                                remove(reviewer.login)
                            }
                        }
                    }
                    .frame(minHeight: Theme.Size.minimumHitTarget)
                }
            }
        }
    }
}

struct HostedReviewChecksCard: View {
    let checks: [HostedReviewCheck]
    let isBusy: Bool
    let isTriageBusy: Bool
    let triageErrorMessage: String?
    let rerun: () -> Void
    let fix: () -> Void
    let loadDetails: (HostedReviewCheck) async throws -> HostedReviewCheckRunDetails?
    @State private var expanded = Set<String>()
    @State private var detailPhases: [String: HostedReviewCheckDetailPhase] = [:]
    @State private var autoExpandedSignature: String?

    var body: some View {
        let ordered = checks.sorted { checkRank($0) < checkRank($1) }
        let failures = checks.filter { $0.outcome == .failure }.count
        HostedReviewSection(
            title: "Checks",
            trailing: {
                HStack(spacing: Theme.Spacing.small) {
                    Text(checkSummary(checks))
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(checkSummaryColor(checks))
                    if failures > 0 {
                        GlassIconButton(
                            iconName: .refresh,
                            accessibilityLabel: "Rerun failing checks",
                            context: .inline,
                            isDisabled: isBusy,
                            isLoading: isBusy
                        ) {
                            rerun()
                        }
                    }
                }
            }
        ) {
            if failures > 0 {
                HStack(spacing: Theme.Spacing.small) {
                    // Why: the section header already states the failing count, so repeating
                    // it here read as two different numbers 40pt apart. This banner carries
                    // the action instead.
                    Text("Expand a check to inspect it, or fix it with AI.")
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if isTriageBusy {
                        ProgressView()
                            .controlSize(.small)
                            .frame(
                                width: Theme.Size.minimumHitTarget,
                                height: Theme.Size.minimumHitTarget
                            )
                    } else {
                        Button("Fix", action: fix)
                            .font(.system(size: Theme.Typography.metadata))
                            .appProminentGlassButton()
                            .appButtonContext(.inline)
                    }
                }
                .padding(.horizontal, Theme.Spacing.medium)
                .padding(.vertical, Theme.Spacing.small)
                .background(
                    Theme.Colors.attention.opacity(0.08),
                    in: .rect(cornerRadius: Theme.Radius.control)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: Theme.Radius.control)
                        .stroke(
                            Theme.Colors.attention.opacity(0.5),
                            lineWidth: Theme.Size.hairline
                        )
                }
            }
            if let triageErrorMessage {
                Text(verbatim: triageErrorMessage)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.attention)
            }
            if ordered.isEmpty {
                Text("No checks")
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.mutedForeground)
            } else {
                ForEach(ordered) { check in
                    HostedReviewCheckRow(
                        check: check,
                        isExpanded: expanded.contains(check.id),
                        toggle: { toggle(check) }
                    )
                    if expanded.contains(check.id) {
                        HostedReviewCheckDetailView(phase: detailPhases[check.id])
                    }
                }
            }
        }
        .task(id: checks.map(\.id).joined(separator: "|")) {
            let signature = checks.map(\.id).joined(separator: "|")
            guard autoExpandedSignature != signature else { return }
            autoExpandedSignature = signature
            guard let failed = ordered.first(where: { $0.outcome == .failure }) else { return }
            expand(failed)
        }
    }

    private func toggle(_ check: HostedReviewCheck) {
        if expanded.contains(check.id) {
            expanded.remove(check.id)
        } else {
            expand(check)
        }
    }

    private func expand(_ check: HostedReviewCheck) {
        expanded.insert(check.id)
        guard detailPhases[check.id] == nil else { return }
        detailPhases[check.id] = .loading
        Task {
            do {
                detailPhases[check.id] = .loaded(try await loadDetails(check))
            } catch is CancellationError {
                detailPhases[check.id] = nil
            } catch {
                detailPhases[check.id] = .failed(error.localizedDescription)
            }
        }
    }

    private func checkRank(_ check: HostedReviewCheck) -> Int {
        switch check.outcome {
        case .failure: 0
        case .pending: 1
        case .neutral: 2
        case .success: 3
        }
    }

    @MainActor private func checkSummaryColor(_ checks: [HostedReviewCheck]) -> Color {
        if checks.contains(where: { $0.outcome == .failure }) { return Theme.Colors.attention }
        if checks.contains(where: { $0.outcome == .pending }) { return Theme.Colors.unread }
        if checks.contains(where: { $0.outcome == .success }) { return Theme.Colors.success }
        return Theme.Colors.mutedForeground
    }

    private func checkSummary(_ checks: [HostedReviewCheck]) -> LocalizedStringResource {
        guard !checks.isEmpty else { return "No checks" }
        let failures = checks.filter { $0.outcome == .failure }.count
        let pending = checks.filter { $0.outcome == .pending }.count
        let passed = checks.filter { $0.outcome == .success }.count
        if failures > 0 { return "\(failures) failing" }
        if pending > 0 { return "\(pending) pending" }
        return "\(passed) passed"
    }
}

private struct HostedReviewCheckRow: View {
    let check: HostedReviewCheck
    let isExpanded: Bool
    let toggle: () -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        HStack(spacing: Theme.Spacing.extraSmall) {
            Button(action: toggle) {
                HStack(spacing: Theme.Spacing.small) {
                    AgentStartIcon(
                        isExpanded ? .arrowDown : .arrowRight,
                        size: Theme.Control.inlineIcon
                    )
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    Circle()
                        .fill(color)
                        .frame(
                            width: Theme.Control.statusIndicator,
                            height: Theme.Control.statusIndicator
                        )
                    Text(verbatim: check.name)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.foreground)
                        .lineLimit(1)
                    Spacer(minLength: Theme.Spacing.small)
                    Text(verbatim: statusLabel)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(color)
                }
                .frame(minHeight: Theme.Size.minimumHitTarget)
                .contentShape(.rect)
            }
            .buttonStyle(.appPlain)
            if let url = check.url {
                GlassCircleButton(
                    accessibilityLabel: "Open \(check.name) on the web",
                    context: .inline
                ) {
                    AgentStartIcon(.externalLink, size: Theme.Control.inlineIcon)
                } action: {
                    openURL(url)
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    @MainActor private var color: Color {
        switch check.outcome {
        case .success: Theme.Colors.success
        case .failure: Theme.Colors.attention
        case .pending: Theme.Colors.unread
        case .neutral: Theme.Colors.mutedForeground
        }
    }

    private var statusLabel: String {
        guard check.status == .completed else {
            return String(localized: check.status == .inProgress ? "In progress" : "Pending")
        }
        return hostedReviewCheckOutcomeLabel(conclusion: check.conclusion, status: nil)
    }
}

struct HostedReviewAvatar: View {
    let url: URL?
    let label: String

    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image): image.resizable().scaledToFill()
            default:
                Text(String(label.prefix(1)).uppercased())
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
        }
        .frame(width: Theme.Control.inlineHeight, height: Theme.Control.inlineHeight)
        .background(Theme.Colors.selection)
        .clipShape(.circle)
    }
}

struct HostedReviewReviewerSheet: View {
    @Bindable var model: HostedReviewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoadingUsers {
                    ProgressView()
                        .controlSize(.small)
                } else if model.assignableUsers.isEmpty {
                    AppUnavailableState(
                        "No reviewers found",
                        iconID: .add,
                        description: Text(
                            "No assignable users were returned for this repository."
                        )
                    )
                } else {
                    List(model.assignableUsers) { user in
                        Button {
                            Task {
                                await model.mutate(
                                    .requestReviewer(user.login),
                                    action: "reviewer:\(user.login)"
                                )
                                if model.errorMessage == nil { dismiss() }
                            }
                        } label: {
                            HStack(spacing: Theme.Spacing.medium) {
                                HostedReviewAvatar(url: user.avatarURL, label: user.login)
                                VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                                    Text(verbatim: user.name ?? user.login)
                                        .font(.system(size: Theme.Typography.supporting))
                                        .foregroundStyle(Theme.Colors.foreground)
                                    if user.name != nil {
                                        Text(verbatim: user.login)
                                            .font(.system(size: Theme.Typography.metadata))
                                            .foregroundStyle(Theme.Colors.mutedForeground)
                                    }
                                }
                            }
                            .frame(minHeight: Theme.Size.minimumHitTarget)
                        }
                        .disabled(model.busyAction != nil)
                    }
                    .listStyle(.plain)
                    // Why: reviewer selection is presented inside the neutral mobile sheet,
                    // not an iOS grouped table. Hide the platform list canvas so only the app
                    // surface and row separators remain visible.
                    .scrollContentBackground(.hidden)
                    .background(Theme.Colors.background)
                }
            }
            .navigationTitle("Reviewers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                SheetDismissToolbarItem(
                    accessibilityLabel: "Close reviewer picker",
                    action: dismiss.callAsFunction
                )
            }
            .task { await model.loadAssignableUsers() }
        }
        // Why: matches the other NavigationStack list sheets — no drag handle,
        // sized to page.
        .appSheetPresentation(.page)
    }
}
