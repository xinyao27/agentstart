import Foundation
import Observation

@Observable
@MainActor
final class TerminalPreferences {
    private(set) var textSize: TerminalTextSize
    private(set) var accessoryLayout: TerminalAccessoryLayout
    private(set) var customKeys: [TerminalCustomKey]

    @ObservationIgnored
    private let store: any TerminalPreferenceStore

    init(store: any TerminalPreferenceStore) {
        let snapshot = store.load()
        textSize = snapshot.textSize
        accessoryLayout = snapshot.accessoryLayout
        customKeys = snapshot.customKeys
        self.store = store
    }

    var surfaceConfiguration: TerminalSurfaceConfiguration {
        .standard(
            textScale: textSize.scale,
            accessoryKeys: accessoryLayout.visibleOrderedKeys,
            customAccessoryKeys: customKeys
        )
    }

    func selectTextSize(_ textSize: TerminalTextSize) {
        guard self.textSize != textSize else { return }
        self.textSize = textSize
        persist()
    }

    func setKey(_ key: TerminalAccessoryKey, isVisible: Bool) {
        var visibleKeys = accessoryLayout.visibleKeys
        if isVisible {
            visibleKeys.insert(key)
        } else {
            visibleKeys.remove(key)
        }
        accessoryLayout = TerminalAccessoryLayout(
            orderedKeys: accessoryLayout.orderedKeys,
            visibleKeys: visibleKeys
        )
        persist()
    }

    func moveKeys(from offsets: IndexSet, to destination: Int) {
        var orderedKeys = accessoryLayout.orderedKeys
        let movingKeys = offsets.sorted().map { orderedKeys[$0] }
        for offset in offsets.sorted(by: >) {
            orderedKeys.remove(at: offset)
        }
        let removedBeforeDestination = offsets.filter { $0 < destination }.count
        orderedKeys.insert(
            contentsOf: movingKeys,
            at: destination - removedBeforeDestination
        )
        accessoryLayout = TerminalAccessoryLayout(
            orderedKeys: orderedKeys,
            visibleKeys: accessoryLayout.visibleKeys
        )
        persist()
    }

    func moveKey(_ key: TerminalAccessoryKey, before destination: TerminalAccessoryKey) {
        guard key != destination,
            let sourceIndex = accessoryLayout.orderedKeys.firstIndex(of: key),
            let destinationIndex = accessoryLayout.orderedKeys.firstIndex(of: destination)
        else { return }
        var orderedKeys = accessoryLayout.orderedKeys
        orderedKeys.remove(at: sourceIndex)
        let insertionIndex =
            destinationIndex > sourceIndex ? destinationIndex - 1 : destinationIndex
        orderedKeys.insert(key, at: insertionIndex)
        accessoryLayout = TerminalAccessoryLayout(
            orderedKeys: orderedKeys,
            visibleKeys: accessoryLayout.visibleKeys
        )
        persist()
    }

    func moveKey(_ key: TerminalAccessoryKey, by offset: Int) {
        guard let sourceIndex = accessoryLayout.orderedKeys.firstIndex(of: key) else { return }
        let destinationIndex = sourceIndex + offset
        guard accessoryLayout.orderedKeys.indices.contains(destinationIndex) else { return }
        var orderedKeys = accessoryLayout.orderedKeys
        orderedKeys.swapAt(sourceIndex, destinationIndex)
        accessoryLayout = TerminalAccessoryLayout(
            orderedKeys: orderedKeys,
            visibleKeys: accessoryLayout.visibleKeys
        )
        persist()
    }

    func resetAccessoryLayout() {
        accessoryLayout = .standard
        persist()
    }

    func addCustomKey(_ key: TerminalCustomKey) {
        guard customKeys.count < 64 else { return }
        customKeys.append(key)
        persist()
    }

    func removeCustomKeys(at offsets: IndexSet) {
        for offset in offsets.sorted(by: >) { customKeys.remove(at: offset) }
        persist()
    }

    func removeCustomKey(_ key: TerminalCustomKey) {
        guard let index = customKeys.firstIndex(where: { $0.id == key.id }) else { return }
        customKeys.remove(at: index)
        persist()
    }

    func moveCustomKeys(from offsets: IndexSet, to destination: Int) {
        let moving = offsets.sorted().map { customKeys[$0] }
        for offset in offsets.sorted(by: >) { customKeys.remove(at: offset) }
        let removedBeforeDestination = offsets.filter { $0 < destination }.count
        customKeys.insert(contentsOf: moving, at: destination - removedBeforeDestination)
        persist()
    }

    func moveCustomKey(id: String, before destinationID: String) {
        guard id != destinationID,
            let sourceIndex = customKeys.firstIndex(where: { $0.id == id }),
            let destinationIndex = customKeys.firstIndex(where: { $0.id == destinationID })
        else { return }
        var reordered = customKeys
        let key = reordered.remove(at: sourceIndex)
        let insertionIndex =
            destinationIndex > sourceIndex ? destinationIndex - 1 : destinationIndex
        reordered.insert(key, at: insertionIndex)
        customKeys = reordered
        persist()
    }

    func moveCustomKey(id: String, by offset: Int) {
        guard let sourceIndex = customKeys.firstIndex(where: { $0.id == id }) else { return }
        let destinationIndex = sourceIndex + offset
        guard customKeys.indices.contains(destinationIndex) else { return }
        customKeys.swapAt(sourceIndex, destinationIndex)
        persist()
    }

    private func persist() {
        store.save(
            TerminalPreferencesSnapshot(
                textSize: textSize,
                accessoryLayout: accessoryLayout,
                customKeys: customKeys
            )
        )
    }
}
