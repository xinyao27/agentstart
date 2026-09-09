import YiruProtocol

extension MobileRuntimeStatusWire {
    nonisolated init(protocolStatus status: Yiru_Runtime_V1_GetStatusResponse) {
        self.init(
            runtimeId: status.runtimeID,
            runtimeProtocolVersion: Int(status.runtimeApiVersion),
            minCompatibleRuntimeClientVersion: Int(
                status.minCompatibleRuntimeClientVersion),
            capabilities: status.capabilities,
            hostPlatform: status.hostPlatform.isEmpty ? nil : status.hostPlatform,
            terminalWindowsShell: status.hasTerminalWindowsShell
                ? status.terminalWindowsShell
                : nil,
            protocolVersion: nil,
            minCompatibleMobileVersion: nil
        )
    }
}
