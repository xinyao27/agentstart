import SwiftUI

struct HostedReviewEmptyView: View {
    let eligibility: HostedReviewEligibility
    let isBusy: Bool
    let progress: SourceHostedReviewCreateProgress?
    let commitFailure: SourceCommitFailure?
    let commitFailureFixBusy: Bool
    let commitFailureLaunchError: String?
    let create: () -> Void
    let fixCommitFailure: () -> Void
    let link: (HostedReviewProvider, Int) -> Void
    @State private var isLinking = false
    @State private var linkNumber = ""
    @Environment(\.openURL) private var openURL

    var body: some View {
        HostedReviewPage {
            HostedReviewSection(
                title: "Pull request",
                iconID: .gitPullRequest,
                trailing: { createAccessory }
            ) {
                Text(emptyTitle)
                    .font(.system(size: Theme.Typography.primary, weight: .semibold))
                Text(summaryMessage)
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                if let progress {
                    HStack(spacing: Theme.Spacing.small) {
                        ProgressView()
                            .controlSize(.small)
                        Text(verbatim: progress.message)
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                if let commitFailure {
                    SourceCommitFailureCard(
                        failure: commitFailure,
                        isLaunchingFix: commitFailureFixBusy,
                        launchError: commitFailureLaunchError,
                        fix: fixCommitFailure
                    )
                }
                if !isLinking {
                    Button("Link an existing \(eligibility.provider.shortReviewTitle)") {
                        isLinking = true
                    }
                    .font(.system(size: Theme.Typography.metadata))
                    .buttonStyle(.glass)
                    .appButtonContext(.inline)
                }
            }

            if isLinking { linkForm }
        }
    }

    @ViewBuilder private var createAccessory: some View {
        if isBusy {
            ProgressView()
                .controlSize(.small)
                .frame(
                    width: Theme.Size.minimumHitTarget,
                    height: Theme.Size.minimumHitTarget
                )
        } else if eligibility.provider.supportsCreation {
            Button("Create \(eligibility.provider.shortReviewTitle)", action: create)
                .font(.system(size: Theme.Typography.metadata))
                .appProminentGlassButton()
                .appButtonContext(.inline)
        } else if let url = eligibility.existingReviewURL {
            Button("Open review") { openURL(url) }
                .font(.system(size: Theme.Typography.metadata))
                .buttonStyle(.glass)
                .appButtonContext(.inline)
        }
    }

    private var linkForm: some View {
        HostedReviewSection {
            HStack(spacing: Theme.Spacing.small) {
                Text("Link existing \(eligibility.provider.reviewLabel)")
                    .font(.system(size: Theme.Typography.primary, weight: .semibold))
                Spacer(minLength: Theme.Spacing.small)
                Button("Cancel") {
                    linkNumber = ""
                    isLinking = false
                }
                .font(.system(size: Theme.Typography.metadata))
                .buttonStyle(.glass)
                .appButtonContext(.inline)
            }
            Text(linkInputLabel)
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(Theme.Colors.mutedForeground)
            TextField(linkPlaceholder, text: $linkNumber)
                .font(.system(size: Theme.Typography.supporting))
                .keyboardType(eligibility.provider == .github ? .URL : .numbersAndPunctuation)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textFieldStyle(.plain)
                .padding(.horizontal, Theme.Spacing.medium)
                .frame(minHeight: Theme.Size.minimumHitTarget)
                .glassEffect(.regular.interactive(), in: .rect(cornerRadius: Theme.Radius.control))
            Button {
                guard let number = parsedLinkNumber else { return }
                link(eligibility.provider, number)
            } label: {
                Text(linkButtonTitle)
                    .font(.system(size: Theme.Typography.supporting))
                    .frame(maxWidth: .infinity)
            }
            .appProminentGlassButton()
            .appButtonContext(.large)
            .disabled(isBusy || parsedLinkNumber == nil)
        }
    }

    private var emptyTitle: LocalizedStringResource {
        "No open pull request"
    }

    // Why: the "no PR" summary is always the generic "branch is not linked" line, never the
    // create-blocker reason — that reason already surfaces as the Changes-tab CTA hint via
    // SourceHostedReviewCreator.blockMessage, and repeating it here says the same thing twice.
    // PR-tab creation is also not blocked on a dirty tree: a failed create surfaces its own
    // commit-failure recovery UI, which is actionable, unlike a static message.
    private var summaryMessage: LocalizedStringResource {
        if let head = eligibility.head, !head.isEmpty {
            return "\(head) is not linked to an open \(eligibility.provider.reviewLabel)."
        }
        return "The current branch is not linked to an open \(eligibility.provider.reviewLabel)."
    }

    private var linkInputLabel: LocalizedStringResource {
        eligibility.provider == .github
            ? "PR number or GitHub URL" : "\(eligibility.provider.reviewTitle) number"
    }

    private var linkButtonTitle: LocalizedStringResource {
        if let parsedLinkNumber { return "Link #\(parsedLinkNumber)" }
        return "Link \(eligibility.provider.reviewLabel)"
    }

    private var linkPlaceholder: LocalizedStringResource {
        eligibility.provider == .github
            ? "#123 or https://github.com/owner/repo/pull/123"
            : "\(eligibility.provider.reviewTitle) number"
    }

    private var parsedLinkNumber: Int? {
        hostedReviewNumber(linkNumber, provider: eligibility.provider)
    }
}

nonisolated private func hostedReviewNumber(
    _ input: String,
    provider: HostedReviewProvider
) -> Int? {
    let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
    let numeric = trimmed.hasPrefix("#") ? String(trimmed.dropFirst()) : trimmed
    if let number = Int(numeric), number > 0 { return number }
    guard provider == .github, let url = URL(string: trimmed),
        url.scheme == "http" || url.scheme == "https",
        let host = url.host?.lowercased(), host == "github.com" || host.hasSuffix(".github.com")
    else { return nil }
    let segments = url.path.split(separator: "/")
    guard segments.count >= 4, segments[2].lowercased() == "pull",
        let number = Int(segments[3]), number > 0
    else { return nil }
    return number
}

struct HostedReviewCreateSheet: View {
    let eligibility: HostedReviewEligibility
    let isBusy: Bool
    let submit: (HostedReviewDraft) -> Void
    @State private var title: String
    @State private var bodyText: String
    @State private var base: String
    @State private var isDraft = false
    @State private var useTemplate = true
    @Environment(\.dismiss) private var dismiss

    init(
        eligibility: HostedReviewEligibility,
        isBusy: Bool,
        submit: @escaping (HostedReviewDraft) -> Void
    ) {
        self.eligibility = eligibility
        self.isBusy = isBusy
        self.submit = submit
        _title = State(initialValue: eligibility.suggestedTitle ?? "")
        _bodyText = State(initialValue: eligibility.suggestedBody ?? "")
        _base = State(initialValue: eligibility.defaultBaseRef ?? "main")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(eligibility.provider.reviewTitle) {
                    TextField("Title", text: $title, axis: .vertical)
                    TextField("Base branch", text: $base)
                    TextField("Description", text: $bodyText, axis: .vertical)
                        .lineLimit(5...12)
                }
                Section("Options") {
                    Toggle("Create as draft", isOn: $isDraft)
                    Toggle("Use repository template", isOn: $useTemplate)
                }
            }
            .navigationTitle("Create \(eligibility.provider.reviewTitle)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: dismiss.callAsFunction)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        submit(
                            HostedReviewDraft(
                                provider: eligibility.provider,
                                base: base.trimmingCharacters(in: .whitespacesAndNewlines),
                                head: eligibility.head,
                                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                                body: bodyText,
                                isDraft: isDraft,
                                useTemplate: useTemplate
                            )
                        )
                    } label: {
                        if isBusy {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Text("Create")
                        }
                    }
                    .disabled(
                        isBusy || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || base.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
                }
            }
        }
        .appSheetPresentation(.page)
    }
}
