import Foundation

nonisolated private let marineWorkspaceNames = """
    nautilus seahorse starfish coral narwhal jellyfish octopus manta dolphin manatee cuttlefish anemone
    urchin triton nudibranch coelacanth oarfish beluga dugong porpoise stingray hammerhead wobbegong
    sawfish chimaera anglerfish viperfish dragonfish axolotl otter seadragon seahare squid argonaut sponge
    barnacle cowrie guitarfish lamprey isopod lionfish clownfish angelfish butterflyfish parrotfish
    pufferfish moonfish firefish unicornfish rainbowfish betta discus arowana koi piranha barracuda moray
    sunfish lanternfish archerfish mudskipper hatchetfish knifefish leaffish glassfish ropefish bichir
    tigerfish cardinalfish lungfish opah frogfish stonefish cutlassfish paddlefish arapaima mandarin blobfish
    thresher vaquita pipefish guppy tetra danio cichlid oscar gourami killifish rasbora pleco goldfish molly
    platy barb loach medaka pacu filefish boxfish cowfish surgeonfish damselfish wrasse goby blenny conger
    sculpin darter remora pilotfish trumpetfish cornetfish jawfish toadfish pearlfish driftfish lumpfish
    snailfish stickleback halfbeak snipefish pencilfish snakehead tripletail lookdown sweetlips squirrelfish
    soldierfish rabbitfish hawkfish bannerfish batfish chromis anthias fusilier sweeper emperor ponyfish
    kelpfish weever pearlside opaleye ballyhoo needlefish triggerfish gar tarpon sailfish conch walrus seal
    penguin hagfish gulper hydra krill salp tunicate crinoid polyp limpet whelk bowfin minnow gudgeon
    """
    .split(whereSeparator: \Character.isWhitespace)
    .map(String.init)

nonisolated func suggestedWorkspaceName(existingPaths: [String]) -> String {
    let used = Set(existingPaths.map(workspacePathBasename).map { $0.lowercased() })
    let available = marineWorkspaceNames.filter { !used.contains($0) }
    if let name = available.randomElement() { return name }
    var suffix = 2
    while true {
        if let name = marineWorkspaceNames.randomElement(), !used.contains("\(name)-\(suffix)") {
            return "\(name)-\(suffix)"
        }
        suffix += 1
    }
}

nonisolated private func workspacePathBasename(_ path: String) -> String {
    path.replacingOccurrences(of: "\\", with: "/")
        .split(separator: "/", omittingEmptySubsequences: true)
        .last
        .map(String.init) ?? path
}
