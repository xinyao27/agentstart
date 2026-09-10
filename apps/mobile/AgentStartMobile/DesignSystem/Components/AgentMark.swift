import SwiftUI
import UIKit

struct AgentMark: View {
    let agentID: String
    var size: CGFloat = 16

    var body: some View {
        Group {
            if let asset = assetName {
                Image(asset)
                    .renderingMode(usesTemplate ? .template : .original)
                    .resizable()
                    .scaledToFit()
            } else if let bundledImage {
                Image(uiImage: bundledImage)
                    .resizable()
                    .scaledToFit()
            } else if agentID == "__blank__" || agentID == "blank" {
                AgentStartIcon(.terminal, size: size)
            } else {
                Text(verbatim: String(agentID.prefix(1)).uppercased())
                    .font(.system(size: size * 0.55, weight: .bold))
                    .frame(width: size, height: size)
                    .background(Theme.Colors.selection)
            }
        }
        .foregroundStyle(Theme.Colors.foreground)
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var assetName: String? {
        switch agentID {
        case "claude": "agent-claude"
        case "codex": "agent-openai"
        case "pi": "agent-pi"
        case "omp": "agent-omp"
        case "aider": "agent-aider"
        default: nil
        }
    }

    private var usesTemplate: Bool {
        assetName == "agent-openai" || assetName == "agent-pi" || assetName == "agent-aider"
    }

    private var bundledImage: UIImage? {
        let cacheKey = agentID as NSString
        if let cached = Self.bundledImageCache.object(forKey: cacheKey) {
            return cached
        }
        guard Self.bundledAgentIDs.contains(agentID),
            let url = Bundle.main.url(
                forResource: agentID,
                withExtension: "png",
                subdirectory: "agent-icons"
            )
        else { return nil }
        guard let image = UIImage(contentsOfFile: url.path) else { return nil }
        Self.bundledImageCache.setObject(image, forKey: cacheKey)
        return image
    }

    private static let bundledImageCache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 64
        return cache
    }()

    private static let bundledAgentIDs: Set<String> = [
        "amp", "ante", "antigravity", "aug", "autohand", "cline", "codebuff",
        "command-code", "continue", "copilot", "crush", "cursor", "devin", "droid",
        "gemini", "goose", "grok", "hermes", "kilo", "kimi", "kiro", "mimo-code",
        "mistral-vibe", "openclaude", "openclaw", "opencode", "qwen-code", "rovo",
    ]
}
