import CoreGraphics

nonisolated enum TerminalChromeMetrics {
    static let horizontalInset: CGFloat = 12

    static let tabStripHeight: CGFloat = 44
    static let tabGap: CGFloat = 8
    static let tabMinimumWidth: CGFloat = 96
    static let tabMaximumWidth: CGFloat = 160
    static let tabVisualHeight: CGFloat = 36
    static let tabIcon: CGFloat = 16
    static let tabText: CGFloat = 15
    static let tabHorizontalPadding: CGFloat = 12
    // Why: the strip owns the 12pt outer inset and the tab control owns its 12pt content
    // padding. A third inset moves the first tab off the leading anchor and changes how many
    // tabs fit before the add action.
    static let tabLeadingInset: CGFloat = 0

    static let actionVisualSize: CGFloat = 36
    static let actionHitSize: CGFloat = 44
    static let actionIcon: CGFloat = 17

    static let dockTopPadding: CGFloat = 4
    static let accessoryRowHeight: CGFloat = 52
    static let accessoryGap: CGFloat = 6
    static let accessoryVisualSize: CGFloat = 40
    static let accessoryHitSize: CGFloat = 44
    // Why: a 14pt monospaced label. At 16pt the capsule keys grow wide enough to drop a
    // shortcut off the end of the bar.
    static let accessoryText: CGFloat = 14
    static let accessoryIcon: CGFloat = 18
    static let accessoryKeyIcon: CGFloat = 20
    static let accessoryControlIcon: CGFloat = 28
    static let accessoryModifierGlyph: CGFloat = 18
    static let accessoryChordGap: CGFloat = 3
    static let accessoryGlyph: CGFloat = 22

    static let connectionCornerRadius: CGFloat = 12
    static let connectionText: CGFloat = 13
    static let connectionIndicator: CGFloat = 6
}
