import SwiftUI

struct WorkspaceBrowserPane: View {
    let descriptor: WorkspaceBrowserTab
    let isVisible: Bool
    let browserSupported: Bool?
    let connectionReady: Bool
    @State var model: WorkspaceBrowserModel
    @State var viewMode: WorkspaceBrowserViewMode
    @State private var zoomScale: CGFloat = 1
    @State private var zoomOffset = CGSize.zero
    @State private var lastTouchLocation = CGPoint.zero
    @State private var isPointerGestureActive = false
    @State private var didLongPress = false
    @State private var lastScrollTranslation = CGSize.zero
    @State private var lastScrollTime: TimeInterval = 0
    @GestureState private var pinchScale: CGFloat = 1
    @GestureState private var activeDrag = CGSize.zero
    @FocusState var isAddressFocused: Bool
    @State var addressSelection: TextSelection?
    @Environment(\.displayScale) private var displayScale
    @Environment(\.scenePhase) private var scenePhase
    let worktreeID: String

    init(
        hostID: String,
        worktreeID: String,
        descriptor: WorkspaceBrowserTab,
        isVisible: Bool,
        repository: any WorkspaceBrowserRepository,
        browserSupported: Bool? = true,
        connectionReady: Bool = true
    ) {
        self.descriptor = descriptor
        self.isVisible = isVisible
        self.browserSupported = browserSupported
        self.connectionReady = connectionReady
        self.worktreeID = worktreeID
        _viewMode = State(
            initialValue: WorkspaceBrowserViewModeStore.shared.value(
                worktreeID: worktreeID,
                pageID: descriptor.pageID
            )
        )
        _model = State(
            initialValue: WorkspaceBrowserModel(
                hostID: hostID,
                worktreeID: worktreeID,
                initialURL: descriptor.url,
                canGoBack: descriptor.canGoBack,
                canGoForward: descriptor.canGoForward,
                repository: repository
            )
        )
    }

    var body: some View {
        GeometryReader { geometry in
            let configuration = streamConfiguration(size: geometry.size)
            ZStack {
                if let pageID = descriptor.pageID {
                    browserCanvas(pageID: pageID, size: geometry.size)
                } else {
                    Theme.Colors.background
                }
                VStack(spacing: 0) {
                    browserChrome(pageID: descriptor.pageID)
                    Spacer(minLength: 0)
                    browserKeyboard(pageID: descriptor.pageID)
                }
            }
            .task(
                id: StreamKey(
                    pageID: descriptor.pageID ?? "",
                    configuration: configuration,
                    active: isVisible && scenePhase == .active,
                    supported: browserSupported,
                    connected: connectionReady
                )
            ) {
                guard let pageID = descriptor.pageID,
                    isVisible,
                    scenePhase == .active,
                    browserSupported == true,
                    connectionReady
                else {
                    return
                }
                await model.stream(pageID: pageID, configuration: configuration)
            }
        }
        .onChange(of: descriptor.url) { _, url in
            model.synchronizeURL(url, whileFocused: isAddressFocused)
            resetZoom()
        }
        .onChange(of: isAddressFocused) { _, focused in
            guard !focused else { return }
            // Why: reconcile the draft address when the field loses focus. A remote navigation
            // can arrive while the user is typing, and SwiftUI does not emit a second
            // descriptor.url change when focus is dismissed, so a stale draft would otherwise
            // survive a cancelled edit and obscure the authoritative browser URL.
            model.synchronizeURL(descriptor.url, whileFocused: false)
        }
        .onChange(of: descriptor.canGoBack) { _, value in
            model.synchronizeNavigation(
                canGoBack: value,
                canGoForward: descriptor.canGoForward
            )
        }
        .onChange(of: descriptor.canGoForward) { _, value in
            model.synchronizeNavigation(
                canGoBack: descriptor.canGoBack,
                canGoForward: value
            )
        }
        .alert(
            "Browser Dialog",
            isPresented: Binding(
                get: { model.dialog != nil },
                set: { if !$0 { model.dismissDialog() } }
            )
        ) {
            if model.dialog?.type != "alert" {
                Button("Cancel", role: .cancel) {
                    guard let pageID = descriptor.pageID else { return }
                    Task { await model.respondToDialog(pageID: pageID, accepts: false) }
                }
            }
            Button("OK") {
                guard let pageID = descriptor.pageID else { return }
                Task { await model.respondToDialog(pageID: pageID, accepts: true) }
            }
        } message: {
            if let dialog = model.dialog { Text(verbatim: dialog.message) }
        }
    }

