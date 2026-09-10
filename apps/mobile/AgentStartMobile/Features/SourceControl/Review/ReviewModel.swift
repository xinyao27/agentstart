import Observation

nonisolated enum SourceReviewPhase: Sendable {
    case loading
    case waiting
    case ready
    case failed(String)
}

nonisolated enum SourceReviewDiffPhase: Sendable {
    case idle
    case loading(String)
    case ready(String, SourceReviewDiff)
    case failed(String, String)
}

nonisolated enum SourceReviewComposer: Hashable, Sendable {
    case create(line: Int)
    case edit(SourceReviewComment)
}

@Observable
@MainActor
final class SourceReviewModel {
    var phase = SourceReviewPhase.loading
    var isConnected = false
    var snapshot: SourceReviewSnapshot?
    var diffPhase = SourceReviewDiffPhase.idle
    var busyAction: String?
    var errorMessage: String?
    var branchComparisonError: String?
    var terminals: [SourceReviewTerminal]?
    var isLoadingTerminals = false
    var filter = SourceReviewFilter.all
    var currentIndex = 0
    var composer: SourceReviewComposer?
    var composerBody = ""
    var isShowingCompletion = false
    // Why: mirrors SourceControlModel.liveWorktreeDisplayName — refreshed on every
    // (re)connect so a rename made elsewhere is reflected, unlike the WorkspaceSummary
    // snapshot handed to this screen at navigation time (see SourceReviewView.workspaceLabel).
    var liveWorktreeDisplayName: String?

    @ObservationIgnored let hostID: String
    @ObservationIgnored let worktreeID: String
    @ObservationIgnored let repoID: String
    @ObservationIgnored let target: SourceReviewTarget
    @ObservationIgnored let sourceRepository: any SourceControlRepository
    @ObservationIgnored let reviewRepository: any SourceReviewRepository
    @ObservationIgnored let connectionRuntime: any HostConnectionRuntime
    @ObservationIgnored var loadRevision = 0
    @ObservationIgnored var diffRevision = 0
    @ObservationIgnored var didApplyTarget = false

    init(
        hostID: String,
        worktreeID: String,
        repoID: String,
        target: SourceReviewTarget,
        sourceRepository: any SourceControlRepository,
        reviewRepository: any SourceReviewRepository,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.hostID = hostID
        self.worktreeID = worktreeID
        self.repoID = repoID
        self.target = target
        filter = target.filter ?? .all
        self.sourceRepository = sourceRepository
        self.reviewRepository = reviewRepository
        self.connectionRuntime = connectionRuntime
    }

    var visibleItems: [SourceReviewItem] {
        SourceReviewProjection.filter(snapshot?.items ?? [], by: filter)
    }

    var currentItem: SourceReviewItem? {
        visibleItems.indices.contains(currentIndex) ? visibleItems[currentIndex] : nil
    }

    var reviewedCount: Int { snapshot?.items.filter(\.isReviewed).count ?? 0 }
    var unsentComments: [SourceReviewComment] {
        snapshot?.comments.filter { $0.sentAt == nil } ?? []
    }
    var reviewedUnstagedCount: Int {
        snapshot?.items.filter { $0.scope == .unstaged && $0.isReviewed && $0.canStage }.count ?? 0
    }
    var currentComments: [SourceReviewComment] {
        guard let currentItem, let snapshot else { return [] }
        return snapshot.comments.filter { SourceReviewProjection.comment($0, matches: currentItem) }
    }
    var fileComments: [SourceReviewComment] { currentComments.filter { $0.lineNumber == 0 } }

    var currentHunkCount: Int {
        guard case .ready(_, let diff) = diffPhase,
            case .document(.diff(let lines, _)) = diff
        else { return 0 }
        return sourceReviewHunkStarts(lines).count
    }

    func comments(for line: Int) -> [SourceReviewComment] {
        currentComments.filter { $0.lineNumber == line }
    }

    func requireDesktopConnection() -> Bool {
        guard isConnected else {
            errorMessage = SourceControlUnavailableError().localizedDescription
            return false
        }
        return true
    }

}
