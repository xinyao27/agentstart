import SwiftUI

struct WorkspaceSearchSheet: View {
    @Binding var searchText: String
    @Environment(\.dismiss) private var dismiss
    @FocusState private var isFocused: Bool

    var body: some View {
        NavigationStack {
            HStack(spacing: 8) {
                AgentStartIcon(.search, size: WorkspaceListMetrics.standardIcon)
                    .foregroundStyle(
                        isFocused ? Theme.Colors.foreground : Theme.Colors.mutedForeground
                    )
                    .frame(width: WorkspaceListMetrics.standardIcon)
                TextField("Search workspaces…", text: $searchText)
                    .font(.system(size: WorkspaceListMetrics.supportingText))
                    .foregroundStyle(Theme.Colors.foreground)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .accessibilityLabel("Search workspaces")
                    .focused($isFocused)
                    .submitLabel(.search)
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                        isFocused = true
                    } label: {
                        AgentStartIcon(.x, size: WorkspaceListMetrics.compactIcon)
                            .foregroundStyle(Theme.Colors.background)
                            .frame(width: 24, height: 24)
                            .background(Theme.Colors.mutedForeground, in: Circle())
                    }
                    .buttonStyle(.appPlain)
                    .frame(
                        width: Theme.Size.minimumHitTarget,
                        height: Theme.Size.minimumHitTarget
                    )
                    .contentShape(.interaction, .rect)
                    .accessibilityLabel("Clear search")
                }
            }
            .padding(.leading, 12)
            .padding(.trailing, 4)
            .frame(height: WorkspaceListMetrics.rowMinimumHeight)
            .glassEffect(.regular, in: .capsule)
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .frame(maxHeight: .infinity, alignment: .top)
            .background { AppBackground() }
            .navigationTitle("Search workspaces")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                SheetDismissToolbarItem(accessibilityLabel: "Close search") { dismiss() }
            }
            .task {
                try? await Task.sleep(for: .milliseconds(120))
                isFocused = true
            }
        }
        .appSheetPresentation(.fixed(.height(160)))
    }
}
