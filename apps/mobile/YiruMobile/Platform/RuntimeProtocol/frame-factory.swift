import Foundation
import YiruProtocol

nonisolated func makeCallStart(
    callID: UInt64,
    call: RuntimeUnaryCall,
    defaultTimeout: Duration?
) -> Yiru_Protocol_V1_CallStart {
    var start = Yiru_Protocol_V1_CallStart()
    start.callID = callID
    start.procedure = call.procedure
    if let timeout = call.options.timeout ?? defaultTimeout {
        start.timeoutMs = timeoutMilliseconds(timeout)
    }
    return start
}

nonisolated func makePayload(
    callID: UInt64,
    data: Data
) -> Yiru_Protocol_V1_Payload {
    var payload = Yiru_Protocol_V1_Payload()
    payload.callID = callID
    payload.data = data
    return payload
}

nonisolated func makeCallEnd(callID: UInt64) -> Yiru_Protocol_V1_CallEnd {
    var end = Yiru_Protocol_V1_CallEnd()
    end.callID = callID
    end.status = makeStatus(code: .okUnspecified, message: "")
    return end
}

nonisolated func makeCancel(
    callID: UInt64,
    reason: String,
    code: Yiru_Protocol_V1_StatusCode
) -> Yiru_Protocol_V1_Cancel {
    var cancel = Yiru_Protocol_V1_Cancel()
    cancel.callID = callID
    cancel.status = makeStatus(code: code, message: reason)
    return cancel
}

nonisolated func makeWindowUpdate(
    callID: UInt64,
    creditBytes: UInt64
) -> Yiru_Protocol_V1_WindowUpdate {
    var update = Yiru_Protocol_V1_WindowUpdate()
    update.callID = callID
    update.creditBytes = creditBytes
    return update
}

nonisolated func makePing(nonce: UInt64) -> Yiru_Protocol_V1_Ping {
    var ping = Yiru_Protocol_V1_Ping()
    ping.nonce = nonce
    return ping
}

nonisolated func makePong(nonce: UInt64) -> Yiru_Protocol_V1_Pong {
    var pong = Yiru_Protocol_V1_Pong()
    pong.nonce = nonce
    return pong
}

nonisolated func makeStatus(
    code: Yiru_Protocol_V1_StatusCode,
    message: String
) -> Yiru_Protocol_V1_Status {
    var status = Yiru_Protocol_V1_Status()
    status.code = code
    status.message = message
    return status
}

nonisolated func errorIfPresent(_ status: Yiru_Protocol_V1_Status) -> RuntimeTransportError? {
    guard status.code != .okUnspecified else { return nil }
    return error(for: status)
}

nonisolated func error(for status: Yiru_Protocol_V1_Status) -> RuntimeTransportError {
    RuntimeTransportError.serverStatus(code: Int32(status.code.rawValue), message: status.message)
}

nonisolated func timeoutMilliseconds(_ timeout: Duration) -> UInt32 {
    let components = timeout.components
    let milliseconds =
        Double(components.seconds) * 1_000 + Double(components.attoseconds)
        / 1_000_000_000_000_000
    return UInt32(max(1, min(milliseconds.rounded(.up), Double(UInt32.max))))
}
