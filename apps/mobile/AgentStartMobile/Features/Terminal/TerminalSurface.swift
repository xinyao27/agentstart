import Foundation
import SwiftUI
import UIKit

nonisolated struct TerminalGridSize: Equatable, Sendable {
    let columns: Int
    let rows: Int
}

nonisolated struct TerminalSurfaceConfiguration: Equatable, Sendable {
    let fontSize: CGFloat
    let scrollbackLines: Int
    let accessoryKeys: [TerminalAccessoryKey]
    let customAccessoryKeys: [TerminalCustomKey]

    static func standard(
        textScale: Double = 1,
        accessoryKeys: [TerminalAccessoryKey] = TerminalAccessoryKey.standardVisibleOrder,
        customAccessoryKeys: [TerminalCustomKey] = []
    ) -> TerminalSurfaceConfiguration {
        TerminalSurfaceConfiguration(
            fontSize: Theme.Typography.code * textScale,
            scrollbackLines: 10_000,
            accessoryKeys: accessoryKeys,
            customAccessoryKeys: customAccessoryKeys
        )
    }
}

@MainActor
struct TerminalSurfaceEvents {
    var onInput: (Data) -> Void
    var onQueryReply: (Data) -> Void
    var onResize: (TerminalGridSize) -> Void
    var onTitleChange: (String) -> Void
    var onDirectoryChange: (String?) -> Void
    var onOpenLink: (String, [String: String]) -> Void
    var onClipboardWriteRequest: (Data) -> Void
    var onBell: () -> Void

    static let inactive = TerminalSurfaceEvents(
        onInput: { _ in },
        onQueryReply: { _ in },
        onResize: { _ in },
        onTitleChange: { _ in },
        onDirectoryChange: { _ in },
        onOpenLink: { _, _ in },
        onClipboardWriteRequest: { _ in },
        onBell: {}
    )
}

@MainActor
protocol TerminalSurface: AnyObject {
    var events: TerminalSurfaceEvents { get set }
    var view: UIView { get }
    var accessoryState: TerminalAccessoryState { get }

    func feed(_ bytes: Data)
    func restore(_ snapshot: TerminalReplaySnapshot)
    func synchronizeGrid(to size: TerminalGridSize)
    func clear()
    func focus()
    func apply(_ configuration: TerminalSurfaceConfiguration)
    func setInputEnabled(_ isEnabled: Bool)
}

nonisolated protocol TerminalSurfaceFactory: Sendable {
    @MainActor
    func makeSurface(configuration: TerminalSurfaceConfiguration) -> any TerminalSurface
}

struct TerminalSurfaceHost: UIViewRepresentable {
    let surface: any TerminalSurface

    func makeUIView(context: Context) -> UIView {
        surface.view
    }

    func updateUIView(_ uiView: UIView, context: Context) {}

    func sizeThatFits(
        _ proposal: ProposedViewSize,
        uiView: UIView,
        context: Context
    ) -> CGSize? {
        guard let width = proposal.width, let height = proposal.height,
            width.isFinite, height.isFinite,
            width > 0, height > 0
        else {
            return nil
        }
        return CGSize(width: width, height: height)
    }
}
