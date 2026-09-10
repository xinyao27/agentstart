import SwiftUI

struct AgentStartLayoutMetrics: Equatable {
    static let wideLayoutMinimum: CGFloat = 700
    static let tabletShortSideMinimum: CGFloat = 600
    static let contentMaximumWidth: CGFloat = 720
    static let modalMaximumWidth: CGFloat = 480

    let width: CGFloat
    let height: CGFloat

    init(size: CGSize) {
        width = size.width
        height = size.height
    }

    var isTabletLayout: Bool {
        min(width, height) >= Self.tabletShortSideMinimum
    }

    var isWideLayout: Bool {
        width >= Self.wideLayoutMinimum && isTabletLayout
    }
}

private struct AgentStartLayoutMetricsKey: EnvironmentKey {
    static let defaultValue = AgentStartLayoutMetrics(size: .zero)
}

extension EnvironmentValues {
    var agentstartLayoutMetrics: AgentStartLayoutMetrics {
        get { self[AgentStartLayoutMetricsKey.self] }
        set { self[AgentStartLayoutMetricsKey.self] = newValue }
    }
}
