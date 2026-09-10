import SwiftUI

struct SourceControlActionBar: View {
    @Bindable var model: SourceControlModel

    // Why: this is the exact height the bar settles to (44pt control + 8pt top/bottom
    // padding). `changesList` uses this same constant to size the List's bottom content
    // inset explicitly — GlassEffectContainer does not always report its ideal size
    // reliably to an enclosing `safeAreaInset`, which silently under-reserved space and
    // let the last rows scroll behind the bar. Pinning this frame makes the size that
    // layout sees deterministic instead of depending on that measurement.
    static let contentHeight: CGFloat = Theme.Control.largeHeight + Theme.Spacing.small * 2

    var body: some View {
        // Why: only `input`'s capsule is custom `.glassEffect` here — the primary button
        // uses the system `.glassProminent`/`.glass` button style and the sparkle button is
        // not adjacent to `input` (the primary button sits between them), so none of these
        // need (or per the Liquid Glass contract, should) share a `GlassEffectContainer`;
        // that contract reserves containers for multiple *adjacent custom* glass shapes.
        HStack(spacing: Theme.Spacing.medium) {
            input
            styledPrimaryButton
                .appButtonContext(.regular)
            if model.snapshot?.staged.isEmpty == false || model.isGeneratingCommitMessage {
                GlassIconButton(
                    iconName: model.isGeneratingCommitMessage ? .x : .sparkle,
                    accessibilityLabel: model.isGeneratingCommitMessage
                        ? "Cancel commit message generation"
                        : "Generate commit message with AI",
                    context: .large,
                    isDisabled: model.busyAction != nil
                ) {
                    Task { await model.generateOrCancelCommitMessage() }
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.vertical, Theme.Spacing.small)
        .frame(height: Self.contentHeight)
        .background(Theme.Colors.background)
    }

    @ViewBuilder
    private var styledPrimaryButton: some View {
        if model.primaryAction.isEnabled {
            primaryButton.appProminentGlassButton()
        } else {
            primaryButton.buttonStyle(.glass)
        }
    }

    private var primaryButton: some View {
        Button {
            Task { await model.runPrimaryAction() }
        } label: {
            Group {
                if model.busyAction == primaryBusyAction {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Text(model.primaryAction.label)
                        .font(.system(size: Theme.Typography.supporting))
                }
            }
            // Why: `.controlSize(.large)` (set by `.appButtonContext(.large)`) makes the
            // system `.glassProminent`/`.glass` button style pad out to a dominant pill next
            // to the field, per the button-size contract's 36pt "regular" scenario for a
            // primary action beside a peer control. Reuse that
            // same token here instead of the field's own 44pt height. Without this floor
            // SwiftUI still compresses the glass button when the input is empty, which makes
            // the footer look like a different component.
            .frame(
                minWidth: SourceControlActionBarLayout.primaryMinimumWidth,
                minHeight: Theme.Control.regularHeight
            )
        }
        .buttonBorderShape(.capsule)
        .disabled(model.busyAction != nil || !model.primaryAction.isEnabled)
    }

    @ViewBuilder
    private var input: some View {
        if model.snapshot?.staged.isEmpty == false {
            TextField("Commit message", text: $model.commitMessage)
                .font(.system(size: Theme.Typography.supporting))
                .textFieldStyle(.plain)
                .submitLabel(.done)
                .onSubmit { Task { await model.runPrimaryAction() } }
                .disabled(model.busyAction != nil)
                .padding(.horizontal, Theme.Spacing.standard)
                .frame(maxWidth: .infinity, minHeight: Theme.Size.minimumHitTarget)
                .glassEffect(.regular, in: .capsule)
        } else {
            Text("No staged files")
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .padding(.horizontal, Theme.Spacing.standard)
                .frame(
                    maxWidth: .infinity,
                    minHeight: Theme.Size.minimumHitTarget,
                    alignment: .leading
                )
                .glassEffect(.regular, in: .capsule)
        }
    }

    private var primaryBusyAction: String {
        switch model.primaryAction {
        case .commit: "commit"
        case .stageAll: "stage-all"
        case .publish: "publish"
        case .sync: "sync"
        case .pull: "pull"
        case .push(let forceWithLease): forceWithLease ? "force-push" : "push"
        case .current: ""
        }
    }
}

private enum SourceControlActionBarLayout {
    static let primaryMinimumWidth: CGFloat = 96
}
