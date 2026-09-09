import AppKit
import SwiftUI
import YiruComputerUseIcons

@available(macOS 13.0, *)
public struct PermissionFlowButton: View {
  @Environment(\.locale) private var locale
  @StateObject private var controller: PermissionFlowController
  @State private var buttonState = PermissionFlowButtonState.make(from: .checking)

  private let pane: PermissionFlowPane
  private let suggestedAppURLs: [URL]
  private let title: String?
  private let customLabel: ((PermissionFlowButtonState) -> AnyView)?

  public init(
    title: String? = nil,
    pane: PermissionFlowPane,
    suggestedAppURLs: [URL] = [],
    configuration: PermissionFlowConfiguration = .init()
  ) {
    _controller = StateObject(
      wrappedValue: PermissionFlowController(configuration: configuration)
    )
    self.pane = pane
    self.suggestedAppURLs = suggestedAppURLs
    self.title = title
    self.customLabel = nil
  }

  public init<Content: View>(
    pane: PermissionFlowPane,
    suggestedAppURLs: [URL] = [],
    configuration: PermissionFlowConfiguration = .init(),
    @ViewBuilder label: @escaping (PermissionFlowButtonState) -> Content
  ) {
    _controller = StateObject(
      wrappedValue: PermissionFlowController(configuration: configuration)
    )
    self.pane = pane
    self.suggestedAppURLs = suggestedAppURLs
    self.title = nil
    self.customLabel = { AnyView(label($0)) }
  }

  public var body: some View {
    Button {
      authorize()
    } label: {
      if let customLabel {
        customLabel(buttonState)
      } else {
        Label {
          Text(
            title
              ?? PermissionFlowLocalizer.string(
                buttonState.titleKey,
                fallback: buttonState.titleKey,
                localeIdentifier: locale.identifier
              ),
          )
        } icon: {
          YiruComputerUseIcon(buttonState.icon, size: 18)
            .foregroundColor(buttonState.isGranted ? .green : .primary)
        }
      }
    }
    .onAppear(perform: refreshAuthorizationStatus)
    .onReceive(
      NotificationCenter.default.publisher(
        for: NSApplication.didBecomeActiveNotification
      )
    ) { _ in
      refreshAuthorizationStatus()
    }
  }

  private func authorize() {
    controller.setLocaleIdentifier(locale.identifier)
    if pane == .microphone {
      requestMicrophoneAuthorization()
      return
    }
    let mouse = NSEvent.mouseLocation
    let sourceFrame = CGRect(x: mouse.x - 16, y: mouse.y - 16, width: 32, height: 32)
    controller.authorize(
      pane: pane,
      suggestedAppURLs: suggestedAppURLs,
      sourceFrameInScreen: sourceFrame
    )
  }

  private func requestMicrophoneAuthorization() {
    buttonState = .make(from: .checking)
    MicrophonePermissionStatusProvider().requestAuthorization { authorizationState in
      Task { @MainActor in
        buttonState = .make(from: authorizationState)
        controller.authorize(pane: .microphone)
      }
    }
  }

  private func refreshAuthorizationStatus() {
    buttonState = .make(
      from: PermissionStatusRegistry.provider(for: pane).authorizationState()
    )
  }
}
