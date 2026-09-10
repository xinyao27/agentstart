import Foundation

nonisolated struct PairingCodeDecoder: Sendable {
    func decode(_ input: String) throws -> PairingOffer {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw PairingCodeError.invalid }
        let code =
            if trimmed.lowercased().hasPrefix("agentstart://") {
                try extractCode(from: trimmed)
            } else {
                trimmed
            }
        return try decodePayload(code)
    }

    func decodeScannedURL(_ input: String) throws -> PairingOffer {
        try decodePayload(extractCode(from: input.trimmingCharacters(in: .whitespacesAndNewlines)))
    }

    private func extractCode(from input: String) throws -> String {
        guard
            let components = URLComponents(string: input),
            components.scheme?.lowercased() == "agentstart",
            components.host?.lowercased() == "pair",
            components.path.isEmpty || components.path == "/"
        else {
            throw PairingCodeError.invalid
        }

        if let queryCode = components.queryItems?.first(where: { $0.name == "code" })?.value,
            !queryCode.isEmpty
        {
            return queryCode
        }
        if let fragment = components.fragment, !fragment.isEmpty {
            return fragment
        }
        throw PairingCodeError.invalid
    }

    private func decodePayload(_ code: String) throws -> PairingOffer {
        guard code.wholeMatch(of: /^[A-Za-z0-9_-]+={0,2}$/) != nil else {
            throw PairingCodeError.invalid
        }
        let remainder = code.count % 4
        guard remainder != 1 else { throw PairingCodeError.invalid }
        let canonical =
            code
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
            .appending(String(repeating: "=", count: remainder == 0 ? 0 : 4 - remainder))
        guard let data = Data(base64Encoded: canonical) else { throw PairingCodeError.invalid }
        try validateJSONShape(data)

        let wire: PairingOfferWire
        do {
            wire = try JSONDecoder().decode(PairingOfferWire.self, from: data)
        } catch {
            throw PairingCodeError.invalid
        }
        return try validate(wire)
    }

    private func validate(_ wire: PairingOfferWire) throws -> PairingOffer {
        guard
            wire.v == MobilePairingWireContract.offerVersion,
            !wire.endpoint.isEmpty,
            !wire.deviceToken.isEmpty,
            !wire.publicKeyB64.isEmpty
        else {
            throw PairingCodeError.invalid
        }
        let publicKey = try decodePublicKey(wire.publicKeyB64)
        return PairingOffer(
            endpoint: wire.endpoint,
            deviceToken: wire.deviceToken,
            publicKey: publicKey,
            publicKeyBase64: wire.publicKeyB64,
            scope: wire.scope.map(pairingScope)
        )
    }

    private func pairingScope(_ scope: PairingScopeWire) -> PairingScope {
        switch scope {
        case .mobile:
            .mobile
        case .runtime:
            .runtime
        }
    }

    private func decodePublicKey(_ value: String) throws -> Data {
        guard let bytes = Data(base64Encoded: value), bytes.count == 32 else {
            throw PairingCodeError.invalid
        }
        return bytes
    }

    private func validateJSONShape(_ data: Data) throws {
        guard let object = try? JSONSerialization.jsonObject(with: data),
            let offer = object as? [String: Any]
        else {
            throw PairingCodeError.invalid
        }
        try requireKeys(
            offer,
            required: ["v", "endpoint", "deviceToken", "publicKeyB64"],
            optional: ["scope"]
        )
    }

    private func requireKeys(
        _ object: [String: Any], required: Set<String>, optional: Set<String>
    ) throws {
        let keys = Set(object.keys)
        guard required.isSubset(of: keys), keys.isSubset(of: required.union(optional)) else {
            throw PairingCodeError.invalid
        }
    }
}

nonisolated enum PairingCodeError: Error {
    case invalid
}
