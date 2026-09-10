import Foundation
import SwiftTerm
import UIKit

@MainActor
final class SwiftTermSurface: NSObject, TerminalSurface, TerminalViewDelegate {
    var events: TerminalSurfaceEvents = .inactive
    let accessoryState: TerminalAccessoryState

    private let terminalView: AgentStartTerminalView
    private let controlModifierObserver: TerminalControlModifierObserver
    private var isRestoringSnapshot = false

    init(configuration: TerminalSurfaceConfiguration) {
        let configuredTerminalView = AgentStartTerminalView(
            frame: .zero,
            font: .monospacedSystemFont(ofSize: configuration.fontSize, weight: .regular)
        )
        configuredTerminalView.captureModeAwareAccessory()
        configuredTerminalView.inputAccessoryView = nil
        terminalView = configuredTerminalView
        let configuredAccessoryState = TerminalAccessoryState(
            keys: configuration.accessoryKeys,
            customKeys: configuration.customAccessoryKeys,
            onSend: { [weak terminalView = configuredTerminalView] key in
                terminalView?.sendAccessoryKey(key)
            },
            onSendCustom: { [weak terminalView = configuredTerminalView] key in
                terminalView?.sendCustomAccessoryKey(key)
            },
            onControlChange: { [weak terminalView = configuredTerminalView] isActive in
                terminalView?.controlModifier = isActive
            },
            onPaste: { [weak terminalView = configuredTerminalView] in
                terminalView?.paste(nil)
            }
        )
        accessoryState = configuredAccessoryState
        controlModifierObserver = TerminalControlModifierObserver(
            state: configuredAccessoryState,
            terminalView: configuredTerminalView
        )
        super.init()
        terminalView.onQueryReply = { [weak self] data in
            guard let self, !isRestoringSnapshot else { return }
            events.onQueryReply(data)
        }
        terminalView.terminalDelegate = self
        terminalView.optionAsMetaKey = false
        terminalView.allowMouseReporting = true
        configuredTerminalView.observeAppearanceChanges { terminalView in
            Self.applyPalette(to: terminalView)
        }
        terminalView.changeScrollback(configuration.scrollbackLines)
    }

    private static func applyPalette(to terminalView: AgentStartTerminalView) {
        let palette = Theme.Terminal.palette(for: terminalView.traitCollection.userInterfaceStyle)
        terminalView.nativeForegroundColor = palette.foreground
        terminalView.nativeBackgroundColor = palette.background
        // Why: SwiftTerm paints default cells itself but keeps the inter-cell canvas on the
        // backing layer, so both surfaces must change together when appearance changes.
        terminalView.layer.backgroundColor = palette.background.cgColor
        terminalView.backgroundOpacity = 1
        terminalView.caretColor = palette.foreground
        terminalView.caretTextColor = palette.background
        terminalView.selectedTextForegroundColor = palette.selectionForeground
        terminalView.selectedTextBackgroundColor = palette.selectionBackground
        terminalView.selectionHandleColor = palette.foreground
        terminalView.installColors(palette.ansiColors.map(SwiftTerm.Color.init(uiColor:)))
    }

    var view: UIView {
        terminalView
    }

    func feed(_ bytes: Data) {
        let buffer = [UInt8](bytes)
        terminalView.feed(byteArray: buffer[...])
    }

    func restore(_ snapshot: TerminalReplaySnapshot) {
        isRestoringSnapshot = true
        synchronizeGrid(
            to: TerminalGridSize(columns: snapshot.columns, rows: snapshot.rows)
        )
        feed(Data([0x1B, 0x63]))
        feed(snapshot.replayBytes)
        isRestoringSnapshot = false
    }

    func synchronizeGrid(to size: TerminalGridSize) {
        // Why: TerminalView.resize reports the remote size back through sizeChanged on the next
        // run-loop turn. Resizing the emulator core directly keeps server-authoritative geometry
        // from echoing as a new phone viewport and preserves the viewport measured from UIKit.
        terminalView.getTerminal().resize(cols: size.columns, rows: size.rows)
        terminalView.setNeedsDisplay(terminalView.bounds)
    }

