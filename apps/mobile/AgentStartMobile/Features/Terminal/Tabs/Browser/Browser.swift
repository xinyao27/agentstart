import Foundation

nonisolated enum WorkspaceBrowserViewMode: String, Hashable, Sendable {
    case web
    case mobile
}

nonisolated struct WorkspaceBrowserStreamConfiguration: Hashable, Sendable {
    let width: Int
    let height: Int
    let scale: Double
    let viewMode: WorkspaceBrowserViewMode
}

nonisolated struct WorkspaceBrowserFrameMetadata: Decodable, Hashable, Sendable {
    let offsetTop: Double?
    let pageScaleFactor: Double?
    let deviceWidth: Double?
    let deviceHeight: Double?
    let imageWidth: Double?
    let imageHeight: Double?
    let scrollOffsetX: Double?
    let scrollOffsetY: Double?
    let timestamp: Double?
}

nonisolated struct WorkspaceBrowserFrame: Sendable {
    let sequence: UInt32
    let format: String
    let metadata: WorkspaceBrowserFrameMetadata
    let image: Data
}

nonisolated struct WorkspaceBrowserDialog: Sendable {
    let type: String
    let message: String
}

nonisolated enum WorkspaceBrowserEvent: Sendable {
    case ready(url: String, title: String)
    case frame(WorkspaceBrowserFrame)
    case dialog(WorkspaceBrowserDialog)
    case dialogClosed
    case end
    case error(String)
}

nonisolated enum WorkspaceBrowserNavigation: Sendable {
    case back
    case forward
    case reload
}

nonisolated struct WorkspaceBrowserPoint: Sendable {
    let x: Double
    let y: Double
}

nonisolated enum WorkspaceBrowserButton: String, Sendable {
    case left
    case right
    case middle
}

nonisolated enum WorkspaceBrowserPointerModifier: String, CaseIterable, Hashable, Sendable {
    case command = "cmd"
    case control = "ctrl"
    case option = "alt"
    case shift

    var label: String {
        switch self {
        case .command: "Cmd"
        case .control: "Ctrl"
        case .option: "Alt"
        case .shift: "Shift"
        }
    }
}
