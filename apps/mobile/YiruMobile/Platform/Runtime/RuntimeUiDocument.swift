import Foundation
import SwiftProtobuf
import YiruProtocol

// Why: the UI authority's document is normalized at its known keys but keeps
// unknown top-level keys verbatim (e.g. trustedYiruHooks), so native clients
// decode the recursive wire value into this equally open value tree instead of
// a closed struct.
nonisolated enum RuntimeUiValue: Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case list([RuntimeUiValue])
    case object([String: RuntimeUiValue])

    init(_ proto: Yiru_Runtime_V1_UiJsonValue) {
        switch proto.kind {
        case .nullValue: self = .null
        case .boolValue(let value): self = .bool(value)
        case .numberValue(let value): self = .number(value)
        case .stringValue(let value): self = .string(value)
        case .listValue(let value): self = .list(value.values.map(RuntimeUiValue.init))
        case .objectValue(let value):
            self = .object(
                Dictionary(
                    value.entries.map { ($0.key, RuntimeUiValue($0.value)) },
                    uniquingKeysWith: { _, latest in latest }
                )
            )
        case nil: self = .null
        }
    }

    var proto: Yiru_Runtime_V1_UiJsonValue {
        switch self {
        case .null:
            return Yiru_Runtime_V1_UiJsonValue.with { $0.nullValue = .value }
        case .bool(let value):
            return Yiru_Runtime_V1_UiJsonValue.with { $0.boolValue = value }
        case .number(let value):
            return Yiru_Runtime_V1_UiJsonValue.with { $0.numberValue = value }
        case .string(let value):
            return Yiru_Runtime_V1_UiJsonValue.with { $0.stringValue = value }
        case .list(let values):
            return Yiru_Runtime_V1_UiJsonValue.with {
                $0.listValue = Yiru_Runtime_V1_UiJsonValueList.with {
                    $0.values = values.map(\.proto)
                }
            }
        case .object(let entries):
            return Yiru_Runtime_V1_UiJsonValue.with {
                $0.objectValue = Yiru_Runtime_V1_UiJsonValueObject.with { object in
                    object.entries =
                        entries
                        .sorted(by: { $0.key < $1.key })
                        .map { key, value in
                            Yiru_Runtime_V1_UiJsonValueEntry.with {
                                $0.key = key
                                $0.value = value.proto
                            }
                        }
                }
            }
        }
    }

    var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    var boolValue: Bool? {
        if case .bool(let value) = self { return value }
        return nil
    }

    var numberValue: Double? {
        if case .number(let value) = self { return value }
        return nil
    }

    var listValue: [RuntimeUiValue]? {
        if case .list(let value) = self { return value }
        return nil
    }

    var objectValue: [String: RuntimeUiValue]? {
        if case .object(let value) = self { return value }
        return nil
    }

    var stringList: [String]? {
        listValue?.map { value in
            guard case .string(let entry) = value else { return "" }
            return entry
        }
    }
}

nonisolated func runtimeUiFields(_ document: Yiru_Runtime_V1_UiDocument) -> [String: RuntimeUiValue]
{
    Dictionary(
        document.fields.map { ($0.key, RuntimeUiValue($0.value)) },
        uniquingKeysWith: { _, latest in latest }
    )
}

nonisolated func runtimeUiDocument(_ fields: [String: RuntimeUiValue]) -> Yiru_Runtime_V1_UiDocument
{
    Yiru_Runtime_V1_UiDocument.with { document in
        document.fields =
            fields
            .sorted(by: { $0.key < $1.key })
            .map { key, value in
                Yiru_Runtime_V1_UiJsonValueEntry.with {
                    $0.key = key
                    $0.value = value.proto
                }
            }
    }
}

extension RuntimeClient {
    func protocolUiGet(hostID: String) async throws -> [String: RuntimeUiValue] {
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1UiServiceMethods.get,
            request: Yiru_Runtime_V1_UiServiceGetRequest(),
            response: Yiru_Runtime_V1_UiServiceGetResponse.self
        )
        return runtimeUiFields(response.ui)
    }

    func protocolUiSet(
        hostID: String,
        fields: [String: RuntimeUiValue]
    ) async throws -> [String: RuntimeUiValue] {
        let request = Yiru_Runtime_V1_UiServiceSetRequest.with { set in
            set.fields =
                fields
                .sorted(by: { $0.key < $1.key })
                .map { key, value in
                    Yiru_Runtime_V1_UiJsonValueEntry.with {
                        $0.key = key
                        $0.value = value.proto
                    }
                }
        }
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1UiServiceMethods.set,
            request: request,
            response: Yiru_Runtime_V1_UiServiceSetResponse.self
        )
        return runtimeUiFields(response.ui)
    }
}
