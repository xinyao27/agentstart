import Foundation
import SwiftProtobuf

extension RuntimeClient {
    func sourceMutation<Request: SwiftProtobuf.Message, Response: SwiftProtobuf.Message>(
        _ hostID: String,
        procedure: String,
        request: Request,
        response: Response.Type,
        isOK: (Response) -> Bool
    ) async throws {
        let result = try await protocolUnary(
            hostID: hostID,
            procedure: procedure,
            request: request,
            response: response
        )
        guard isOK(result) else { throw SourceControlRepositoryError.rejectedMutation }
    }
}
