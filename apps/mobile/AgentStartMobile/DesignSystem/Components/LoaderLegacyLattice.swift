import Foundation

struct LoaderLegacyLatticePoint {
    let x: Double
    let y: Double
    let z: Double
    let longitude: Double
}

struct LoaderLegacyLatticeData {
    let points: [LoaderLegacyLatticePoint]

    init(options: LoaderLegacyOptions) {
        var points: [LoaderLegacyLatticePoint] = []
        for latitudeIndex in 0...options.latitudeRings {
            let latitude =
                -.pi / 2
                + Double(latitudeIndex) / Double(options.latitudeRings) * .pi
            let cosLatitude = cos(latitude)
            let sinLatitude = sin(latitude)
            let longitudeCount = max(
                1,
                Int((abs(cosLatitude) * Double(options.longitudeDensity)).rounded())
            )
            for longitudeIndex in 0..<longitudeCount {
                let longitude = Double(longitudeIndex) / Double(longitudeCount) * .pi * 2
                points.append(
                    LoaderLegacyLatticePoint(
                        x: cosLatitude * cos(longitude),
                        y: sinLatitude,
                        z: cosLatitude * sin(longitude),
                        longitude: longitude
                    )
                )
            }
        }
        self.points = points
    }
}

struct LoaderLegacyMove {
    let axis: Int
    let lowerBound: Double
    let upperBound: Double
    let angle: Double
}

struct LoaderLegacyRubikData {
    let lattice: LoaderLegacyLatticeData
    let moves: [LoaderLegacyMove]

    init(options: LoaderLegacyOptions) {
        lattice = LoaderLegacyLatticeData(options: options)
        moves = (0..<options.moveCount).map { index in
            let axis = min(2, Int(floor(loaderHash(Double(index), 2.3) * 3)))
            let lowerBound =
                -1
                + 0.5 * Double(min(3, Int(floor(loaderHash(Double(index), 5.9) * 4))))
            let direction = loaderHash(Double(index), 7.7) < 0.5 ? 1.0 : -1.0
            return LoaderLegacyMove(
                axis: axis,
                lowerBound: lowerBound,
                upperBound: lowerBound + 0.5,
                angle: direction * .pi / 2
            )
        }
    }
}

struct LoaderLegacyWaveRing {
    let sinLatitude: Double
    let cosLatitude: Double
    let cosLongitudes: [Double]
    let sinLongitudes: [Double]
}

struct LoaderLegacyWaveData {
    let rings: [LoaderLegacyWaveRing]

    init(options: LoaderLegacyOptions) {
        rings = (0...options.rings).map { ringIndex in
            let latitude = -.pi / 2 + Double(ringIndex) / Double(options.rings) * .pi
            let cosLatitude = cos(latitude)
            let longitudeCount = max(
                1,
                Int((abs(cosLatitude) * Double(options.longitudeDensity)).rounded())
            )
            let longitudes = (0..<longitudeCount).map {
                Double($0) / Double(longitudeCount) * .pi * 2
            }
            return LoaderLegacyWaveRing(
                sinLatitude: sin(latitude),
                cosLatitude: cosLatitude,
                cosLongitudes: longitudes.map(cos),
                sinLongitudes: longitudes.map(sin)
            )
        }
    }
}

extension LoaderLegacyRenderer {
    func drawGlobe(time: Double, data: LoaderLegacyLatticeData) -> [LoaderDot] {
        let center = size / 2
        let radius = center * 0.82
        let tilt = 0.4 + 0.06 * sin(time * 0.35)
        let spin = 0.5
        let scan = time * (spin + (1.7 - spin) * options.scanMultiplier)
        let radiusScale = loaderRadiusScale(size: size, power: options.radiusPower)
        return data.points.enumerated().map { index, point in
            let projected = loaderProject(
                x: point.x,
                y: point.y,
                z: point.z,
                yaw: time * spin,
                tilt: tilt,
                centerX: center,
                centerY: center,
                scale: radius
            )
            let depth = (projected.z + 1) / 2
            let delta = atan2(
                sin(point.longitude + time * spin - scan),
                cos(point.longitude + time * spin - scan)
            )
            let boost = exp(-(delta * delta) / 0.18) * max(0, projected.z)
            return LoaderDot(
                x: projected.x,
                y: projected.y,
                z: projected.z,
                radius: (options.radiusBase + options.radiusDepth * depth
                    + options.radiusBoost * boost) * radiusScale,
                white: options.inkFar - options.inkSpan * depth,
                opacity: options.dimBase + (1 - options.dimBase) * min(1, boost),
                order: index
            )
        }
    }

