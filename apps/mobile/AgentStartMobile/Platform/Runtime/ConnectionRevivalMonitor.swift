import Foundation
import Network

nonisolated final class ConnectionRevivalMonitor: @unchecked Sendable {
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "me.xinyao.agentstart.mobile.connection-revival")
    private var isStarted = false
    private var previousPath: PathIdentity?

    func start(onRevival: @escaping @Sendable () -> Void) {
        guard !isStarted else { return }
        isStarted = true
        monitor.pathUpdateHandler = { [weak self] path in
            self?.receive(path, onRevival: onRevival)
        }
        monitor.start(queue: queue)
    }

    private func receive(_ path: NWPath, onRevival: @Sendable () -> Void) {
        let next = PathIdentity(path)
        defer { previousPath = next }
        guard let previousPath, next.isConnected else { return }
        if !previousPath.isConnected || previousPath.interface != next.interface {
            onRevival()
        }
    }
}

nonisolated private struct PathIdentity: Equatable, Sendable {
    let isConnected: Bool
    let interface: Interface

    init(_ path: NWPath) {
        isConnected = path.status == .satisfied
        interface = Interface(path)
    }
}

nonisolated private enum Interface: Equatable, Sendable {
    case wiredEthernet
    case wifi
    case cellular
    case loopback
    case other
    case unavailable

    init(_ path: NWPath) {
        if path.usesInterfaceType(.wiredEthernet) {
            self = .wiredEthernet
        } else if path.usesInterfaceType(.wifi) {
            self = .wifi
        } else if path.usesInterfaceType(.cellular) {
            self = .cellular
        } else if path.usesInterfaceType(.loopback) {
            self = .loopback
        } else if path.usesInterfaceType(.other) {
            self = .other
        } else {
            self = .unavailable
        }
    }
}
