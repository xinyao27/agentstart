// Why: response-body schema drift is local to one call and must not reset an authenticated
// transport that can continue serving unrelated features.
nonisolated struct RuntimeResponseValidationError: Error {
    let field: String

    init(_ field: String) {
        self.field = field
    }
}
