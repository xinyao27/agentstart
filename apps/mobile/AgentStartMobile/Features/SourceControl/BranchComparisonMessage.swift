import Foundation

nonisolated enum SourceBranchComparisonMessage {
    static func describe(_ error: Error) -> String {
        if let sourceError = error as? SourceControlRepositoryError,
            case .missingBaseRef = sourceError
        {
            return String(localized: "Unable to resolve the base branch for comparison.")
        }
        return error.localizedDescription
    }
}
