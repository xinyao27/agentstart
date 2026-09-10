import Foundation

struct LoaderLegacyRibbonData {
    let ghostDirections: [LoaderPoint3]
    let segmentAngles: [Double]
    let segmentCosines: [Double]
    let segmentSines: [Double]
    let laneOffsets: [Double]
    let edgeWeights: [Double]

    init(options: LoaderLegacyOptions) {
        ghostDirections = (0..<options.ghostCount).map { index in
            let golden = Double.pi * (3 - sqrt(5))
            let y = 1 - 2 * (Double(index) + 0.5) / Double(options.ghostCount)
            let radius = sqrt(1 - y * y)
            let angle = Double(index) * golden
            return LoaderPoint3(x: radius * cos(angle), y: y, z: radius * sin(angle))
        }
        segmentAngles = (0..<options.segments).map {
            Double($0) / Double(options.segments) * .pi * 2
        }
        segmentCosines = segmentAngles.map(cos)
        segmentSines = segmentAngles.map(sin)
        let laneCount = max(1, Int((Double(options.lanes) * options.bandMultiplier).rounded()))
        laneOffsets = (0..<laneCount).map {
            (Double($0) - Double(laneCount - 1) / 2) * 0.075
        }
        edgeWeights = (0..<laneCount).map {
            abs(Double($0) - Double(laneCount - 1) / 2)
                / max(1, Double(laneCount - 1) / 2)
        }
    }
}

extension LoaderLegacyRenderer {
    func drawRibbon(time: Double, data: LoaderLegacyRibbonData) -> [LoaderDot] {
        let center = size / 2
        let radius = center * 0.78
        let radiusScale = loaderRadiusScale(size: size, power: options.radiusPower)
        var dots: [LoaderDot] = []
        var order = 0
        for direction in data.ghostDirections {
            let projected = loaderProject(
                x: direction.x * radius,
                y: direction.y * radius,
                z: direction.z * radius,
                yaw: time * 0.1 * options.spin,
                tilt: 0.3,
                centerX: center,
                centerY: center,
                scale: 1
            )
            let depth = (projected.z / radius + 1) / 2
            dots.append(
                LoaderDot(
                    x: projected.x,
                    y: projected.y,
                    z: projected.z,
                    radius: 0.8 * radiusScale,
                    white: 0.78,
                    opacity: 0.1 + 0.22 * depth,
                    order: order
                )
            )
            order += 1
        }

        let yaw = time * 0.24 * options.spin
        let tilt = 0.55 + 0.3 * sin(time * 0.18) * options.spin
        let basisUX = cos(yaw)
        let basisUY = 0.0
        let basisUZ = sin(yaw)
        let basisVX = -basisUZ * sin(tilt)
        let basisVY = cos(tilt)
        let basisVZ = basisUX * sin(tilt)
        let normalX = basisUY * basisVZ - basisUZ * basisVY
        let normalY = basisUZ * basisVX - basisUX * basisVZ
        let normalZ = basisUX * basisVY - basisUY * basisVX

        for laneIndex in data.laneOffsets.indices {
            let laneOffset = data.laneOffsets[laneIndex]
            let edge = data.edgeWeights[laneIndex]
            for segmentIndex in data.segmentAngles.indices {
                let angle = data.segmentAngles[segmentIndex]
                let cosine = data.segmentCosines[segmentIndex]
                let sine = data.segmentSines[segmentIndex]
                let wobble =
                    (0.16 * sin(angle * 3 - time * 1.7 + Double(laneIndex) * 0.22)
                        + 0.07 * sin(angle * 5 + time * 1.1)) * options.wobbleMultiplier
                let offset = laneOffset + wobble
                let x = basisUX * cosine + basisVX * sine + normalX * offset
                let y = basisUY * cosine + basisVY * sine + normalY * offset
                let z = basisUZ * cosine + basisVZ * sine + normalZ * offset
                let length = sqrt(x * x + y * y + z * z)
                let projected = loaderProject(
                    x: x / length * radius,
                    y: y / length * radius,
                    z: z / length * radius,
                    yaw: time * 0.1 * options.spin,
                    tilt: 0.3,
                    centerX: center,
                    centerY: center,
                    scale: 1
                )
                let depth = (projected.z / radius + 1) / 2
                dots.append(
                    LoaderDot(
                        x: projected.x,
                        y: projected.y,
                        z: projected.z,
                        radius: (options.radiusBase + options.radiusDepth * depth)
                            * (1 - 0.25 * edge) * radiusScale,
                        white: 0.52 - 0.44 * depth + 0.18 * edge,
                        opacity: 0.4 + 0.6 * depth,
                        order: order
                    )
                )
                order += 1
            }
        }
        return dots
    }
}
