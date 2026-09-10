import SwiftUI

struct AccountProviderMark: View {
    let provider: AccountProvider

    var body: some View {
        Image(assetName)
            .renderingMode(provider == .codex ? .template : .original)
            .resizable()
            .scaledToFit()
            .foregroundStyle(Theme.Colors.foreground)
            .frame(width: 15, height: 15)
            .accessibilityHidden(true)
    }

    private var assetName: String {
        switch provider {
        case .claude: "agent-claude"
        case .codex: "agent-openai"
        case .cursor: "agent-cursor"
        case .gemini: "agent-gemini"
        case .opencodeGo: "agent-opencode"
        case .kimi: "agent-kimi"
        case .antigravity: "agent-antigravity"
        case .minimax: "agent-minimax"
        case .grok: "agent-grok"
        }
    }
}
