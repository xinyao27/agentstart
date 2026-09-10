nonisolated protocol AccountsRepository: Sendable {
    func accounts(for hostID: String) async throws -> AccountsSnapshot
    func accountUpdates(for hostID: String) async throws
        -> AsyncThrowingStream<AccountsSnapshot, Error>
    func selectAccount(hostID: String, provider: AccountProvider, accountID: String?) async throws
}

nonisolated enum AccountsRepositoryError: Error {
    case unsupportedProvider
}
