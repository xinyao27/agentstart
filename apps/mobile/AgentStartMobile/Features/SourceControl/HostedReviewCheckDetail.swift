import SwiftUI

nonisolated enum HostedReviewCheckDetailPhase: Sendable {
    case loading
    case loaded(HostedReviewCheckRunDetails?)
    case failed(String)
}

// Why: GitHub returns raw enum tokens for check state ("failure", "timed_out",
// "in_progress"). Printed straight into the UI they appear as lowercase snake_case beside
// properly-cased labels, and they are never localized. One mapper keeps every check surface —
// the row's own status, its jobs, and its steps — on the same vocabulary.
nonisolated func hostedReviewCheckOutcomeLabel(conclusion: String?, status: String?) -> String {
    guard let token = conclusion ?? status else { return String(localized: "Unknown") }
    switch token {
    case "success": return String(localized: "Successful")
    case "failure": return String(localized: "Failed")
    case "cancelled": return String(localized: "Cancelled")
    case "timed_out": return String(localized: "Timed out")
    case "neutral": return String(localized: "Neutral")
    case "skipped": return String(localized: "Skipped")
    case "action_required": return String(localized: "Action required")
    case "stale": return String(localized: "Stale")
    case "in_progress": return String(localized: "In progress")
    case "queued": return String(localized: "Queued")
    case "waiting": return String(localized: "Waiting")
    case "pending": return String(localized: "Pending")
    // Why: an unrecognized token is surfaced as-is rather than flattened to "Unknown" —
    // GitHub adds states, and the raw value tells the user more than a wrong label would.
    default: return token
    }
}

struct HostedReviewCheckDetailView: View {
    let phase: HostedReviewCheckDetailPhase?

    var body: some View {
        Group {
            switch phase {
            case .none, .loading:
                ProgressView()
                    .controlSize(.small)
                    .frame(maxWidth: .infinity, alignment: .leading)
            case .failed(let message):
                Text(verbatim: message)
            case .loaded(nil):
                Text("No details available.")
            case .loaded(let details?):
                detailsView(details)
            }
        }
        .font(.system(size: Theme.Typography.metadata))
        .foregroundStyle(Theme.Colors.mutedForeground)
        .padding(
            .leading,
            Theme.Control.inlineIcon
                + Theme.Spacing.small
                + Theme.Control.statusIndicator
        )
        .padding(.trailing, Theme.Spacing.extraSmall)
        .padding(.bottom, Theme.Spacing.medium)
    }

    private func detailsView(_ details: HostedReviewCheckRunDetails) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
            ForEach(summaryLines(details), id: \.self) { line in Text(verbatim: line) }
            let annotations = Array(details.annotations.prefix(20))
            if !annotations.isEmpty {
                detailGroup("Annotations") {
                    ForEach(annotations) { annotation in annotationRow(annotation) }
                    if details.annotations.count > annotations.count {
                        Text("Showing first 20 annotations")
                    }
                }
            }
            let jobs = visibleJobs(details.jobs)
            if !jobs.isEmpty {
                detailGroup(hasFailingJob(details.jobs) ? "Failed jobs" : "Jobs") {
                    ForEach(Array(jobs.prefix(100)), id: \.stableID) { job in jobRow(job) }
                    if jobs.count > 100 { Text("Showing first 100 jobs") }
                }
            }
            if summaryLines(details).isEmpty, annotations.isEmpty, jobs.isEmpty {
                Text("No details available.")
            }
        }
    }

    private func annotationRow(_ annotation: HostedReviewCheckAnnotation) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
            Text(verbatim: annotationLocator(annotation))
                .font(.system(size: Theme.Typography.metadata, design: .monospaced))
            if let title = annotation.title, !title.isEmpty {
                Text(verbatim: title)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.foreground)
            }
            Text(verbatim: annotation.message)
        }
    }

    private func jobRow(_ job: HostedReviewCheckJob) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.extraSmall) {
            HStack(spacing: Theme.Spacing.small) {
                Text(verbatim: job.name)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.foreground)
                    .lineLimit(1)
                Spacer(minLength: Theme.Spacing.small)
                Text(
                    verbatim: hostedReviewCheckOutcomeLabel(
                        conclusion: job.conclusion, status: job.status))
            }
            ForEach(failedSteps(job.steps)) { step in
                HStack(spacing: Theme.Spacing.small) {
                    Text(verbatim: step.name).lineLimit(1)
                    Spacer(minLength: Theme.Spacing.small)
                    Text(
                        verbatim: hostedReviewCheckOutcomeLabel(
                            conclusion: step.conclusion, status: step.status))
                }
            }
            if let logTail = job.logTail, !logTail.isEmpty {
                ScrollView([.horizontal, .vertical]) {
                    Text(verbatim: logTail)
                        .font(.system(size: Theme.Typography.metadata, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 160)
                .padding(Theme.Spacing.small)
                .background(
                    Theme.Colors.content,
                    in: .rect(cornerRadius: Theme.Radius.control)
                )
            }
        }
    }

    private func detailGroup<Content: View>(
        _ title: LocalizedStringResource,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.small) {
            Text(title)
                .font(.system(size: Theme.Typography.metadata, weight: .semibold))
                .textCase(.uppercase)
            content()
        }
    }

    // Why: the check row directly above this detail already shows the mapped status
    // ("Failed"), so including the raw conclusion here printed the same state a third time —
    // as a lowercase API token — right under it.
    private func summaryLines(_ details: HostedReviewCheckRunDetails) -> [String] {
        [details.title, details.summary]
            .compactMap { value in
                guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                else { return nil }
                return value
            }
    }

    private func annotationLocator(_ annotation: HostedReviewCheckAnnotation) -> String {
        let location = annotation.path ?? String(localized: "Annotation")
        let line = annotation.startLine.map { ":\($0)" } ?? ""
        let level = annotation.level.map { " · \($0)" } ?? ""
        return "\(location)\(line)\(level)"
    }

    private func isFailure(_ value: String?) -> Bool {
        ["failure", "failed", "cancelled", "timed_out"].contains(value)
    }

    private func hasFailingJob(_ jobs: [HostedReviewCheckJob]) -> Bool {
        jobs.contains { isFailure($0.conclusion ?? $0.status) }
    }

    private func visibleJobs(_ jobs: [HostedReviewCheckJob]) -> [HostedReviewCheckJob] {
        let failed = jobs.filter { isFailure($0.conclusion ?? $0.status) }
        return failed.isEmpty ? jobs : failed
    }

    private func failedSteps(_ steps: [HostedReviewCheckStep]) -> [HostedReviewCheckStep] {
        steps.filter { isFailure($0.conclusion ?? $0.status) }
    }
}
