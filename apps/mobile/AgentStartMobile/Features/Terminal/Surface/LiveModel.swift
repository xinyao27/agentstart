extension TerminalLiveModel {
    func focus() {
        guard canAcceptUserInput else { return }
        surface.focus()
    }

    func apply(_ configuration: TerminalSurfaceConfiguration) {
        surface.apply(configuration)
    }
}
