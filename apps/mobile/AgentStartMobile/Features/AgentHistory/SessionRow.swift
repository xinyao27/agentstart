import SwiftUI

struct AgentHistorySessionRow: View {
    let session: AgentHistorySession
    let isExpanded: Bool
    let showsCurrentWorkspace: Bool
    let isCurrentWorkspace: Bool
    let isResuming: Bool
    let isResumeDisabled: Bool
    let toggle: () -> Void
    let resume: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: Theme.Spacing.small) {
                AgentMark(agentID: session.agent, size: 16)
                Text(verbatim: session.displayTitle)
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.foreground)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(verbatim: timeAgo)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
            if !session.latestMessage.isEmpty {
                Text(verbatim: session.latestMessage)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .lineLimit(isExpanded ? nil : 2)
                    .padding(.top, Theme.Spacing.extraSmall)
            }
            HStack(spacing: Theme.Spacing.small) {
                Text(verbatim: agentLabel)
                Text(messageCountLabel)
                if showsCurrentWorkspace, isCurrentWorkspace {
                    Text("current worktree")
                        .foregroundStyle(Theme.Colors.foreground)
                        .padding(.horizontal, Theme.Spacing.small)
                        .padding(.vertical, Theme.Spacing.extraSmall)
                        .background(Theme.Colors.selection, in: .capsule)
                }
                Spacer(minLength: 0)
                resumeButton
            }
            .font(.system(size: Theme.Typography.metadata, weight: .regular))
            .foregroundStyle(Theme.Colors.mutedForeground)
            .padding(.top, Theme.Spacing.extraSmall)
            if isExpanded {
                preview
            }
        }
        .padding(.vertical, Theme.Spacing.medium)
        .contentShape(Rectangle())
        .onTapGesture(perform: toggle)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Theme.Colors.divider)
                .frame(height: Theme.Size.hairline)
        }
    }

    private var resumeButton: some View {
        GlassCircleButton(
            accessibilityLabel: "Resume agent session",
            context: .inline,
            isDisabled: isResumeDisabled,
            isLoading: isResuming
        ) {
            AgentStartIcon(.play, size: Theme.Control.inlineIcon)
                .foregroundStyle(Theme.Colors.mutedForeground)
        } action: {
            resume()
        }
    }

    private var preview: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.small) {
            ForEach(Array(session.displayMessages.suffix(5).enumerated()), id: \.offset) {
                _, message in
                VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
                    Text(verbatim: message.role.uppercased())
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                    Text(verbatim: message.text)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, Theme.Spacing.small)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Theme.Colors.divider)
                .frame(height: Theme.Size.hairline)
        }
    }

    private var timeAgo: String {
        guard let date = session.updatedDate else { return "" }
        let seconds = max(0, Int(Date().timeIntervalSince(date)))
        if seconds < 60 { return String(localized: "just now") }
        if seconds < 3_600 { return "\(seconds / 60)m" }
        if seconds < 86_400 { return "\(seconds / 3_600)h" }
        return "\(seconds / 86_400)d"
    }

    private var agentLabel: String {
        switch session.agent {
        case "claude": "Claude"
        case "codex": "Codex"
        case "hermes": "Hermes"
        case "pi": "Pi"
        case "omp": "OMP"
        case "cursor": "Cursor"
        case "gemini": "Gemini"
        case "antigravity": "Antigravity"
        case "rovo": "Rovo Dev"
        case "copilot": "GitHub Copilot"
        case "opencode": "OpenCode"
        case "grok": "Grok"
        case "openclaw": "OpenClaw"
        case "devin": "Devin"
        case "droid": "Droid"
        case "kimi": "Kimi"
        default: session.agent
        }
    }

    private var messageCountLabel: LocalizedStringResource {
        session.messageCount == 1 ? "1 message" : "\(session.messageCount) messages"
    }
}
