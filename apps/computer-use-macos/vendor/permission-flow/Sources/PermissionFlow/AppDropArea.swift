import AppKit
import SwiftUI
import YiruComputerUseIcons

@available(macOS 13.0, *)
struct AppDragItemView: NSViewRepresentable {
  let url: URL
  let onDragStateChange: (Bool) -> Void

  func makeNSView(context: Context) -> AppDragSourceView {
    let view = AppDragSourceView(url: url)
    view.onDragStateChange = onDragStateChange
    return view
  }

  func updateNSView(_ nsView: AppDragSourceView, context: Context) {
    nsView.update(url: url)
    nsView.onDragStateChange = onDragStateChange
  }
}

@available(macOS 13.0, *)
final class AppDragSourceView: NSView, NSDraggingSource {
  var onDragStateChange: ((Bool) -> Void)?

  private var url: URL
  private let hostingView: NSHostingView<AnyView>
  private var mouseDownPoint: NSPoint?
  private var hasBegunDragging = false

  init(url: URL) {
    self.url = url
    hostingView = NSHostingView(
      rootView: AnyView(AppDragCardContent(url: url).allowsHitTesting(false))
    )
    super.init(frame: .zero)
    hostingView.translatesAutoresizingMaskIntoConstraints = false
    addSubview(hostingView)
    NSLayoutConstraint.activate([
      hostingView.leadingAnchor.constraint(equalTo: leadingAnchor),
      hostingView.trailingAnchor.constraint(equalTo: trailingAnchor),
      hostingView.topAnchor.constraint(equalTo: topAnchor),
      hostingView.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError()
  }

  func update(url: URL) {
    self.url = url
    hostingView.rootView = AnyView(
      AppDragCardContent(url: url).allowsHitTesting(false)
    )
    invalidateIntrinsicContentSize()
  }

  override func hitTest(_ point: NSPoint) -> NSView? {
    bounds.contains(point) ? self : nil
  }

  override var intrinsicContentSize: NSSize {
    NSSize(
      width: NSView.noIntrinsicMetric,
      height: max(88, hostingView.fittingSize.height)
    )
  }

  override func mouseDown(with event: NSEvent) {
    mouseDownPoint = convert(event.locationInWindow, from: nil)
    hasBegunDragging = false
  }

  override func mouseDragged(with event: NSEvent) {
    guard !hasBegunDragging, let mouseDownPoint else { return }
    let point = convert(event.locationInWindow, from: nil)
    guard hypot(point.x - mouseDownPoint.x, point.y - mouseDownPoint.y) > 4 else {
      return
    }
    hasBegunDragging = true
    beginAppDrag(with: event)
  }

  override func mouseUp(with event: NSEvent) {
    mouseDownPoint = nil
    hasBegunDragging = false
  }

  func draggingSession(
    _ session: NSDraggingSession,
    sourceOperationMaskFor context: NSDraggingContext
  ) -> NSDragOperation {
    .copy
  }

  func ignoreModifierKeys(for session: NSDraggingSession) -> Bool {
    true
  }

  func draggingSession(
    _ session: NSDraggingSession,
    willBeginAt screenPoint: NSPoint
  ) {
    onDragStateChange?(true)
  }

  func draggingSession(
    _ session: NSDraggingSession,
    endedAt screenPoint: NSPoint,
    operation: NSDragOperation
  ) {
    onDragStateChange?(false)
    mouseDownPoint = nil
    hasBegunDragging = false
  }

  private func beginAppDrag(with event: NSEvent) {
    let writer = AppBundlePasteboardWriter(url: url)
    let draggingItem = NSDraggingItem(pasteboardWriter: writer)
    let icon = NSWorkspace.shared.icon(forFile: url.path)
    icon.size = NSSize(width: 56, height: 56)
    let point = convert(event.locationInWindow, from: nil)
    draggingItem.setDraggingFrame(
      NSRect(x: point.x - 28, y: point.y - 28, width: 56, height: 56),
      contents: icon
    )
    let draggingSession = beginDraggingSession(
      with: [draggingItem],
      event: event,
      source: self
    )
    draggingSession.animatesToStartingPositionsOnCancelOrFail = true
    draggingSession.draggingFormation = .none
  }
}

@available(macOS 13.0, *)
private final class AppBundlePasteboardWriter: NSObject, NSPasteboardWriting {
  private let url: URL

  init(url: URL) {
    self.url = url
  }

  func writableTypes(for pasteboard: NSPasteboard) -> [NSPasteboard.PasteboardType] {
    [
      .fileURL,
      .URL,
      NSPasteboard.PasteboardType("NSFilenamesPboardType"),
      NSPasteboard.PasteboardType("com.apple.pasteboard.promised-file-url"),
      .string,
    ]
  }

  func pasteboardPropertyList(forType type: NSPasteboard.PasteboardType) -> Any? {
    switch type {
    case .fileURL, .URL,
      NSPasteboard.PasteboardType("com.apple.pasteboard.promised-file-url"):
      return url.absoluteString
    case NSPasteboard.PasteboardType("NSFilenamesPboardType"):
      return [url.path]
    case .string:
      return url.path
    default:
      return nil
    }
  }
}

@available(macOS 13.0, *)
private struct AppDragCardContent: View {
  @Environment(\.locale) private var locale
  let url: URL

  var body: some View {
    HStack(spacing: 8) {
      Image(nsImage: NSWorkspace.shared.icon(forFile: url.path))
        .resizable()
        .frame(width: 32, height: 32)
        .cornerRadius(10)
      Text(url.deletingPathExtension().lastPathComponent)
        .font(.system(size: 16, weight: .regular))
        .foregroundStyle(.primary)
      Spacer()
      VStack(spacing: 0) {
        YiruComputerUseIcon(.drag, size: 14)
        Text(
          PermissionFlowLocalizer.string(
            "permission_flow.drag.label",
            fallback: "Drag",
            localeIdentifier: locale.identifier
          )
        )
        .font(.system(size: 8, weight: .light))
      }
      .foregroundStyle(.secondary)
      .padding(.trailing, 6)
    }
    .padding(6)
    .background(
      .background.opacity(0.65),
      in: RoundedRectangle(cornerRadius: 16, style: .continuous)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(.primary.opacity(0.085), lineWidth: 1)
    )
  }
}
