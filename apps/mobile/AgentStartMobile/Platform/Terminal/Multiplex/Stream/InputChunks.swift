import Foundation

nonisolated enum TerminalInputChunks {
    static func split(_ data: Data, maxBytes: Int) -> [Data]? {
        guard maxBytes > 0, let text = String(data: data, encoding: .utf8) else { return nil }
        guard !text.isEmpty else { return [] }
        var chunks: [Data] = []
        var current = Data()
        for character in text {
            let bytes = Data(String(character).utf8)
            guard bytes.count <= maxBytes else { return nil }
            if current.count + bytes.count > maxBytes {
                chunks.append(current)
                current = Data()
            }
            current.append(bytes)
        }
        if !current.isEmpty {
            chunks.append(current)
        }
        return chunks
    }
}
