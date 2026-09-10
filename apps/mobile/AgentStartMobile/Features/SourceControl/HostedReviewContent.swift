import SwiftUI

struct HostedReviewReadyContent: View {
    @Bindable var model: HostedReviewModel
    @Binding var confirmation: HostedReviewConfirmation?
    @Binding var isShowingReviewers: Bool
    @Binding var isEditingTitle: Bool
    let review: HostedReview
    let details: HostedReviewDetails?
    let checks: [HostedReviewCheck]

    var body: some View {
        HostedReviewPage {
            HostedReviewIdentityCard(
                review: review,
                details: details,
                isBusy: model.busyAction != nil,
                editTitle: review.provider == .github ? { isEditingTitle = true } : nil,
                setAutoMerge: { enabled in
                    Task {
                        await model.mutate(
                            .setAutoMerge(
                                enabled: enabled,
                                method: review.preferredMergeMethod
                            ),
                            action: "auto-merge"
                        )
                    }
                },
                confirm: { confirmation = $0 }
            )
            if let conflict = review.conflict {
                HostedReviewConflictCard(
                    conflict: conflict,
                    isBusy: model.busyAction == HostedReviewTriageAction.conflicts.busyKey,
                    errorMessage: model.triageErrorMessage,
                    resolve: {
                        Task {
                            await model.launchTriage(
                                .conflicts,
                                prompt: HostedReviewTriagePrompt.resolveConflicts(
                                    review: review,
                                    conflict: conflict
                                )
                            )
                        }
                    }
                )
            }
            if review.provider == .github {
                HostedReviewReviewersCard(
                    reviewers: details?.reviewers ?? [],
                    busyAction: model.busyAction,
                    showPicker: {
                        isShowingReviewers = true
                        Task { await model.loadAssignableUsers() }
                    },
                    remove: { login in
                        Task {
                            await model.mutate(
                                .removeReviewer(login),
                                action: "reviewer:\(login)"
                            )
                        }
                    }
                )
                HostedReviewChecksCard(
                    checks: checks,
                    isBusy: model.busyAction == "rerun",
                    isTriageBusy: model.busyAction == HostedReviewTriageAction.checks.busyKey,
                    triageErrorMessage: model.triageErrorMessage,
                    rerun: {
                        Task { await model.mutate(.rerunFailedChecks, action: "rerun") }
                    },
                    fix: {
                        Task {
                            await model.launchTriage(
                                .checks,
                                prompt: HostedReviewTriagePrompt.fixChecks(
                                    review: review,
                                    checks: checks
                                )
                            )
                        }
                    },
                    loadDetails: { try await model.checkDetails(for: $0) }
                )
                HostedReviewDescriptionCard(content: details?.body)
                HostedReviewCommentsCard(
                    comments: details?.comments,
                    isBusy: model.busyAction?.hasPrefix("comment") == true,
                    addComment: { body in
                        await model.mutate(.addComment(body), action: "comment:new")
                    },
                    reply: { comment, body in
                        await model.mutate(
                            .reply(comment: comment, body: body),
                            action: "comment:reply:\(comment.id)"
                        )
                    },
                    resolve: { comment in
                        guard let threadID = comment.threadID else { return }
                        await model.mutate(
                            .resolveThread(id: threadID, resolve: !comment.isResolved),
                            action: "comment:\(comment.id)"
                        )
                    }
                )
            } else {
                HostedReviewSection(title: "Provider") {
                    Text("Detailed review actions are managed on \(review.provider.title).")
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.mutedForeground)
                }
            }
        }
    }
}
