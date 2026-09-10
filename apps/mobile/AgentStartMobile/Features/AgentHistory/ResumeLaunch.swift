import Foundation

nonisolated enum AgentHistoryHostPlatform: String, Sendable {
    case aix
    case android
    case darwin
    case freebsd
    case haiku
    case linux
    case openbsd
    case sunos
    case win32
    case cygwin
    case netbsd
}

nonisolated enum AgentHistoryStartupShell: Sendable {
    case posix
    case powershell
    case cmd
}

nonisolated struct AgentHistoryResumeSettings: Sendable {
    let commandOverrides: [String: String]
    let defaultArguments: [String: String]
    let defaultEnvironment: [String: [String: String]]
}

nonisolated struct AgentHistoryResumeLaunch: Sendable {
    let command: String
    let environment: [String: String]?
    let environmentToDelete: [String]?
    let launchConfig: MobileSleepingAgentLaunchConfigWire?
    let launchAgent: String?
}

nonisolated enum AgentHistoryResumeLaunchError: Error {
    case unknownHostPlatform
}

nonisolated enum AgentHistoryResumeLaunchBuilder {
    private static let resumableAgents: Set<String> = [
        "claude", "codex", "gemini", "antigravity", "opencode", "mimo-code", "pi", "droid",
        "grok", "devin", "omp",
    ]

    private static let defaultCommands = [
        "antigravity": "agy",
        "claude": "claude",
        "codex": "codex",
        "copilot": "copilot",
        "cursor": "cursor-agent",
        "devin": "devin",
        "droid": "droid",
        "gemini": "gemini",
        "grok": "grok",
        "hermes": "hermes",
        "kimi": "kimi",
        "omp": "omp",
        "openclaw": "openclaw",
        "opencode": "opencode",
        "pi": "pi",
        "rovo": "acli",
    ]

    private static let defaultArguments = [
        "antigravity": "--dangerously-skip-permissions",
        "claude": "--dangerously-skip-permissions",
        "codex": "--dangerously-bypass-approvals-and-sandbox",
        "devin": "--permission-mode bypass",
        "gemini": "--yolo",
        "grok": "--permission-mode bypassPermissions",
    ]

    static func build(
        session: AgentHistorySession,
        workspace: WorkspaceSummary,
        status: MobileRuntimeStatusWire,
        settings: AgentHistoryResumeSettings
    ) throws -> AgentHistoryResumeLaunch {
        guard
            let hostPlatform = status.hostPlatform.flatMap(AgentHistoryHostPlatform.init(rawValue:))
        else { throw AgentHistoryResumeLaunchError.unknownHostPlatform }
        let platform = resolvedPlatform(host: hostPlatform, workspace: workspace)
        let shell =
            platform == .win32
            ? windowsShell(status.terminalWindowsShell)
            : .posix
        let codexHome = normalizedCodexHome(session.codexHome, platform: platform)
        let environmentToDelete =
            session.agent == "codex" && session.codexHome == nil
            ? ["CODEX_HOME", "AGENTSTART_CODEX_HOME"]
            : nil

        if resumableAgents.contains(session.agent),
            let startup = resumableStartup(
                session: session,
                platform: platform,
                shell: shell,
                settings: settings
            )
        {
            return AgentHistoryResumeLaunch(
                command: wrap(
                    startup.command,
                    cwd: session.cwd,
                    codexHome: codexHome,
                    platform: platform,
                    shell: shell
                ),
                environment: startup.environment.isEmpty ? nil : startup.environment,
                environmentToDelete: environmentToDelete,
                launchConfig: startup.launchConfig,
                launchAgent: session.agent
            )
        }

        let override = normalizedOverride(settings.commandOverrides[session.agent])
        let baseCommand = override ?? defaultCommands[session.agent] ?? session.agent
        let target =
            session.agent == "omp" && !session.filePath.isEmpty
            ? session.filePath
            : session.sessionID
        let command = resumeInvocation(
            agent: session.agent,
            baseCommand: baseCommand,
            quotedTarget: legacyQuote(target, platform: platform, shell: shell)
        )
        return AgentHistoryResumeLaunch(
            command: wrap(
                command,
                cwd: session.cwd,
                codexHome: codexHome,
                platform: platform,
                shell: shell
            ),
            environment: nil,
            environmentToDelete: environmentToDelete,
            launchConfig: nil,
            launchAgent: nil
        )
    }

    private static func resumableStartup(
        session: AgentHistorySession,
        platform: AgentHistoryHostPlatform,
        shell: AgentHistoryStartupShell,
        settings: AgentHistoryResumeSettings
    ) -> (
        command: String, environment: [String: String],
        launchConfig: MobileSleepingAgentLaunchConfigWire
    )? {
        // Why: Pi's authoritative session_file is not synthesizable from the vault file
        // path, so without that provider locator this deliberately uses the fallback.
        guard session.agent != "pi" else { return nil }
        let configuredArguments = settings.defaultArguments[session.agent]
        let arguments = configuredArguments ?? defaultArguments[session.agent] ?? ""
        guard let suffix = quotedArgumentSuffix(arguments, shell: shell) else { return nil }
        let override = normalizedOverride(settings.commandOverrides[session.agent])
        let defaultCommand = defaultCommands[session.agent] ?? session.agent
        var baseCommand = override ?? defaultCommand
        if !suffix.isEmpty { baseCommand += " \(suffix)" }
        let target =
            session.agent == "omp" && !session.filePath.isEmpty
            ? session.filePath
            : session.sessionID
        let command = resumeInvocation(
            agent: session.agent,
            baseCommand: baseCommand,
            quotedTarget: quote(target, shell: shell)
        )
        let environment = settings.defaultEnvironment[session.agent] ?? [:]
        return (
            command,
            environment,
            MobileSleepingAgentLaunchConfigWire(
                agentCommand: baseCommand.isEmpty ? nil : baseCommand,
                agentArgs: arguments,
                agentEnv: environment,
                ompResumeFilePath: session.agent == "omp" && !session.filePath.isEmpty
                    ? session.filePath
                    : nil
            )
        )
    }

    private static func resolvedPlatform(
        host: AgentHistoryHostPlatform,
        workspace: WorkspaceSummary
    ) -> AgentHistoryHostPlatform {
        if host == .win32,
            workspace.terminalPlatform?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                == "linux"
        {
            return .linux
        }
        if wslLinuxPath(workspace.path) != nil { return .linux }
        return host
    }

    private static func windowsShell(_ configured: String?) -> AgentHistoryStartupShell {
        guard let value = configured?.trimmingCharacters(in: .whitespacesAndNewlines),
            !value.isEmpty
        else { return .powershell }
        if value == "git-bash" { return .posix }
        let basename =
            value.replacingOccurrences(of: "\\", with: "/")
            .split(separator: "/").last?.lowercased() ?? ""
        if basename == "cmd.exe" { return .cmd }
        if basename == "wsl.exe" || basename == "wsl" || basename == "bash.exe" {
            return .posix
        }
        return .powershell
    }

    private static func normalizedCodexHome(
        _ codexHome: String?,
        platform: AgentHistoryHostPlatform
    ) -> String? {
        guard let codexHome, !codexHome.isEmpty else { return nil }
        guard platform == .linux else { return codexHome }
        return wslLinuxPath(codexHome) ?? codexHome
    }

    private static func normalizedOverride(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
            !trimmed.isEmpty
        else { return nil }
        return trimmed
    }

    private static func resumeInvocation(
        agent: String,
        baseCommand: String,
        quotedTarget: String
    ) -> String {
        switch agent {
        case "codex": return "\(baseCommand) resume \(quotedTarget)"
        case "rovo": return "\(baseCommand) rovodev run --restore \(quotedTarget)"
        case "opencode", "mimo-code", "pi", "kimi":
            return "\(baseCommand) --session \(quotedTarget)"
        case "copilot": return "\(baseCommand) --resume=\(quotedTarget)"
        case "antigravity": return "\(baseCommand) --conversation \(quotedTarget)"
        default: return "\(baseCommand) --resume \(quotedTarget)"
        }
    }

    private static func wrap(
        _ command: String,
        cwd: String?,
        codexHome: String?,
        platform: AgentHistoryHostPlatform,
        shell: AgentHistoryStartupShell
    ) -> String {
        if platform == .win32, shell == .powershell {
            var segments: [String] = []
            if let cwd, !cwd.isEmpty {
                segments.append("Set-Location -LiteralPath \(quote(cwd, shell: shell))")
            }
            if let codexHome {
                segments.append("$env:CODEX_HOME=\(quote(codexHome, shell: shell))")
            }
            segments.append(command)
            return segments.joined(separator: "; ")
        }

        if platform == .win32, shell == .cmd {
            let envPrefix =
                codexHome.map { "set \(quoteWindowsCommand("CODEX_HOME=\($0)")) && " }
                ?? ""
            let commandWithEnvironment = "\(envPrefix)\(command)"
            guard let cwd, !cwd.isEmpty else { return commandWithEnvironment }
            return "cd /d \(quoteWindowsCommand(cwd)) && \(commandWithEnvironment)"
        }

        let environmentPrefix = codexHome.map { "CODEX_HOME=\(quote($0, shell: .posix)) " } ?? ""
        let commandWithEnvironment = "\(environmentPrefix)\(command)"
        guard let cwd, !cwd.isEmpty else { return commandWithEnvironment }
        return "cd \(quote(cwd, shell: .posix)) && \(commandWithEnvironment)"
    }

    private static func legacyQuote(
        _ value: String,
        platform: AgentHistoryHostPlatform,
        shell: AgentHistoryStartupShell
    ) -> String {
        platform == .win32 && shell == .cmd
            ? quoteWindowsCommand(value)
            : quote(value, shell: shell)
    }

    private static func quote(_ value: String, shell: AgentHistoryStartupShell) -> String {
        switch shell {
        case .powershell:
            return "'\(value.replacingOccurrences(of: "'", with: "''"))'"
        case .cmd:
            let unsafe = CharacterSet(charactersIn: "^&|<>()%!\"")
            let escaped = value.unicodeScalars.reduce(into: "") { result, scalar in
                if unsafe.contains(scalar) { result.append("^") }
                result.unicodeScalars.append(scalar)
            }
            return "\"\(escaped)\""
        case .posix:
            return "'\(value.replacingOccurrences(of: "'", with: "'\\''"))'"
        }
    }

    private static func quoteWindowsCommand(_ value: String) -> String {
        "\"\(value.replacingOccurrences(of: "\"", with: "\"\""))\""
    }

    private static func quotedArgumentSuffix(
        _ arguments: String,
        shell: AgentHistoryStartupShell
    ) -> String? {
        let trimmed = arguments.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        guard let tokens = AgentHistoryShellTokenizer.tokenize(trimmed, shell: shell) else {
            return nil
        }
        return tokens.map { quote($0, shell: shell) }.joined(separator: " ")
    }

    private static func wslLinuxPath(_ path: String) -> String? {
        let normalized = path.replacingOccurrences(of: "\\", with: "/")
        let parts = normalized.split(separator: "/", omittingEmptySubsequences: true)
        guard parts.count >= 2 else { return nil }
        let server = parts[0].lowercased()
        guard server == "wsl.localhost" || server == "wsl$" else { return nil }
        let suffix = parts.dropFirst(2).joined(separator: "/")
        return suffix.isEmpty ? "/" : "/\(suffix)"
    }
}
