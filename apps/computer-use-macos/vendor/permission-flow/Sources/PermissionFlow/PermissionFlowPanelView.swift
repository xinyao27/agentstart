import SwiftUI
import YiruComputerUseIcons

@available(macOS 13.0, *)
struct PermissionFlowPanelView: View {
  @ObservedObject var controller: PermissionFlowController

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      header
      if let primaryApp = controller.preferredAppURL {
        AppDragItemView(url: primaryApp) { isDragging in
          controller.setPanelDragging(isDragging)
        }
        .frame(maxWidth: .infinity)
      }
    }
    .padding(.top, 8)
    .padding(.bottom, 12)
    .padding(.horizontal, 12)
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .fixedSize(horizontal: false, vertical: true)
    .background(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .fill(.ultraThinMaterial)
        .overlay(
          RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(.primary.opacity(0.14), lineWidth: 1)
        )
    )
  }

  private var header: some View {
    HStack(alignment: .top, spacing: 3) {
      HeaderDirectionIcon(isDragging: controller.isDraggingApp)
      Text(headerTitle)
        .font(.system(size: 14))
      Spacer()
      HStack(alignment: .top, spacing: 3) {
        if !controller.isSettingsFrontmost {
          Button {
            controller.reopenCurrentSettingsPane()
          } label: {
            YiruComputerUseIcon(.settings, size: 15)
              .foregroundStyle(.primary, .secondary.opacity(0.35))
          }
          .buttonStyle(.borderless)
        }
        Button {
          controller.closePanel(returnToPreviousApp: true)
        } label: {
          YiruComputerUseIcon(.close, size: 18)
            .foregroundStyle(.primary, .secondary.opacity(0.35))
        }
        .buttonStyle(.borderless)
      }
    }
  }

  private var headerTitle: AttributedString {
    let template = PermissionFlowLocalizer.string(
      "permission_flow.panel.title",
      fallback: "Drag **%@** to the list above to allow **%@**.",
      localeIdentifier: controller.localeIdentifier
    )
    let markdown = String(
      format: template,
      locale: localizationLocale,
      appDisplayName,
      paneDisplayTitle
    )
    return
      (try? AttributedString(
        markdown: markdown,
        options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
      )) ?? AttributedString(markdown)
  }

  private var appDisplayName: String {
    guard let appURL = controller.preferredAppURL else {
      return PermissionFlowLocalizer.string(
        "permission_flow.app.this_app",
        fallback: "This App",
        localeIdentifier: controller.localeIdentifier
      )
    }
    return FileManager.default.displayName(atPath: appURL.path)
  }

  private var paneDisplayTitle: String {
    controller.currentPane?.localizedTitle(
      localeIdentifier: controller.localeIdentifier
    )
      ?? PermissionFlowLocalizer.string(
        "permission_flow.pane.permission",
        fallback: "Permission",
        localeIdentifier: controller.localeIdentifier
      )
  }

  private var localizationLocale: Locale {
    controller.localeIdentifier.map(Locale.init(identifier:)) ?? .current
  }
}

@available(macOS 13.0, *)
private struct HeaderDirectionIcon: View {
  let isDragging: Bool
  @State private var wigglePhase = false
  @State private var scalePhase = false

  var body: some View {
    YiruComputerUseIcon(.dragDirection, size: 14)
      .foregroundStyle(.tint)
      .rotationEffect(.degrees(isDragging ? 0 : (wigglePhase ? 12 : -12)))
      .offset(y: isDragging ? 0 : (wigglePhase ? -2 : 1))
      .scaleEffect(isDragging ? (scalePhase ? 1.18 : 0.88) : 1)
      .animation(
        isDragging
          ? .easeInOut(duration: 0.68).repeatForever(autoreverses: true)
          : .easeInOut(duration: 0.22).repeatForever(autoreverses: true),
        value: isDragging ? scalePhase : wigglePhase
      )
      .onAppear {
        wigglePhase = true
      }
      .onChange(of: isDragging) { _, dragging in
        if dragging {
          scalePhase = true
          wigglePhase = false
        } else {
          scalePhase = false
          wigglePhase = true
        }
      }
  }
}
