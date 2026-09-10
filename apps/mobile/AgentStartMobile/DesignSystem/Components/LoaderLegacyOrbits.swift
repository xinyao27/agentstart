import Foundation

struct LoaderLegacyOrbit {
    let basisU: LoaderPoint3
    let basisV: LoaderPoint3
    let radiusFactor: Double
    let speed: Double
    let phaseSeed: Double
}

struct LoaderLegacyOrbitsData {
    let orbits: [LoaderLegacyOrbit]
    let ghostCosines: [Double]
    let ghostSines: [Double]

    init(options: LoaderLegacyOptions) {
        orbits = (0..<options.orbitCount).map { orbitIndex in
            let firstHash = loaderHash(Double(orbitIndex), 1.7)
            let secondHash = loaderHash(Double(orbitIndex), 5.2)
            let thirdHash = loaderHash(Double(orbitIndex), 8.9)
            let theta = firstHash * .pi * 2
            let phi = acos(2 * secondHash - 1)
            let normalX = sin(phi) * cos(theta)
            let normalY = cos(phi)
            let normalZ = sin(phi) * sin(theta)
            var basisUX = -normalY
            var basisUY = normalX
            let basisUZ = 0.0
            let length = max(0.000_001, hypot(basisUX, basisUY))
            basisUX /= length
            basisUY /= length
            let basisV = LoaderPoint3(
                x: normalY * basisUZ - normalZ * basisUY,
                y: normalZ * basisUX - normalX * basisUZ,
                z: normalX * basisUY - normalY * basisUX
            )
            return LoaderLegacyOrbit(
                basisU: LoaderPoint3(x: basisUX, y: basisUY, z: basisUZ),
                basisV: basisV,
                radiusFactor: 0.45 + 0.52 * firstHash,
                speed: (0.25 + 0.55 * thirdHash) * (thirdHash > 0.5 ? 1 : -1),
                phaseSeed: secondHash
            )
        }
        let angles = (0..<options.ghostCount).map {
            Double($0) / Double(options.ghostCount) * .pi * 2
        }
        ghostCosines = angles.map(cos)
        ghostSines = angles.map(sin)
    }
}

extension LoaderLegacyRenderer {
    func drawOrbits(time: Double, data: LoaderLegacyOrbitsData) -> [LoaderDot] {
        let center = size / 2
        let radius = center * 0.82
        let radiusScale = loaderRadiusScale(size: size, power: options.radiusPower)
        let ghostRadius = options.ghostRadius * radiusScale
        var dots: [LoaderDot] = []
        var order = 0
        for orbit in data.orbits {
            let orbitRadius = radius * orbit.radiusFactor
            for index in data.ghostCosines.indices {
                let cosine = data.ghostCosines[index]
                let sine = data.ghostSines[index]
                let projected = loaderProject(
                    x: (orbit.basisU.x * cosine + orbit.basisV.x * sine) * orbitRadius,
                    y: (orbit.basisU.y * cosine + orbit.basisV.y * sine) * orbitRadius,
                    z: (orbit.basisU.z * cosine + orbit.basisV.z * sine) * orbitRadius,
                    yaw: time * 0.12,
                    tilt: 0.3,
                    centerX: center,
                    centerY: center,
                    scale: 1
                )
                let depth = (projected.z / orbitRadius + 1) / 2
                dots.append(
                    LoaderDot(
                        x: projected.x,
                        y: projected.y,
                        z: projected.z,
                        radius: ghostRadius,
                        white: 0.72,
                        opacity: options.ghostAlpha * (0.4 + 0.6 * depth),
                        order: order
                    )
                )
                order += 1
            }
            for particleIndex in 0..<options.particleCount {
                let angle =
                    time * orbit.speed
                    + Double(particleIndex) / Double(options.particleCount) * .pi * 2
                    + orbit.phaseSeed * 6
                let cosine = cos(angle)
                let sine = sin(angle)
                let projected = loaderProject(
                    x: (orbit.basisU.x * cosine + orbit.basisV.x * sine) * orbitRadius,
                    y: (orbit.basisU.y * cosine + orbit.basisV.y * sine) * orbitRadius,
                    z: (orbit.basisU.z * cosine + orbit.basisV.z * sine) * orbitRadius,
                    yaw: time * 0.12,
                    tilt: 0.3,
                    centerX: center,
                    centerY: center,
                    scale: 1
                )
                let depth = (projected.z / orbitRadius + 1) / 2
                dots.append(
                    LoaderDot(
                        x: projected.x,
                        y: projected.y,
                        z: projected.z,
                        radius: (options.particleRadius + options.particleRadiusDepth * depth)
                            * radiusScale,
                        white: 0.3 - 0.22 * depth,
                        opacity: 1,
                        order: order
                    )
                )
                order += 1
            }
        }
        return dots
    }
}