    func drawRubik(time: Double, data: LoaderLegacyRubikData) -> [LoaderDot] {
        let center = size / 2
        let radius = center * 0.82
        let tilt = 0.35 + 0.1 * sin(time * 0.9)
        let radiusScale = loaderRadiusScale(size: size, power: options.radiusPower)
        let solve = legacySolveCycle(time: time, count: data.moves.count)
        return data.lattice.points.enumerated().map { index, point in
            let moved = legacyApplyMoves(point: point, moves: data.moves, solve: solve)
            let projected = loaderProject(
                x: moved.point.x,
                y: moved.point.y,
                z: moved.point.z,
                yaw: time * 0.55,
                tilt: tilt,
                centerX: center,
                centerY: center,
                scale: radius
            )
            let depth = (projected.z + 1) / 2
            return LoaderDot(
                x: projected.x,
                y: projected.y,
                z: projected.z,
                radius: (options.radiusBase + options.radiusDepth * depth
                    + (moved.isActive ? options.radiusActive : 0)) * radiusScale,
                white: options.inkFar - options.inkSpan * depth
                    - (moved.isActive ? 0.14 : 0),
                opacity: 1,
                order: index
            )
        }
    }

    func drawWave(time: Double, data: LoaderLegacyWaveData) -> [LoaderDot] {
        let center = size / 2
        let radius = center * 0.874
        let radiusScale = loaderRadiusScale(size: size, power: options.radiusPower)
        var dots: [LoaderDot] = []
        var order = 0
        for (ringIndex, ring) in data.rings.enumerated() {
            let wave =
                0.62 * sin(time * 2.1 - Double(ringIndex) * 0.52)
                + 0.38 * sin(time * 1.27 + Double(ringIndex) * 0.83)
            let ringRadius = radius * (0.88 + 0.105 * wave)
            let crest = max(0, wave)
            for longitudeIndex in ring.cosLongitudes.indices {
                let projected = loaderProject(
                    x: ring.cosLatitude * ring.cosLongitudes[longitudeIndex] * ringRadius,
                    y: ring.sinLatitude * ringRadius,
                    z: ring.cosLatitude * ring.sinLongitudes[longitudeIndex] * ringRadius,
                    yaw: time * 0.18,
                    tilt: 0.38,
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
                            * (1 + 0.4 * crest) * radiusScale,
                        white: 0.66 - 0.56 * depth - 0.1 * crest,
                        opacity: 1,
                        order: order
                    )
                )
                order += 1
            }
        }
        return dots
    }

    private func legacySolveCycle(time: Double, count: Int) -> (
        amounts: [Double], active: Int
    ) {
        let slotDuration = 0.42
        let cycle = 2 * Double(count) * slotDuration + 1.2
        let cycleTime = time.truncatingRemainder(dividingBy: cycle)
        var amounts = Array(repeating: 0.0, count: count)
        var active = -1
        if cycleTime < 2 * Double(count) * slotDuration {
            let slot = Int(floor(cycleTime / slotDuration))
            let progress = (cycleTime - Double(slot) * slotDuration) / slotDuration
            let clamped = min(1, progress / 0.7)
            let eased = 1 - pow(1 - clamped, 3)
            if slot < count {
                for index in 0..<slot { amounts[index] = 1 }
                amounts[slot] = eased
                active = slot
            } else {
                let reverse = 2 * count - 1 - slot
                if reverse > 0 {
                    for index in 0..<reverse { amounts[index] = 1 }
                }
                amounts[reverse] = 1 - eased
                active = reverse
            }
        }
        return (amounts, active)
    }

    private func legacyApplyMoves(
        point: LoaderLegacyLatticePoint,
        moves: [LoaderLegacyMove],
        solve: (amounts: [Double], active: Int)
    ) -> (point: LoaderPoint3, isActive: Bool) {
        var x = point.x
        var y = point.y
        var z = point.z
        var isActive = false
        for index in moves.indices where solve.amounts[index] > 0 {
            let move = moves[index]
            let coordinate = move.axis == 0 ? x : (move.axis == 1 ? y : z)
            guard coordinate >= move.lowerBound, coordinate < move.upperBound else { continue }
            if index == solve.active { isActive = true }
            let angle = move.angle * solve.amounts[index]
            let cosine = cos(angle)
            let sine = sin(angle)
            if move.axis == 0 {
                let nextY = y * cosine - z * sine
                z = y * sine + z * cosine
                y = nextY
            } else if move.axis == 1 {
                let nextX = x * cosine + z * sine
                z = -x * sine + z * cosine
                x = nextX
            } else {
                let nextX = x * cosine - y * sine
                y = x * sine + y * cosine
                x = nextX
            }
        }
        return (LoaderPoint3(x: x, y: y, z: z), isActive)
    }
}
