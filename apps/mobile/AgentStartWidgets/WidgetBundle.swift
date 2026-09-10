import SwiftUI
import WidgetKit

@main
struct AgentStartWidgetBundle: WidgetBundle {
    var body: some Widget {
        ChatGPTUsageWidget()
        ClaudeUsageWidget()
        TokenUsageWidget()
    }
}
