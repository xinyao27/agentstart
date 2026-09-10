import Foundation

public enum RuntimeFrameCodec {
  public static let preamble = Data([0x41, 0x47, 0x53, 0x54])
  public static let preambleByteCount = agentstartRuntimeWirePreambleBytes
  public static let versionByte = UInt8(AgentStart_Protocol_V1_ProtocolVersion.v2.rawValue)

  public static func hasPreamble(_ data: Data) -> Bool {
    data.count >= preamble.count && data.prefix(preamble.count) == preamble
  }

  public static func encode(
    _ frame: AgentStart_Protocol_V1_Frame,
    maxFrameBytes: Int
  ) throws -> Data {
    let message = try frame.serializedData()
    let size = preambleByteCount + message.count
    guard size <= maxFrameBytes else { throw RuntimeTransportError.requestExceedsCredit }

    var data = Data()
    data.reserveCapacity(size)
    data.append(preamble)
    data.append(versionByte)
    data.append(message)
    return data
  }

  public static func decode(
    _ data: Data,
    maxFrameBytes: Int
  ) throws -> AgentStart_Protocol_V1_Frame {
    guard data.count <= maxFrameBytes else { throw RuntimeTransportError.requestExceedsCredit }
    guard data.count >= preambleByteCount else { throw RuntimeTransportError.unexpectedMessage }
    guard data.prefix(preamble.count) == preamble else {
      throw RuntimeTransportError.unexpectedMessage
    }
    guard data[data.index(data.startIndex, offsetBy: preamble.count)] == versionByte else {
      throw RuntimeTransportError.unsupportedVersion
    }

    let message = data.dropFirst(preambleByteCount)
    let frame = try AgentStart_Protocol_V1_Frame(serializedBytes: message)
    guard frame.protocolVersion == agentstartRuntimeProtocolVersion, frame.body != nil else {
      throw RuntimeTransportError.unexpectedMessage
    }
    return frame
  }
}
