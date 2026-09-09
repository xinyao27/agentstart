import Foundation

nonisolated enum TerminalMultiplexBooleanWire {
    static let falseValue = 0
    static let trueValue = 1
}

nonisolated enum TerminalMultiplexAckRecordWire {
    static let bytes = 24
    static let kindOffset = 0
    static let kindMax = 3
    static let statusOffset = 1
    static let statusMax = 3
    static let errorCodeOffset = 2
    static let acknowledgedBytesOffset = 4
    static let cumulativeSeqOffset = 8
    static let receiverQueueBytesOffset = 16
    static let reserved32Offset = 20
}

nonisolated enum TerminalMultiplexCreditRecordWire {
    static let bytes = 16
    static let directionOffset = 0
    static let directionMax = 1
    static let reasonOffset = 1
    static let reasonMax = 3
    static let reserved16Offset = 2
    static let maxInFlightBytesOffset = 4
    static let ackEveryBytesOffset = 8
    static let maxFrameBytesOffset = 12
}

nonisolated enum TerminalMultiplexVisibilityRecordWire {
    static let bytes = 8
    static let visibleOffset = 0
    static let deliveryInterestOffset = 1
    static let priorityOffset = 2
    static let priorityMax = 2
    static let reserved8Offset = 3
    static let stateVersionOffset = 4
}

nonisolated enum TerminalMultiplexKillRecordWire {
    static let bytes = 8
    static let keepHistoryOffset = 0
    static let immediateOffset = 1
    static let immediateValue = 1
    static let reserved16Offset = 2
    static let reserved32Offset = 4
}

nonisolated enum TerminalMultiplexInputRecordWire {
    static let headerBytes = 8
    static let kindOffset = 0
    static let kindMax = 1
    static let reserved8Offset = 1
    static let reserved16Offset = 2
    static let dataBytesOffset = 4
}
