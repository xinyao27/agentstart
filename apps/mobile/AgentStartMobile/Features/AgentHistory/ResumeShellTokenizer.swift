nonisolated enum AgentHistoryShellTokenizer {
    static func tokenize(
        _ value: String,
        shell: AgentHistoryStartupShell
    ) -> [String]? {
        shell == .posix ? tokenizePosix(value) : tokenizeWindows(value, shell: shell)
    }

    private static func tokenizePosix(_ value: String) -> [String]? {
        let characters = Array(value)
        var tokens: [String] = []
        var token = ""
        var tokenStarted = false
        var quoteCharacter: Character?
        var index = 0
        while index < characters.count {
            let character = characters[index]
            if let activeQuote = quoteCharacter {
                if character == "\\", activeQuote == "\"", index + 1 < characters.count {
                    token.append(characters[index + 1])
                    index += 2
                    continue
                }
                if character == activeQuote {
                    quoteCharacter = nil
                    tokenStarted = true
                    index += 1
                    continue
                }
                token.append(character)
                index += 1
                continue
            }
            if character == "\"" || character == "'" {
                quoteCharacter = character
                tokenStarted = true
            } else if character == "\\", index + 1 < characters.count {
                token.append(characters[index + 1])
                tokenStarted = true
                index += 1
            } else if character.isWhitespace {
                if tokenStarted {
                    tokens.append(token)
                    token = ""
                    tokenStarted = false
                }
            } else {
                token.append(character)
                tokenStarted = true
            }
            index += 1
        }
        guard quoteCharacter == nil else { return nil }
        if tokenStarted { tokens.append(token) }
        return tokens
    }

    private static func tokenizeWindows(
        _ value: String,
        shell: AgentHistoryStartupShell
    ) -> [String]? {
        let characters = Array(value)
        let escape: Character = shell == .cmd ? "^" : "`"
        var tokens: [String] = []
        var token = ""
        var quoteCharacter: Character?
        var tokenStarted = false
        var index = 0
        while index < characters.count {
            let character = characters[index]
            if character == escape, index + 1 < characters.count {
                token.append(characters[index + 1])
                tokenStarted = true
                index += 2
                continue
            }
            if let activeQuote = quoteCharacter {
                if character == activeQuote {
                    if shell == .powershell, activeQuote == "'", index + 1 < characters.count,
                        characters[index + 1] == "'"
                    {
                        token.append("'")
                        index += 1
                    } else {
                        quoteCharacter = nil
                    }
                } else {
                    token.append(character)
                }
                tokenStarted = true
            } else if character == "'" || character == "\"" {
                quoteCharacter = character
                tokenStarted = true
            } else if character.isWhitespace {
                if tokenStarted {
                    tokens.append(token)
                    token = ""
                    tokenStarted = false
                }
            } else {
                token.append(character)
                tokenStarted = true
            }
            index += 1
        }
        guard quoteCharacter == nil else { return nil }
        if tokenStarted { tokens.append(token) }
        return tokens
    }
}
