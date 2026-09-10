import Foundation
import SwiftProtobuf

public struct AccountsClient: Sendable {
  private let transport: any RuntimeTransport

  public init(transport: any RuntimeTransport) {
    self.transport = transport
  }

  public func list(
    options: RuntimeCallOptions = RuntimeCallOptions()
  ) async throws -> AgentStart_Runtime_V1_AccountsServiceListResponse {
    let request = AgentStart_Runtime_V1_AccountsServiceListRequest()
    let response = try await transport.unary(
      RuntimeUnaryCall(
        procedure: AgentStartRuntimeV1AccountsServiceMethods.list,
        payload: try request.serializedData(),
        options: options
      )
    )
    return try AgentStart_Runtime_V1_AccountsServiceListResponse(serializedBytes: response)
  }

  public func select(
    provider: AgentStart_Runtime_V1_AccountProvider,
    accountID: String?,
    runtime: AgentStart_Runtime_V1_ManagedAccountRuntime = .unspecified,
    wslDistro: String? = nil,
    options: RuntimeCallOptions = RuntimeCallOptions()
  ) async throws -> AgentStart_Runtime_V1_AccountsServiceSelectResponse {
    var request = AgentStart_Runtime_V1_AccountsServiceSelectRequest()
    request.provider = provider
    if let accountID {
      request.accountID = accountID
    }
    request.runtime = runtime
    if let wslDistro {
      request.wslDistro = wslDistro
    }
    let response = try await transport.unary(
      RuntimeUnaryCall(
        procedure: AgentStartRuntimeV1AccountsServiceMethods.select,
        payload: try request.serializedData(),
        options: options
      )
    )
    return try AgentStart_Runtime_V1_AccountsServiceSelectResponse(serializedBytes: response)
  }

  public func subscribe(options: RuntimeCallOptions = RuntimeCallOptions()) async throws
    -> AccountsStream
  {
    let request = AgentStart_Runtime_V1_AccountsServiceSubscribeRequest()
    let stream = try await transport.subscribe(
      RuntimeUnaryCall(
        procedure: AgentStartRuntimeV1AccountsServiceMethods.subscribe,
        payload: try request.serializedData(),
        options: options
      )
    )
    return AccountsStream(stream: stream)
  }
}

public struct AccountsStream: AsyncSequence, Sendable {
  public typealias Element = AgentStart_Runtime_V1_AccountsServiceSubscribeResponse

  private let stream: RuntimeStream

  fileprivate init(stream: RuntimeStream) {
    self.stream = stream
  }

  public func makeAsyncIterator() -> AsyncIterator {
    AsyncIterator(bytes: stream.events.makeAsyncIterator())
  }

  public func cancel(reason: String? = nil) async throws {
    try await stream.cancel(reason: reason)
  }

  public struct AsyncIterator: AsyncIteratorProtocol {
    private var bytes: RuntimeByteStream.AsyncIterator

    fileprivate init(bytes: RuntimeByteStream.AsyncIterator) {
      self.bytes = bytes
    }

    nonisolated(nonsending) public mutating func next() async throws -> Element? {
      guard let data = try await bytes.next() else { return nil }
      return try Element(serializedBytes: data)
    }
  }
}