    func clear() {
        terminalView.clearScrollback()
    }

    func focus() {
        _ = terminalView.becomeFirstResponder()
    }

    func setInputEnabled(_ isEnabled: Bool) {
        accessoryState.setEnabled(isEnabled)
    }

    func apply(_ configuration: TerminalSurfaceConfiguration) {
        if terminalView.font.pointSize != configuration.fontSize {
            terminalView.font = .monospacedSystemFont(
                ofSize: configuration.fontSize,
                weight: .regular
            )
        }
        terminalView.changeScrollback(configuration.scrollbackLines)
        accessoryState.setKeys(
            configuration.accessoryKeys,
            customKeys: configuration.customAccessoryKeys
        )
    }

    func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
        guard !isRestoringSnapshot else { return }
        events.onResize(TerminalGridSize(columns: newCols, rows: newRows))
    }

    func setTerminalTitle(source: TerminalView, title: String) {
        events.onTitleChange(title)
    }

    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {
        events.onDirectoryChange(directory)
    }

    func send(source: TerminalView, data: ArraySlice<UInt8>) {
        events.onInput(Data(data))
    }

    func scrolled(source: TerminalView, position: Double) {}

    func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {
        events.onOpenLink(link, params)
    }

    func bell(source: TerminalView) {
        events.onBell()
    }

    func clipboardCopy(source: TerminalView, content: Data) {
        events.onClipboardWriteRequest(content)
    }

    func clipboardRead(source: TerminalView) -> Data? {
        UIPasteboard.general.string.map { Data($0.utf8) }
    }

    func iTermContent(source: TerminalView, content: ArraySlice<UInt8>) {}

    func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}
}

private final class AgentStartTerminalView: TerminalView {
    var onQueryReply: (Data) -> Void = { _ in }
    private var modeAwareAccessory: TerminalAccessory?
    private var appearanceChangeHandler: ((AgentStartTerminalView) -> Void)?
    private var alternateScreenScrollGesture: UIPanGestureRecognizer?
    private var alternateScreenScrollRemainder: CGFloat = 0

