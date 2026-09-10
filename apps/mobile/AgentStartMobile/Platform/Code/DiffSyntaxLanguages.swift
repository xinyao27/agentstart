// Why: the language-rule tables that back AgentStartDiffSyntax's scanner. Split from
// DiffSyntax.swift so the scanning engine stays stable while this file grows every time a
// language is added — the file preview (WorkspaceSourceText) and the Diff Code Surface share
// this table, so a language colors identically in both.
nonisolated extension AgentStartDiffSyntax {
    enum Language: Sendable, Equatable, Hashable {
        case yaml
        case json
        case javascript
        case swift
        case python
        case shell
        case markup
        case css
        case c
        case csharp
        case go
        case java
        case kotlin
        case lua
        case php
        case ruby
        case rust
        case sql
        case directive
        case r
        case graphql
        case plain
    }

    // Filename-and-extension tables for the file preview's language detection.
    static func language(for filePath: String?) -> Language {
        guard let filePath else { return .plain }
        let components = filePath.split(whereSeparator: { $0 == "/" || $0 == "\\" })
        guard let filename = components.last else { return .plain }
        if let exact = Self.filenameLanguages[String(filename)] {
            return exact
        }
        guard let suffix = filename.split(separator: ".").last, filename.contains(".") else {
            return .plain
        }
        return Self.extensionLanguages[suffix.lowercased()] ?? .plain
    }

    private static let filenameLanguages: [String: Language] = [
        "Dockerfile": .directive,
        "Makefile": .directive,
        "CMakeLists.txt": .directive,
        ".gitignore": .directive,
        ".gitattributes": .directive,
        ".editorconfig": .directive,
        ".env": .directive,
        ".env.local": .directive,
        ".env.development": .directive,
        ".env.production": .directive,
    ]

    // Why: markdown source view is deliberately left as .plain. Highlighting it properly means
    // recursively re-highlighting fenced sub-blocks in other languages, which this line-scanner
    // architecture cannot reproduce; the source view is a secondary escape hatch behind the
    // rendered preview (WorkspaceTextPreview defaults to rendered markdown), so a second
    // tokenizer shape is not worth its cost here.
    private static let extensionLanguages: [String: Language] = [
        "yml": .yaml, "yaml": .yaml,
        "json": .json, "jsonc": .json,
        "js": .javascript, "jsx": .javascript, "mjs": .javascript, "cjs": .javascript,
        "ts": .javascript, "tsx": .javascript,
        "swift": .swift,
        "py": .python,
        "sh": .shell, "bash": .shell, "zsh": .shell, "fish": .shell,
        // Why: approximated via the shell bucket rather than a dedicated PowerShell table —
        // both are hash-commented, brace-light scripting languages and share most control-flow
        // keywords (if/else/for/while/function); cmdlet-specific coloring is the tradeoff.
        "ps1": .shell,
        "html": .markup, "htm": .markup, "xml": .markup, "svg": .markup,
        "css": .css, "scss": .css, "less": .css,
        "c": .c, "h": .c,
        // Why: cpp/cc/cxx/hpp share the .c bucket — a combined C/C++ keyword table, not a
        // separate C++-only grammar.
        "cpp": .c, "cc": .c, "cxx": .c, "hpp": .c,
        "cs": .csharp,
        "go": .go,
        "java": .java,
        "kt": .kotlin, "kts": .kotlin,
        "lua": .lua,
        "php": .php,
        "rb": .ruby,
        "rs": .rust,
        "sql": .sql,
        "toml": .directive, "ini": .directive, "cfg": .directive, "conf": .directive,
        "make": .directive,
        "r": .r,
        "graphql": .graphql, "gql": .graphql,
    ]

    static func keywords(for language: Language) -> Set<String> {
        switch language {
        case .yaml, .json, .directive: []
        case .javascript:
            [
                "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
                "default", "delete", "else", "export", "extends", "finally", "for", "from",
                "function", "if", "import", "in", "interface", "let", "new", "of", "return",
                "static", "switch", "throw", "try", "type", "typeof", "var", "void", "while",
                "with", "yield",
            ]
        case .swift:
            [
                "actor", "as", "associatedtype", "await", "break", "case", "catch", "class",
                "continue",
                "defer", "else", "enum", "extension", "fallthrough", "for", "func", "guard", "if",
                "import", "in", "init", "let", "protocol", "repeat", "return", "self", "struct",
                "switch", "throw", "throws", "try", "typealias", "var", "where", "while",
            ]
        case .python:
            [
                "and", "as", "assert", "async", "await", "break", "class", "continue", "def",
                "elif",
                "else", "for", "from", "global", "if", "import", "in", "is", "lambda", "match",
                "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
            ]
        case .shell:
            [
                "case", "do", "done", "elif", "else", "esac", "fi", "for", "function", "if", "in",
                "then", "while",
            ]
        case .markup:
            ["DOCTYPE", "html", "head", "body", "script", "style"]
        case .css: ["@import", "@media", "@supports"]
        case .c:
            [
                "auto", "break", "case", "char", "class", "const", "constexpr", "continue",
                "default", "delete", "do", "double", "else", "enum", "explicit", "extern",
                "float", "for", "friend", "goto", "if", "inline", "int", "long", "namespace",
                "new", "noexcept", "operator", "override", "private", "protected", "public",
                "register", "return", "short", "signed", "sizeof", "static", "struct", "switch",
                "template", "throw", "try", "typedef", "union", "unsigned", "using", "virtual",
                "void", "volatile", "while",
            ]
        case .csharp:
            [
                "abstract", "as", "async", "await", "base", "break", "case", "catch", "checked",
                "class", "const", "continue", "default", "delegate", "do", "else", "enum",
                "event", "explicit", "extern", "finally", "for", "foreach", "goto", "if",
                "implicit", "in", "interface", "internal", "is", "lock", "namespace", "new",
                "object", "operator", "out", "override", "params", "private", "protected",
                "public", "readonly", "record", "ref", "return", "sealed", "static", "struct",
                "switch", "this", "throw", "try", "typeof", "unsafe", "using", "var", "virtual",
                "void", "while", "yield",
            ]
        case .go:
            [
                "break", "case", "chan", "const", "continue", "default", "defer", "else",
                "fallthrough", "for", "func", "go", "goto", "if", "import", "interface", "map",
                "package", "range", "return", "select", "struct", "switch", "type", "var",
            ]
        case .java:
            [
                "abstract", "assert", "break", "case", "catch", "class", "const", "continue",
                "default", "do", "else", "enum", "extends", "final", "finally", "for", "goto",
                "if", "implements", "import", "instanceof", "interface", "native", "new",
                "package", "private", "protected", "public", "record", "return", "static",
                "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
                "transient", "try", "var", "void", "volatile", "while", "yield",
            ]
        case .kotlin:
            [
                "as", "break", "by", "class", "companion", "constructor", "continue", "data",
                "do", "else", "enum", "for", "fun", "if", "import", "in", "init", "interface",
                "internal", "is", "object", "override", "package", "private", "protected",
                "public", "return", "sealed", "super", "suspend", "this", "throw", "try",
                "typealias", "typeof", "val", "var", "when", "while",
            ]
        case .lua:
            [
                "and", "break", "do", "else", "elseif", "end", "for", "function", "goto", "if",
                "in", "local", "not", "or", "repeat", "return", "then", "until", "while",
            ]
        case .php:
            [
                "abstract", "and", "array", "as", "break", "case", "catch", "class", "clone",
                "const", "continue", "declare", "default", "do", "echo", "else", "elseif",
                "empty", "enddeclare", "endfor", "endforeach", "endif", "endswitch", "endwhile",
                "extends", "final", "finally", "fn", "for", "foreach", "function", "global",
                "goto", "if", "implements", "include", "instanceof", "insteadof", "interface",
                "isset", "list", "match", "namespace", "new", "or", "print", "private",
                "protected", "public", "require", "return", "static", "switch", "throw", "trait",
                "try", "unset", "use", "var", "while", "xor", "yield",
            ]
        case .ruby:
            [
                "and", "begin", "break", "case", "class", "def", "defined?", "do", "else",
                "elsif", "end", "ensure", "for", "if", "in", "module", "next", "not", "or",
                "redo", "rescue", "retry", "return", "self", "super", "then", "undef", "unless",
                "until", "when", "while", "yield",
            ]
        case .rust:
            [
                "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else",
                "enum", "extern", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod",
                "move", "mut", "pub", "ref", "return", "Self", "self", "static", "struct",
                "super", "trait", "type", "unsafe", "use", "where", "while",
            ]
        case .sql:
            [
                "select", "insert", "update", "delete", "from", "where", "join", "inner", "left",
                "right", "outer", "on", "group", "by", "order", "having", "limit", "offset",
                "values", "into", "create", "table", "alter", "drop", "index", "view", "as",
                "and", "or", "not", "in", "is", "like", "between", "union", "all", "distinct",
                "case", "when", "then", "else", "end", "primary", "key", "foreign", "references",
                "default", "constraint", "exists",
            ]
        case .r:
            [
                "break", "else", "for", "function", "if", "in", "next", "repeat", "return",
                "while",
            ]
        case .graphql:
            [
                "query", "mutation", "subscription", "fragment", "type", "interface", "enum",
                "input", "schema", "scalar", "union", "implements", "extend", "on", "directive",
            ]
        case .plain: []
        }
    }

    static func literals(for language: Language) -> Set<String> {
        switch language {
        case .yaml: ["true", "false", "null", "yes", "no", "on", "off"]
        case .json, .javascript, .swift, .python, .shell:
            ["true", "false", "nil", "null", "None", "undefined"]
        case .c, .csharp, .java, .php: ["true", "false", "null"]
        case .go: ["true", "false", "nil", "iota"]
        case .kotlin, .ruby: ["true", "false", "null", "nil"]
        case .lua: ["true", "false", "nil"]
        case .rust: ["true", "false", "None", "Some", "Ok", "Err"]
        case .sql: ["true", "false", "null"]
        case .r: ["TRUE", "FALSE", "NULL", "NA", "Inf", "NaN"]
        case .graphql: ["true", "false", "null"]
        case .markup, .css, .directive, .plain: []
        }
    }

    // Why: applied per line (matching how the Diff Code Surface already calls `segments(for:)`
    // one diff line at a time), so a block-comment start simply marks the rest of that line as
    // a comment rather than tracking multi-line comment state across calls.
    private static let hashCommentLanguages: Set<Language> = [
        .yaml, .python, .shell, .ruby, .r, .graphql, .directive, .php,
    ]
    private static let slashCommentLanguages: Set<Language> = [
        .javascript, .swift, .css, .c, .csharp, .go, .java, .kotlin, .rust, .php,
    ]
    private static let dashCommentLanguages: Set<Language> = [.sql, .lua]

    static func commentLength(
        at index: Int,
        in characters: [Character],
        language: Language
    ) -> Int {
        guard index < characters.count else { return 0 }
        if characters[index] == "#", hashCommentLanguages.contains(language) {
            return 1
        }
        if characters[index] == "/", index + 1 < characters.count, characters[index + 1] == "/" {
            return slashCommentLanguages.contains(language) ? 2 : 0
        }
        if characters[index] == "/", index + 1 < characters.count, characters[index + 1] == "*" {
            return slashCommentLanguages.contains(language) ? 2 : 0
        }
        if characters[index] == "-", index + 1 < characters.count, characters[index + 1] == "-" {
            return dashCommentLanguages.contains(language) ? 2 : 0
        }
        if characters[index] == "<", index + 3 < characters.count,
            characters[index + 1] == "!", characters[index + 2] == "-", characters[index + 3] == "-"
        {
            return language == .markup ? 4 : 0
        }
        return 0
    }
}
