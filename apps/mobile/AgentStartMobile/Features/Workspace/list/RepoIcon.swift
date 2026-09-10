import CoreGraphics
import SwiftUI

struct WorkspaceRepoIconView: View {
    let icon: WorkspaceRepoIcon?
    let remoteSlug: WorkspaceRepoSlug?
    let size: CGFloat

    var body: some View {
        Group {
            switch icon {
            case .lucide(let name):
                AgentStartIcon(agentstartIconID(name), size: size)
                    .foregroundStyle(Theme.Colors.mutedForeground)
            case .emoji(let emoji):
                Text(emoji)
                    .font(.system(size: size))
                    .lineLimit(1)
            case .image(let data, let url, let label):
                repoImage(data: data, url: url)
                    .accessibilityLabel(
                        label.map { Text(verbatim: $0) } ?? Text("Repository icon")
                    )
            case nil:
                if let remoteSlug {
                    remoteRepoImage(remoteSlug)
                } else {
                    AgentStartIcon(.folder, size: size)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
            }
        }
        .frame(width: size, height: size)
    }

    private func remoteRepoImage(_ slug: WorkspaceRepoSlug) -> some View {
        let encodedOwner =
            slug.owner.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
            ?? slug.owner
        let url = URL(string: "https://github.com/\(encodedOwner).png?size=64")
        return AsyncImage(url: url) { phase in
            if let image = phase.image {
                image.resizable().scaledToFit()
            } else {
                AgentStartIcon(.folder, size: size)
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
        }
        .accessibilityLabel(Text(verbatim: "\(slug.owner)/\(slug.repo)"))
    }

    @ViewBuilder
    private func repoImage(data: Data?, url: URL?) -> some View {
        if let data {
            WorkspaceRepoDataImage(data: data, size: size)
        } else if let url {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFit()
                } else {
                    AgentStartIcon(.folder, size: size)
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
            }
        } else {
            AgentStartIcon(.folder, size: size)
                .foregroundStyle(Theme.Colors.mutedForeground)
        }
    }

    private func agentstartIconID(_ name: String) -> AgentStartIconID {
        switch name {
        case "Code2": .code
        case "SquareTerminal": .terminalWindow
        case "Bot": .robot
        case "Package": .package
        case "Database": .database
        case "Globe": .globe
        case "Server": .hardDrives
        case "Layers": .stack
        case "Box": .cube
        case "Braces": .braces
        case "Briefcase": .briefcase
        case "Building2": .buildings
        case "Cpu": .cpu
        case "Gauge": .gauge
        case "Palette": .palette
        case "Rocket": .rocket
        case "Shapes": .shapes
        case "Sparkles": .sparkle
        case "Wrench": .wrench
        default: .folder
        }
    }
}

private struct WorkspaceRepoDataImage: View {
    let data: Data
    let size: CGFloat
    @State private var image: CGImage?

    var body: some View {
        if let image {
            Image(decorative: image, scale: 1, orientation: .up)
                .resizable()
                .scaledToFit()
        } else {
            AgentStartIcon(.folder, size: size)
                .foregroundStyle(Theme.Colors.mutedForeground)
                .task {
                    let decodedImage = await Task.detached(priority: .userInitiated) {
                        PlatformImageDecoder.decode(data, maxPixelSize: max(64, Int(size * 3)))
                    }.value
                    guard !Task.isCancelled else { return }
                    image = decodedImage
                }
        }
    }
}