    func observeAppearanceChanges(_ handler: @escaping (AgentStartTerminalView) -> Void) {
        appearanceChangeHandler = handler
        handler(self)
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) {
            (view: AgentStartTerminalView, _: UITraitCollection) in
            view.appearanceChangeHandler?(view)
        }
    }

    func captureModeAwareAccessory() {
        modeAwareAccessory = inputAccessoryView as? TerminalAccessory
        let gesture = UIPanGestureRecognizer(
            target: self,
            action: #selector(handleAlternateScreenScroll(_:))
        )
        addGestureRecognizer(gesture)
        panGestureRecognizer.require(toFail: gesture)
        alternateScreenScrollGesture = gesture
    }

    func sendAccessoryKey(_ key: TerminalAccessoryKey) {
        switch key {
        case .escape:
            send([0x1B])
        case .tab:
            send([0x09])
        case .enter:
            // Why: SwiftTerm switches Enter to the negotiated keyboard protocol when a
            // terminal enables keyboard enhancement flags. A raw carriage return bypasses
            // that encoder, so agent TUIs can redraw the prompt without submitting the line.
            insertText("\n")
        case .shiftTab:
            send([0x1B, 0x5B, 0x5A])
        case .space:
            send([0x20])
        case .backspace:
            send([0x7F])
        case .delete:
            send([0x1B, 0x5B, 0x33, 0x7E])
        case .arrowUp:
            sendModeAwareArrow(selectorName: "up:")
        case .arrowDown:
            sendModeAwareArrow(selectorName: "down:")
        case .arrowLeft:
            sendModeAwareArrow(selectorName: "left:")
        case .arrowRight:
            sendModeAwareArrow(selectorName: "right:")
        case .interrupt:
            send([0x03])
        case .endOfFile:
            send([0x04])
        case .clearScreen:
            send([0x0C])
        case .suspend:
            send([0x1A])
        case .reverseSearch:
            send([0x12])
        case .startOfLine:
            send([0x01])
        case .endOfLine:
            send([0x05])
        case .deleteWordBackward:
            send([0x17])
        case .clearLineBeforeCursor:
            send([0x15])
        }
    }

    func sendCustomAccessoryKey(_ key: TerminalCustomKey) {
        var bytes = Array(key.bytes.utf8)
        if key.enter { bytes.append(0x0D) }
        send(bytes)
    }

    override func send(source: Terminal, data: ArraySlice<UInt8>) {
        onQueryReply(Data(data))
    }

    override func mouseModeChanged(source _: Terminal) {
        // Why: SwiftTerm's mouse mode adds a second pan recognizer that wins over scrollback on iOS.
        // AgentStart keeps taps and routes alternate-screen drags through terminal input below.
    }

    override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === alternateScreenScrollGesture else {
            return super.gestureRecognizerShouldBegin(gestureRecognizer)
        }
        guard getTerminal().isCurrentBufferAlternate,
            let panGesture = gestureRecognizer as? UIPanGestureRecognizer
        else {
            return false
        }
        let velocity = panGesture.velocity(in: self)
        return abs(velocity.y) > abs(velocity.x)
    }

    @objc private func handleAlternateScreenScroll(_ gesture: UIPanGestureRecognizer) {
        switch gesture.state {
        case .began:
            alternateScreenScrollRemainder = 0
        case .changed:
            alternateScreenScrollRemainder += gesture.translation(in: self).y
            gesture.setTranslation(.zero, in: self)
            let lineHeight = max(font.lineHeight, 1)
            let lines = Int(alternateScreenScrollRemainder / lineHeight)
            guard lines != 0 else { return }
            alternateScreenScrollRemainder -= CGFloat(lines) * lineHeight
            sendAlternateScreenScroll(lines: lines, location: gesture.location(in: self))
        case .cancelled, .ended, .failed:
            alternateScreenScrollRemainder = 0
        case .possible:
            break
        @unknown default:
            break
        }
    }

    private func sendAlternateScreenScroll(lines: Int, location: CGPoint) {
        let terminal = getTerminal()
        if terminal.mouseMode == .off {
            let selectorName = lines > 0 ? "up:" : "down:"
            for _ in 0..<abs(lines) { sendModeAwareArrow(selectorName: selectorName) }
            return
        }
        let columns = max(terminal.cols, 1)
        let rows = max(terminal.rows, 1)
        let cellWidth = max(bounds.width / CGFloat(columns), 1)
        let cellHeight = max(bounds.height / CGFloat(rows), 1)
        let column = max(0, min(columns - 1, Int(location.x / cellWidth)))
        let row = max(0, min(rows - 1, Int(location.y / cellHeight)))
        let button = lines > 0 ? 4 : 5
        let buttonFlags = terminal.encodeButton(
            button: button,
            release: false,
            shift: false,
            meta: false,
            control: false
        )
        for _ in 0..<abs(lines) {
            terminal.sendEvent(buttonFlags: buttonFlags, x: column, y: row)
        }
    }

    private func sendModeAwareArrow(selectorName: String) {
        guard let modeAwareAccessory else { return }
        // Why: SwiftTerm's arrow actions are internal, but its public accessory exposes them to
        // UIKit. Routing through those actions preserves application-cursor and bidi state.
        UIApplication.shared.sendAction(
            NSSelectorFromString(selectorName),
            to: modeAwareAccessory,
            from: nil,
            for: nil
        )
        UIApplication.shared.sendAction(
            NSSelectorFromString("cancelTimer"),
            to: modeAwareAccessory,
            from: nil,
            for: nil
        )
    }
}

nonisolated struct SwiftTermSurfaceFactory: TerminalSurfaceFactory {
    @MainActor
    func makeSurface(configuration: TerminalSurfaceConfiguration) -> any TerminalSurface {
        SwiftTermSurface(configuration: configuration)
    }
}
