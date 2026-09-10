import SwiftUI

struct SourceSelectionStrip<Option: Hashable, Label: View>: View {
    @Binding private var selection: Option
    private let options: [Option]
    private let label: (Option) -> Label

    init(
        selection: Binding<Option>,
        options: [Option],
        @ViewBuilder label: @escaping (Option) -> Label
    ) {
        _selection = selection
        self.options = options
        self.label = label
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.self) { option in
                Button {
                    selection = option
                } label: {
                    label(option)
                        .font(.system(size: Theme.Typography.supporting))
                        .foregroundStyle(Theme.Colors.foreground)
                        .frame(maxWidth: .infinity)
                        .frame(height: Theme.Control.inlineHeight)
                        .background(
                            selection == option ? Theme.Colors.content : .clear,
                            in: .capsule
                        )
                }
                .buttonStyle(.appPlain)
                .frame(maxWidth: .infinity, minHeight: Theme.Size.minimumHitTarget)
                .contentShape(.rect)
                .accessibilityAddTraits(selection == option ? .isSelected : [])
            }
        }
        .background {
            Capsule()
                .fill(Theme.Colors.secondary)
                .frame(height: Theme.Control.inlineHeight)
        }
    }
}
