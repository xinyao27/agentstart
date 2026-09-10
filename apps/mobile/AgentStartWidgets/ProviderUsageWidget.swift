import AppIntents
import SwiftUI
import WidgetKit

enum ProviderWidgetOption: String, AppEnum {
    case codex
    case claude

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Provider")
    static let caseDisplayRepresentations: [ProviderWidgetOption: DisplayRepresentation] = [
        .codex: "ChatGPT",
        .claude: "Claude",
    ]

    var snapshotKey: AgentStartWidgetProvider {
        switch self {
        case .codex: .codex
        case .claude: .claude
        }
    }
}

struct ChatGPTUsageConfigurationIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Provider Configuration"
    static let description = IntentDescription("Choose the subscription to show.")

    @Parameter(title: "Provider", default: .codex)
    var provider: ProviderWidgetOption
}

struct ClaudeUsageConfigurationIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Provider Configuration"
    static let description = IntentDescription("Choose the subscription to show.")

    @Parameter(title: "Provider", default: .claude)
    var provider: ProviderWidgetOption
}

struct ProviderUsageEntry: TimelineEntry {
    let date: Date
    let provider: ProviderWidgetSnapshot?
    let isClaude: Bool
}

struct ChatGPTUsageTimelineProvider: AppIntentTimelineProvider {
    func placeholder(in _: Context) -> ProviderUsageEntry {
        ProviderUsageEntry(date: .now, provider: nil, isClaude: false)
    }

    func snapshot(for configuration: ChatGPTUsageConfigurationIntent, in _: Context) async
        -> ProviderUsageEntry
    {
        entry(for: configuration.provider)
    }

    func timeline(for configuration: ChatGPTUsageConfigurationIntent, in _: Context) async
        -> Timeline<ProviderUsageEntry>
    {
        Timeline(entries: [entry(for: configuration.provider)], policy: .after(.now + 15 * 60))
    }

    private func entry(for selection: ProviderWidgetOption) -> ProviderUsageEntry {
        ProviderUsageEntry(
            date: .now,
            provider: AgentStartWidgetSnapshotStore.load()?.providers[
                selection.snapshotKey.rawValue],
            isClaude: selection == .claude
        )
    }
}

struct ClaudeUsageTimelineProvider: AppIntentTimelineProvider {
    func placeholder(in _: Context) -> ProviderUsageEntry {
        ProviderUsageEntry(date: .now, provider: nil, isClaude: true)
    }

    func snapshot(for configuration: ClaudeUsageConfigurationIntent, in _: Context) async
        -> ProviderUsageEntry
    {
        entry(for: configuration.provider)
    }

    func timeline(for configuration: ClaudeUsageConfigurationIntent, in _: Context) async
        -> Timeline<ProviderUsageEntry>
    {
        Timeline(entries: [entry(for: configuration.provider)], policy: .after(.now + 15 * 60))
    }

    private func entry(for selection: ProviderWidgetOption) -> ProviderUsageEntry {
        ProviderUsageEntry(
            date: .now,
            provider: AgentStartWidgetSnapshotStore.load()?.providers[
                selection.snapshotKey.rawValue],
            isClaude: selection == .claude
        )
    }
}

struct ChatGPTUsageWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: "ProviderUsageWidget",
            intent: ChatGPTUsageConfigurationIntent.self,
            provider: ChatGPTUsageTimelineProvider()
        ) { ProviderUsageWidgetView(entry: $0) }
        .configurationDisplayName("ChatGPT Usage")
        .description("Shows remaining ChatGPT subscription quota.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}

struct ClaudeUsageWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: "ClaudeUsageWidget",
            intent: ClaudeUsageConfigurationIntent.self,
            provider: ClaudeUsageTimelineProvider()
        ) { ProviderUsageWidgetView(entry: $0) }
        .configurationDisplayName("Claude Usage")
        .description("Shows remaining Claude subscription quota.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}
