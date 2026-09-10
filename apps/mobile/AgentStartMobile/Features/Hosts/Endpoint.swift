import Foundation
import Network

nonisolated enum HostEndpointResult: Sendable {
    case valid(String)
    case invalid(LocalizedStringResource)
}

nonisolated enum HostEndpoint {
    private static let defaultPort = 6_768

    static func display(_ endpoint: String) -> String {
        guard let components = URLComponents(string: endpoint), let host = components.host else {
            return endpoint
        }
        let displayHost = host.contains(":") ? "[\(host)]" : host
        return components.port.map { "\(displayHost):\($0)" } ?? displayHost
    }

    static func normalize(_ input: String, currentEndpoint: String) -> HostEndpointResult {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .invalid("Enter a host address.") }
        let current = URLComponents(string: currentEndpoint)
        let fallbackPort = current?.port ?? defaultPort
        let fallbackScheme = current?.scheme == "wss" ? "wss" : "ws"
        if trimmed.range(
            of: #"^[A-Za-z][A-Za-z0-9+.-]*://"#,
            options: .regularExpression
        ) != nil {
            return normalizeURL(trimmed, fallbackPort: fallbackPort)
        }
        return normalizeHostPort(
            trimmed,
            fallbackPort: fallbackPort,
            fallbackScheme: fallbackScheme
        )
    }

    private static func normalizeURL(_ input: String, fallbackPort: Int) -> HostEndpointResult {
        guard let components = URLComponents(string: input) else {
            return .invalid("Not a valid address.")
        }
        guard let scheme = components.scheme?.lowercased(), scheme == "ws" || scheme == "wss"
        else {
            return .invalid("Use ws:// or wss:// (or host:port).")
        }
        guard components.user == nil, components.password == nil else {
            return .invalid("Not a valid address.")
        }
        guard (components.path.isEmpty || components.path == "/"),
            components.query == nil,
            components.fragment == nil
        else {
            return .invalid("Host must not include a path or query.")
        }
        guard let host = components.host, !host.isEmpty else {
            return .invalid("Missing hostname.")
        }
        if let error = validateHost(host) { return .invalid(error) }
        let port: Int
        if let explicitPort = explicitPort(in: input) {
            guard let value = Int(explicitPort), isValidPort(value) else {
                return .invalid("Port must be 1–65535.")
            }
            port = value
        } else {
            port = components.port ?? fallbackPort
        }
        return .valid("\(scheme)://\(format(host)):\(port)")
    }

    private static func normalizeHostPort(
        _ input: String,
        fallbackPort: Int,
        fallbackScheme: String
    ) -> HostEndpointResult {
        let host: String
        let portText: String?
        if input.hasPrefix("[") {
            guard let close = input.firstIndex(of: "]"), close > input.startIndex else {
                return .invalid("Not a valid address.")
            }
            host = String(input[input.index(after: input.startIndex)..<close])
            let remainder = String(input[input.index(after: close)...])
            guard remainder.isEmpty || remainder.hasPrefix(":") else {
                return .invalid("Not a valid address.")
            }
            portText = remainder.isEmpty ? nil : String(remainder.dropFirst())
        } else if input.filter({ $0 == ":" }).count == 1,
            let separator = input.lastIndex(of: ":")
        {
            host = String(input[..<separator]).trimmingCharacters(in: .whitespaces)
            portText = String(input[input.index(after: separator)...]).trimmingCharacters(
                in: .whitespaces
            )
        } else {
            host = input.trimmingCharacters(in: .whitespaces)
            portText = nil
        }
        guard !host.isEmpty else { return .invalid("Missing hostname.") }
        if let error = validateHost(host) { return .invalid(error) }
        let port: Int
        if let portText {
            guard let value = Int(portText), isValidPort(value),
                portText.allSatisfy(\.isNumber)
            else {
                return .invalid("Port must be 1–65535.")
            }
            port = value
        } else {
            port = fallbackPort
        }
        return .valid("\(fallbackScheme)://\(format(host)):\(port)")
    }

    private static func validateHost(_ host: String) -> LocalizedStringResource? {
        if host.contains(":") {
            return IPv6Address(host) == nil ? "Not a valid hostname." : nil
        }
        if isNumericIPv4Candidate(host) {
            return isCanonicalIPv4(host) ? nil : "Not a valid hostname."
        }
        if host.allSatisfy({ $0.isNumber || $0 == "." }) {
            return "Not a valid hostname."
        }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        let isValid =
            !labels.isEmpty
            && labels.allSatisfy { label in
                guard !label.isEmpty, label.count <= 63,
                    label.first?.isLetter == true || label.first?.isNumber == true,
                    label.last?.isLetter == true || label.last?.isNumber == true
                else { return false }
                return label.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" }
            }
        return isValid ? nil : "Not a valid hostname."
    }

    private static func isNumericIPv4Candidate(_ host: String) -> Bool {
        let components = host.split(separator: ".", omittingEmptySubsequences: false)
        guard !components.isEmpty else { return false }
        return components.allSatisfy { component in
            let value = String(component)
            return value.range(of: #"^0[xX][0-9a-fA-F]+$"#, options: .regularExpression) != nil
                || value.allSatisfy(\.isNumber)
        }
    }

    private static func isCanonicalIPv4(_ host: String) -> Bool {
        let octets = host.split(separator: ".", omittingEmptySubsequences: false)
        guard octets.count == 4 else { return false }
        return octets.allSatisfy { octet in
            guard !octet.isEmpty,
                octet == "0" || !octet.hasPrefix("0"),
                let value = Int(octet)
            else { return false }
            return value <= 255
        }
    }

    private static func explicitPort(in input: String) -> String? {
        guard let schemeRange = input.range(of: "://") else { return nil }
        let remainder = input[schemeRange.upperBound...]
        let authority = remainder.prefix { !"/?#".contains($0) }
        if authority.hasPrefix("[") {
            guard let close = authority.firstIndex(of: "]") else { return nil }
            let suffix = authority[authority.index(after: close)...]
            return suffix.hasPrefix(":") ? String(suffix.dropFirst()) : nil
        }
        guard let separator = authority.lastIndex(of: ":") else { return nil }
        return String(authority[authority.index(after: separator)...])
    }

    private static func format(_ host: String) -> String {
        host.contains(":") ? "[\(host)]" : host
    }

    private static func isValidPort(_ port: Int) -> Bool {
        (1...65_535).contains(port)
    }
}
