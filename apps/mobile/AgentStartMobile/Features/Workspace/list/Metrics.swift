import CoreGraphics

nonisolated enum WorkspaceListMetrics {
    static let horizontalGap: CGFloat = 6
    static let leadingColumn: CGFloat = 20
    static let openTabHeight: CGFloat = 24
    static let rowMinimumHeight: CGFloat = 44
    static let sectionHeight: CGFloat = 44
    static let sectionRailStart: CGFloat = 32
    static let titleLineHeight: CGFloat = 20
    // Why: the compact list keeps a small shrinkable title column even when a row has no
    // trailing badge. This is the width at which an iPhone row starts to ellipsize, chosen so
    // the branch name's meaningful tail stays visible before it does.
    static let compactTitleMaximumWidth: CGFloat = 320

    static let titleText: CGFloat = Theme.Typography.primary
    static let supportingText: CGFloat = Theme.Typography.supporting
    static let metadataText: CGFloat = Theme.Typography.metadata

    static let projectIcon: CGFloat = 20
    static let standardIcon: CGFloat = 16
    static let compactIcon: CGFloat = 12

    static let workspaceLoader: CGFloat = 16
    static let statusDot: CGFloat = 12
    static let agentState: CGFloat = 10
    static let agentDot: CGFloat = 6
}
