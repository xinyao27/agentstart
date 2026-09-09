import Foundation

nonisolated enum PendingCall {
    case unary(PendingUnaryCall)
    case stream(PendingStreamCall)

    var timeoutTask: Task<Void, Never> {
        switch self {
        case .unary(let call):
            call.timeoutTask
        case .stream(let call):
            call.timeoutTask
        }
    }

    var requestBytes: Int {
        switch self {
        case .unary(let call):
            call.requestBytes
        case .stream(let call):
            call.requestBytes
        }
    }

    var bufferedResponseBytes: Int {
        switch self {
        case .unary(let call):
            call.bufferedResponseBytes
        case .stream(let call):
            call.bufferedResponseBytes
        }
    }
}

nonisolated struct PendingUnaryCall {
    var bufferedResponseBytes: Int
    let continuation: CheckedContinuation<Data, Error>
    var incomingCreditBytes: Int
    var payload: Data?
    let requestBytes: Int
    let timeoutTask: Task<Void, Never>
}

nonisolated struct PendingStreamCall {
    let buffer: RuntimeProtocolStreamBuffer
    var bufferedResponseBytes: Int
    var incomingCreditBytes: Int
    var isFinished: Bool
    var requestBytes: Int
    let timeoutTask: Task<Void, Never>
}

nonisolated struct PendingPong {
    let nonce: UInt64
    let timeoutTask: Task<Void, Never>
}

nonisolated struct PendingSend {
    let byteCount: Int
    let frames: [Data]
    let continuation: CheckedContinuation<Void, Error>
}

nonisolated struct PendingSendQueue {
    private var storage: [PendingSend?] = Array(repeating: nil, count: 16)
    private var head = 0
    private(set) var bufferedBytes = 0
    private var count = 0

    var batchCount: Int { count }

    mutating func append(_ send: PendingSend) {
        if count == storage.count {
            grow()
        }
        let tail = (head + count) % storage.count
        storage[tail] = send
        bufferedBytes += send.byteCount
        count += 1
    }

    mutating func popFirst() -> PendingSend? {
        guard count > 0, let send = storage[head] else { return nil }
        storage[head] = nil
        head = (head + 1) % storage.count
        bufferedBytes -= send.byteCount
        count -= 1
        return send
    }

    private mutating func grow() {
        var expanded = [PendingSend?](repeating: nil, count: storage.count * 2)
        for offset in 0..<count {
            expanded[offset] = storage[(head + offset) % storage.count]
        }
        storage = expanded
        head = 0
    }
}

nonisolated struct LocallyCancelledCalls {
    private var count = 0
    private var head = 0
    private var ids: Set<UInt64> = []
    private var storage: [UInt64]

    init(limit: Int) {
        storage = Array(repeating: 0, count: limit)
    }

    func contains(_ callID: UInt64) -> Bool {
        ids.contains(callID)
    }

    mutating func insert(_ callID: UInt64) {
        guard ids.insert(callID).inserted else { return }
        if count == storage.count {
            ids.remove(storage[head])
            head = (head + 1) % storage.count
            count -= 1
        }
        storage[(head + count) % storage.count] = callID
        count += 1
    }
}
