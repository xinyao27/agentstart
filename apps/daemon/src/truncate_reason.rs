// Why: RFC 6455 caps a WebSocket close reason at 123 UTF-8 bytes, so both connection
// handlers bound the reason to the same budget on a char boundary.
pub(crate) fn truncate_reason(reason: &str) -> &str {
    let mut end = reason.len().min(123);
    while !reason.is_char_boundary(end) {
        end -= 1;
    }
    &reason[..end]
}
