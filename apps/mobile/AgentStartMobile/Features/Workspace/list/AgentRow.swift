import Foundation
import SwiftUI

nonisolated enum WorkspaceAgentDotState: Equatable, Sendable {
    case working
    case blocked
    case waiting
    case done
    case idle
    case interrupted
}

struct WorkspaceAgentRow: View {
    let agent: WorkspaceAgent
    let now: Date
    let isUnvisited: Bool

    var body: some View {
        HStack(spacing: 4) {
            if let agentType = agent.agentType {
                WorkspaceAgentIcon(agentID: agentType)
            }
            label
                .font(.system(size: WorkspaceListMetrics.supportingText))
                .foregroundStyle(
                    isUnvisited ? Theme.Colors.foreground : Theme.Colors.mutedForeground
                )
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(relativeTime)
                .font(.system(size: WorkspaceListMetrics.metadataText))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineLimit(1)
            WorkspaceAgentStateDot(state: dotState)
        }
        .frame(height: WorkspaceListMetrics.openTabHeight)
    }

    @ViewBuilder
    private var label: some View {
        if let message = agent.lastAssistantMessage?.trimmingCharacters(
            in: .whitespacesAndNewlines),
            !message.isEmpty
        {
            Text(message)
        } else if !agent.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Text(agent.prompt)
        } else {
            Text(stateLabel)
        }
    }

    private var dotState: WorkspaceAgentDotState {
        if agent.interrupted {
            return .interrupted
        }
        let isStale = now.timeIntervalSince(agent.updatedAt) > 30 * 60
        switch agent.state {
        case .working: return isStale ? .idle : .working
        case .blocked: return isStale ? .idle : .blocked
        case .waiting: return isStale ? .idle : .waiting
        case .done: return .done
        }
    }

    private var stateLabel: LocalizedStringResource {
        switch dotState {
        case .working: "Working"
        case .blocked: "Blocked"
        case .waiting: "Waiting for input"
        case .done: "Done"
        case .idle: "Idle"
        case .interrupted: "Interrupted"
        }
    }

    private var relativeTime: LocalizedStringResource {
        let seconds = max(0, Int(now.timeIntervalSince(agent.stateStartedAt)))
        if seconds < 60 {
            return "just now"
        }
        let minutes = seconds / 60
        if minutes < 60 {
            return "\(minutes)m"
        }
        let hours = minutes / 60
        if hours < 24 {
            return "\(hours)h"
        }
        return "\(hours / 24)d"
    }
}

struct WorkspaceAgentIcon: View {
    let agentID: String

    var body: some View {
        AgentMark(agentID: agentID, size: WorkspaceListMetrics.standardIcon)
    }
}

private struct WorkspaceAgentStateDot: View {
    let state: WorkspaceAgentDotState

    var body: some View {
        Group {
            if state == .working {
                AgentStartLoader(
                    size: WorkspaceListMetrics.agentState
                )
            } else {
                Rectangle()
                    .fill(dotColor)
                    .frame(
                        width: WorkspaceListMetrics.agentDot, height: WorkspaceListMetrics.agentDot)
            }
        }
        .frame(width: WorkspaceListMetrics.agentState, height: WorkspaceListMetrics.agentState)
    }

    private var dotColor: Color {
        switch state {
        case .done: Theme.Colors.success
        case .blocked, .waiting, .interrupted: Theme.Colors.attention
        case .idle: Theme.Colors.statusNeutral
        case .working: Theme.Colors.mutedForeground
        }
    }
}
