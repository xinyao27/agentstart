import SwiftUI

struct WorkspaceOpenTabs: View {
    let workspace: WorkspaceSummary
    let tabs: [WorkspaceOpenTab]
    let now: Date
    let railStartOffset: CGFloat
    let selectTab: (WorkspaceOpenTab) -> Void

    @Environment(\.displayScale) private var displayScale

    private let rowHeight = WorkspaceListMetrics.openTabHeight
    private let railLeft: CGFloat = -16
    private let elbowWidth: CGFloat = 10

    var body: some View {
        ZStack(alignment: .topLeading) {
            rail
            VStack(spacing: 0) {
                ForEach(tabs) { tab in
                    Button {
                        selectTab(tab)
                    } label: {
                        tabRow(tab)
                    }
                    .buttonStyle(.appPlain)
                    .accessibilityAddTraits(tab.isActive ? .isSelected : [])
                }
            }
        }
        .padding(.top, 4)
    }

    @ViewBuilder
    private func tabRow(_ tab: WorkspaceOpenTab) -> some View {
        if let agent = agentByTabID[tab.id] {
            WorkspaceAgentRow(
                agent: agent,
                now: now,
                isUnvisited: workspace.isUnread
            )
        } else {
            HStack(spacing: 4) {
                tabIcon(tab)
                Text(verbatim: tab.title)
                    .font(.system(size: WorkspaceListMetrics.supportingText))
                    .foregroundStyle(
                        workspace.isUnread
                            ? Theme.Colors.foreground : Theme.Colors.mutedForeground
                    )
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: rowHeight)
        }
    }

    private func tabIcon(_ tab: WorkspaceOpenTab) -> some View {
        Group {
            if tab.kind == .terminal, let agentID = tab.agentID {
                AgentMark(agentID: agentID, size: WorkspaceListMetrics.standardIcon)
            } else {
                AgentStartIcon(tabGlyph(tab.kind), size: WorkspaceListMetrics.standardIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
        }
        .frame(
            width: WorkspaceListMetrics.standardIcon,
            height: WorkspaceListMetrics.standardIcon
        )
    }

    private var rail: some View {
        let hairline = 1 / displayScale
        let lastCenter = CGFloat(tabs.count) * rowHeight - rowHeight / 2
        return ZStack(alignment: .topLeading) {
            Rectangle()
                .fill(Theme.Colors.rail)
                .frame(width: hairline, height: max(0, lastCenter + railStartOffset))
                .offset(x: railLeft, y: -railStartOffset)
            ForEach(tabs.indices, id: \.self) { index in
                Rectangle()
                    .fill(Theme.Colors.rail)
                    .frame(width: elbowWidth, height: hairline)
                    .offset(
                        x: railLeft,
                        y: CGFloat(index) * rowHeight + rowHeight / 2
                    )
            }
        }
        .allowsHitTesting(false)
    }

    private var agentByTabID: [String: WorkspaceAgent] {
        var result: [String: WorkspaceAgent] = [:]
        for agent in workspace.agents {
            guard let tabID = tabID(paneKey: agent.paneKey) else { continue }
            let current = result[tabID]
            if current == nil || current?.parentPaneKey != nil && agent.parentPaneKey == nil {
                result[tabID] = agent
            }
        }
        return result
    }

    private func tabID(paneKey: String) -> String? {
        let parts = paneKey.split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty else { return nil }
        return String(parts[0])
    }

    private func tabGlyph(_ kind: WorkspaceOpenTabKind) -> AgentStartIconID {
        switch kind {
        case .terminal: .terminal
        case .browser: .globe
        case .markdown: .fileText
        case .file: .file
        }
    }
}
