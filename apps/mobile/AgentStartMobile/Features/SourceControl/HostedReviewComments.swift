import SwiftUI
import UIKit

struct HostedReviewDescriptionCard: View {
    let content: String?

    var body: some View {
        HostedReviewSection(title: "Description") {
            if let content, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                HostedReviewMarkdown(content: content)
            } else if content == nil {
                ProgressView()
                    .controlSize(.small)
            } else {
                Text("No description provided.")
                    .font(.system(size: Theme.Typography.supporting))
                    .italic()
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
        }
    }
}

struct HostedReviewCommentsCard: View {
    let comments: [HostedReviewComment]?
    let isBusy: Bool
    let addComment: (String) async -> Bool
    let reply: (HostedReviewComment, String) async -> Bool
    let resolve: (HostedReviewComment) async -> Void
    @State private var draft = ""
    @State private var audience = HostedReviewCommentAudience.all
    @State private var visibleCount = 12
    @State private var expandedResolvedGroups = Set<String>()

    var body: some View {
        HostedReviewSection(
            title: "Comments",
            trailing: {
                if let comments {
                    // Why: `verbatim` avoids the locale thousands grouping interpolation
                    // would apply to this count.
                    Text(verbatim: String(comments.count))
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .padding(.horizontal, Theme.Spacing.small)
                        .padding(.vertical, Theme.Spacing.extraSmall)
                        .background(Theme.Colors.selection, in: .capsule)
                }
            }
        ) {
            if let comments {
                if !comments.isEmpty {
                    SourceSelectionStrip(
                        selection: $audience,
                        options: HostedReviewCommentAudience.allCases
                    ) { value in
                        Text(value.title(counts: audienceCounts(comments)))
                    }
                }
                let visibleGroups = groupHostedReviewComments(filtered(comments))
                if visibleGroups.isEmpty {
                    Text(emptyLabel)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .frame(
                            maxWidth: .infinity,
                            minHeight: Theme.Size.minimumHitTarget,
                            alignment: .center
                        )
                        .overlay {
                            RoundedRectangle(cornerRadius: Theme.Radius.control)
                                .stroke(
                                    Theme.Colors.statusNeutral.opacity(0.35),
                                    style: StrokeStyle(
                                        lineWidth: Theme.Size.hairline,
                                        dash: [Theme.Spacing.extraSmall]
                                    )
                                )
                        }
                } else {
                    ForEach(Array(visibleGroups.prefix(visibleCount))) { group in
                        HostedReviewCommentGroupView(
                            group: group,
                            expandedResolvedGroups: $expandedResolvedGroups,
                            isBusy: isBusy,
                            reply: reply,
                            resolve: resolve
                        )
                    }
                    if visibleGroups.count > visibleCount {
                        Button("Show more") { visibleCount += 12 }
                            .font(.system(size: Theme.Typography.supporting))
                            .buttonStyle(.glass)
                            .buttonBorderShape(.capsule)
                            .frame(maxWidth: .infinity)
                            .appButtonContext(.regular)
                    }
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.small) {
                    TextField("Add a comment…", text: $draft, axis: .vertical)
                        .lineLimit(3...8)
                        .textFieldStyle(.plain)
                        .font(.system(size: Theme.Typography.supporting))
                        .padding(Theme.Spacing.medium)
                        .background(
                            Theme.Colors.background,
                            in: .rect(cornerRadius: Theme.Radius.control)
                        )
                        .overlay {
                            RoundedRectangle(cornerRadius: Theme.Radius.control)
                                .stroke(
                                    Theme.Colors.statusNeutral.opacity(0.35),
                                    lineWidth: Theme.Size.hairline
                                )
                        }
                    Button {
                        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                        Task {
                            if await addComment(body) { draft = "" }
                        }
                    } label: {
                        HStack(spacing: Theme.Spacing.small) {
                            if isBusy {
                                ProgressView()
                                    .controlSize(.small)
                            }
                            Text("Comment")
                        }
                        .font(.system(size: Theme.Typography.supporting))
                        .frame(maxWidth: .infinity)
                    }
                    .appProminentGlassButton()
                    .buttonBorderShape(.capsule)
                    .appButtonContext(.regular)
                    .disabled(
                        isBusy || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            } else {
                ProgressView()
                    .controlSize(.small)
            }
        }
        .onChange(of: audience) { _, _ in
            visibleCount = 12
            expandedResolvedGroups.removeAll()
        }
    }

    private func filtered(_ values: [HostedReviewComment]) -> [HostedReviewComment] {
        switch audience {
        case .all: values
        case .people: values.filter { !$0.isBot }
        case .bots: values.filter(\.isBot)
        }
    }

    private func audienceCounts(_ values: [HostedReviewComment]) -> [HostedReviewCommentAudience:
        Int]
    {
        [
            .all: values.count,
            .people: values.filter { !$0.isBot }.count,
            .bots: values.filter(\.isBot).count,
        ]
    }

    private var emptyLabel: LocalizedStringResource {
        switch audience {
        case .all: "No comments yet."
        case .people: "No human comments."
        case .bots: "No bot comments."
        }
    }
}

private struct HostedReviewCommentGroupView: View {
    let group: HostedReviewCommentGroup
    @Binding var expandedResolvedGroups: Set<String>
    let isBusy: Bool
    let reply: (HostedReviewComment, String) async -> Bool
    let resolve: (HostedReviewComment) async -> Void

    var body: some View {
        if group.isResolved {
            VStack(spacing: 0) {
                Button(action: toggleExpanded) {
                    HStack(spacing: Theme.Spacing.small) {
                        AgentStartIcon(
                            expandedResolvedGroups.contains(group.id) ? .arrowDown : .arrowRight,
                            size: Theme.Control.inlineIcon
                        )
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        Text(summary)
                            .font(.system(size: Theme.Typography.metadata))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: Theme.Size.minimumHitTarget)
                    .contentShape(.rect)
                }
                .buttonStyle(.appPlain)

                if expandedResolvedGroups.contains(group.id) {
                    commentCards
                }
            }
        } else {
            commentCards
        }
    }

    private var commentCards: some View {
        VStack(spacing: Theme.Spacing.small) {
            ForEach(Array(group.comments.enumerated()), id: \.element.id) { index, comment in
                HostedReviewCommentCard(
                    comment: comment,
                    isReply: group.isThread && index > 0,
                    isBusy: isBusy,
                    reply: { body in await reply(comment, body) },
                    resolve: { await resolve(comment) }
                )
            }
        }
    }

    private var summary: String {
        let kind = group.isThread ? "thread" : "comment"
        let suffix = group.comments.count > 1 ? " (\(group.comments.count))" : ""
        return "Resolved \(kind) by \(group.root.author)\(suffix)"
    }

    private func toggleExpanded() {
        if expandedResolvedGroups.contains(group.id) {
            expandedResolvedGroups.remove(group.id)
        } else {
            expandedResolvedGroups.insert(group.id)
        }
    }
}

nonisolated private enum HostedReviewCommentAudience: String, CaseIterable, Identifiable, Sendable {
    case all
    case people
    case bots

    var id: Self { self }

    func title(counts: [Self: Int]) -> LocalizedStringResource {
        switch self {
        case .all: "All \(counts[.all, default: 0])"
        case .people: "Humans \(counts[.people, default: 0])"
        case .bots: "Bots \(counts[.bots, default: 0])"
        }
    }
}

private struct HostedReviewCommentCard: View {
    let comment: HostedReviewComment
    let isReply: Bool
    let isBusy: Bool
    let reply: (String) async -> Bool
    let resolve: () async -> Void
    @Environment(\.openURL) private var openURL
    @State private var isReplying = false
    @State private var replyDraft = ""

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: Theme.Spacing.small) {
                HostedReviewAvatar(url: comment.authorAvatarURL, label: comment.author)
                Text(verbatim: comment.author)
                    .font(.system(size: Theme.Typography.metadata))
                    .lineLimit(1)
                Text("· \(relativeTime)")
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                if let path = comment.path {
                    Text(verbatim: fileLabel(path))
                        .font(.system(size: Theme.Typography.metadata, design: .monospaced))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if comment.isResolved {
                    Text("resolved")
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .padding(.horizontal, Theme.Spacing.small)
                        .padding(.vertical, Theme.Spacing.extraSmall)
                        .background(Theme.Colors.selection, in: .capsule)
                }
                if let url = comment.url {
                    GlassCircleButton(
                        accessibilityLabel: "Open comment on GitHub",
                        context: .inline
                    ) {
                        AgentStartIcon(.externalLink, size: Theme.Control.inlineIcon)
                    } action: {
                        openURL(url)
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.medium)
            .padding(.vertical, Theme.Spacing.small)
            Divider()
            HostedReviewMarkdown(content: comment.body)
                .padding(.horizontal, Theme.Spacing.medium)
                .padding(.vertical, Theme.Spacing.medium)
                .frame(maxWidth: .infinity, alignment: .leading)
            if !comment.reactions.isEmpty || comment.threadID != nil || !isReplying {
                HStack(spacing: Theme.Spacing.small) {
                    ForEach(comment.reactions.filter { $0.count > 0 }, id: \.content) { reaction in
                        Text(verbatim: "\(reactionEmoji(reaction.content)) \(reaction.count)")
                            .font(.system(size: Theme.Typography.metadata))
                            .padding(.horizontal, Theme.Spacing.small)
                            .frame(height: Theme.Spacing.extraLarge)
                            .background(Theme.Colors.selection, in: .capsule)
                    }
                    Spacer(minLength: 0)
                    Button("Reply") { isReplying.toggle() }
                        .buttonStyle(.glass)
                        .buttonBorderShape(.capsule)
                        .appButtonContext(.inline)
                        .disabled(isBusy)
                    if comment.threadID != nil {
                        Button(comment.isResolved ? "Unresolve" : "Resolve") {
                            Task { await resolve() }
                        }
                        .buttonStyle(.glass)
                        .buttonBorderShape(.capsule)
                        .appButtonContext(.inline)
                        .disabled(isBusy)
                    }
                }
                .padding(.horizontal, Theme.Spacing.medium)
                .padding(.bottom, Theme.Spacing.small)
            }
            if isReplying {
                VStack(alignment: .leading, spacing: Theme.Spacing.small) {
                    TextField("Write a reply…", text: $replyDraft, axis: .vertical)
                        .lineLimit(2...6)
                        .textFieldStyle(.plain)
                        .font(.system(size: Theme.Typography.supporting))
                        .padding(Theme.Spacing.medium)
                        .background(
                            Theme.Colors.content,
                            in: .rect(cornerRadius: Theme.Radius.control)
                        )
                    HStack(spacing: Theme.Spacing.small) {
                        Button("Cancel") {
                            isReplying = false
                            replyDraft = ""
                        }
                        .buttonStyle(.glass)
                        .buttonBorderShape(.capsule)
                        .appButtonContext(.regular)
                        Spacer(minLength: 0)
                        Button {
                            let body = replyDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                            Task {
                                if await reply(body) {
                                    replyDraft = ""
                                    isReplying = false
                                }
                            }
                        } label: {
                            if isBusy {
                                ProgressView()
                                    .controlSize(.small)
                            } else {
                                Text("Reply")
                            }
                        }
                        .appProminentGlassButton()
                        .buttonBorderShape(.capsule)
                        .appButtonContext(.regular)
                        .disabled(
                            isBusy
                                || replyDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                                    .isEmpty
                        )
                    }
                }
                .padding(.horizontal, Theme.Spacing.medium)
                .padding(.bottom, Theme.Spacing.medium)
            }
        }
        .background(Theme.Colors.background)
        .clipShape(.rect(cornerRadius: Theme.Radius.control))
        .overlay {
            RoundedRectangle(cornerRadius: Theme.Radius.control)
                .stroke(
                    Theme.Colors.statusNeutral.opacity(0.35),
                    lineWidth: Theme.Size.hairline
                )
        }
        .opacity(comment.isResolved ? 0.6 : 1)
        .padding(.leading, isReply ? Theme.Spacing.standard : 0)
    }

    private var relativeTime: String {
        guard let date = comment.createdAt else { return "" }
        return date.formatted(.relative(presentation: .named))
    }

    private func fileLabel(_ path: String) -> String {
        let name = path.split(separator: "/").last.map(String.init) ?? path
        return comment.line.map { "\(name):L\($0)" } ?? name
    }

    private func reactionEmoji(_ content: String) -> String {
        switch content {
        case "+1": "👍"
        case "-1": "👎"
        case "laugh": "😄"
        case "confused": "😕"
        case "heart": "❤️"
        case "hooray": "🎉"
        case "rocket": "🚀"
        case "eyes": "👀"
        default: "•"
        }
    }
}

struct HostedReviewMarkdown: View {
    let content: String

    var body: some View {
        AppStructuredMarkdown(content: content, fontSize: 14, supportsMath: false)
            .environment(
                \.openURL,
                OpenURLAction { url in
                    UIApplication.shared.open(url)
                    return .handled
                })
    }
}