    private func browserCanvas(pageID: String?, size: CGSize) -> some View {
        ZStack {
            Theme.Colors.background
            if let rendered = model.renderedFrame,
                let geometry = workspaceBrowserFrameGeometry(
                    size: size, metadata: rendered.frame.metadata)
            {
                Image(decorative: rendered.image, scale: 1, orientation: .up)
                    .resizable()
                    .frame(width: geometry.renderedWidth, height: geometry.renderedHeight)
                    .scaleEffect(visualZoom)
                    .offset(visualOffset)
                    .position(
                        x: geometry.offsetX + geometry.renderedWidth / 2,
                        y: geometry.offsetY + geometry.renderedHeight / 2
                    )
                    .accessibilityLabel(Text("Remote browser content"))
            }
            browserStateOverlay
        }
        .contentShape(Rectangle())
        .gesture(
            SpatialTapGesture().onEnded { value in
                if didLongPress {
                    didLongPress = false
                    return
                }
                guard let metadata = model.renderedFrame?.frame.metadata,
                    let point = workspaceBrowserPoint(
                        location: value.location,
                        size: size,
                        metadata: metadata,
                        zoom: Double(zoomScale),
                        offset: zoomOffset
                    )
                else { return }
                let radius = workspaceBrowserClickRadius(
                    size: size,
                    metadata: metadata,
                    zoom: Double(zoomScale)
                )
                guard let pageID else { return }
                Task { await model.click(pageID: pageID, point: point, radius: radius) }
            }
        )
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .updating($activeDrag) { value, state, _ in
                    if zoomScale > 1.01, !didLongPress { state = value.translation }
                }
                .onChanged { value in
                    if !isPointerGestureActive {
                        isPointerGestureActive = true
                        didLongPress = false
                        lastScrollTranslation = .zero
                        lastScrollTime = 0
                    }
                    lastTouchLocation = value.location
                    guard zoomScale <= 1.01,
                        hypot(value.translation.width, value.translation.height) > 22
                    else { return }
                    queueBrowserScroll(
                        pageID: pageID,
                        size: size,
                        location: value.location,
                        translation: value.translation
                    )
                }
                .onEnded { value in
                    isPointerGestureActive = false
                    defer {
                        lastScrollTranslation = .zero
                        lastScrollTime = 0
                    }
                    guard !didLongPress,
                        hypot(value.translation.width, value.translation.height) > 22,
                        let metadata = model.renderedFrame?.frame.metadata
                    else { return }
                    if zoomScale > 1.01 {
                        zoomOffset = clampedWorkspaceBrowserOffset(
                            CGSize(
                                width: zoomOffset.width + value.translation.width,
                                height: zoomOffset.height + value.translation.height
                            ),
                            zoom: Double(zoomScale),
                            size: size,
                            metadata: metadata
                        )
                        return
                    }
                    queueBrowserScroll(
                        pageID: pageID,
                        size: size,
                        location: value.location,
                        translation: value.translation,
                        force: true
                    )
                }
        )
        .simultaneousGesture(
            MagnificationGesture()
                .updating($pinchScale) { value, state, _ in state = value }
                .onEnded { value in
                    guard let metadata = model.renderedFrame?.frame.metadata else { return }
                    zoomScale = min(max(zoomScale * value, 1), 3.5)
                    zoomOffset = clampedWorkspaceBrowserOffset(
                        zoomOffset,
                        zoom: Double(zoomScale),
                        size: size,
                        metadata: metadata
                    )
                }
        )
        .onLongPressGesture(minimumDuration: 0.55, maximumDistance: 16) {
            guard let metadata = model.renderedFrame?.frame.metadata,
                let point = workspaceBrowserPoint(
                    location: lastTouchLocation,
                    size: size,
                    metadata: metadata,
                    zoom: Double(zoomScale),
                    offset: zoomOffset
                )
            else { return }
            didLongPress = true
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            guard let pageID else { return }
            Task { await model.click(pageID: pageID, point: point, button: .right) }
        }
        .clipped()
    }

    @ViewBuilder
    private var browserStateOverlay: some View {
        if descriptor.pageID == nil {
            Theme.Colors.background.opacity(0.82)
                .overlay {
                    Text("Browser page is not available yet.").browserStateMessage()
                }
        } else if !connectionReady {
            Theme.Colors.background.opacity(0.82)
                .overlay { Text("Waiting for daemon…").browserStateMessage() }
        } else if browserSupported == nil {
            Theme.Colors.background.opacity(0.82)
                .overlay {
                    Text("Checking browser streaming support.").browserStateMessage()
                }
        } else if browserSupported == false {
            Theme.Colors.background.opacity(0.82)
                .overlay {
                    Text("Browser streaming is unavailable on this daemon.").browserStateMessage()
                }
        } else {
            switch model.phase {
            case .waiting:
                Theme.Colors.background.opacity(0.82)
                    .overlay { AgentStartLoader(size: Theme.Control.largeIcon) }
            case .ready:
                if model.isCommandRunning {
                    Theme.Colors.background.opacity(0.82)
                        .overlay { AgentStartLoader(size: Theme.Control.largeIcon) }
                }
            case .failed(let message):
                Theme.Colors.background.opacity(0.82)
                    .overlay {
                        Text(verbatim: message)
                            .browserStateMessage()
                    }
            }
        }
    }

    var browserControlsDisabled: Bool {
        descriptor.pageID == nil || browserSupported != true || !connectionReady
    }

    private var visualZoom: CGFloat { min(max(zoomScale * pinchScale, 1), 3.5) }

    private var visualOffset: CGSize {
        guard zoomScale > 1.01 else { return .zero }
        return CGSize(
            width: zoomOffset.width + activeDrag.width,
            height: zoomOffset.height + activeDrag.height
        )
    }

    func selectViewMode(_ mode: WorkspaceBrowserViewMode) {
        guard viewMode != mode else { return }
        viewMode = mode
        WorkspaceBrowserViewModeStore.shared.save(
            mode,
            worktreeID: worktreeID,
            pageID: descriptor.pageID
        )
        resetZoom()
    }

    private func resetZoom() {
        zoomScale = 1
        zoomOffset = .zero
    }

    private func queueBrowserScroll(
        pageID: String?,
        size: CGSize,
        location: CGPoint,
        translation: CGSize,
        force: Bool = false
    ) {
        let now = Date.timeIntervalSinceReferenceDate
        guard force || now - lastScrollTime >= 0.07 else { return }
        let delta = CGSize(
            width: translation.width - lastScrollTranslation.width,
            height: translation.height - lastScrollTranslation.height
        )
        guard abs(delta.width) + abs(delta.height) >= 1,
            let metadata = model.renderedFrame?.frame.metadata,
            let point = workspaceBrowserPoint(
                location: location,
                size: size,
                metadata: metadata
            ),
            let geometry = workspaceBrowserFrameGeometry(size: size, metadata: metadata)
        else { return }
        lastScrollTranslation = translation
        lastScrollTime = now
        guard let pageID else { return }
        model.queueScroll(
            pageID: pageID,
            point: point,
            deltaX: -delta.width / geometry.scale,
            deltaY: -delta.height / geometry.scale
        )
    }

    private func streamConfiguration(size: CGSize) -> WorkspaceBrowserStreamConfiguration {
        WorkspaceBrowserStreamConfiguration(
            width: max(Int(size.width.rounded()), 1),
            height: max(Int(size.height.rounded()), 1),
            scale: displayScale,
            viewMode: viewMode
        )
    }
}

private extension View {
    func browserStateMessage() -> some View {
        self
            .font(.system(size: Theme.Typography.metadata))
            .foregroundStyle(Theme.Colors.foreground)
            .multilineTextAlignment(.center)
            .padding(.horizontal, Theme.Spacing.medium)
            .padding(.vertical, Theme.Spacing.small)
            .glassEffect(.regular, in: .rect(cornerRadius: Theme.Radius.control))
            .padding(Theme.Spacing.extraLarge)
    }
}

nonisolated private struct StreamKey: Hashable {
    let pageID: String
    let configuration: WorkspaceBrowserStreamConfiguration
    let active: Bool
    let supported: Bool?
    let connected: Bool
}
