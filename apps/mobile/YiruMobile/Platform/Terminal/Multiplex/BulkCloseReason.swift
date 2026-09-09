import Foundation

nonisolated enum TerminalBulkConnectionError: Error, Sendable {
    case expiredTicket
    case invalidPeerMessage
    case iteratorEnded
    case maxStreamsExceeded
    case routeIDsExhausted
    case staleAfterBackground
    case staleControlGeneration
}

nonisolated func terminalBulkCloseDetails(_ error: Error) -> (code: Int, reason: String) {
    if let frameError = error as? TerminalMultiplexFrameError {
        switch frameError {
        case .invalidLength:
            return (1009, "invalid terminal frame length")
        case .invalidHeader, .invalidRoute, .unsupportedOpcode:
            return (1002, "invalid terminal frame")
        }
    }
    if let wireError = error as? TerminalMultiplexWireError {
        switch wireError {
        case .heartbeatTimedOut, .correlationIDsExhausted:
            return (1001, "terminal epoch expired")
        case .duplicateEpoch, .epochMismatch, .frameBeforeAcceptance, .invalidEpoch,
            .invalidHeartbeat:
            return (1002, "terminal protocol violation")
        }
    }
    if let bulkError = error as? TerminalBulkConnectionError {
        if case .staleAfterBackground = bulkError {
            return (1001, "terminal epoch stale after background")
        }
        if case .staleControlGeneration = bulkError {
            return (1001, "terminal epoch stale after control reconnect")
        }
        return (1002, "invalid terminal peer message")
    }

    return (1001, "terminal connection closed")
}
