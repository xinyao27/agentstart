import Foundation

struct LoaderLegacyMorphShape {
    let x: [Double]
    let y: [Double]
}

struct LoaderLegacyMorphData {
    static let sampleCount = 160
    let shapes: [LoaderLegacyMorphShape]
    let dotCount: Int

    init(options: LoaderLegacyOptions) {
        let circle = (0..<Self.sampleCount).map { index -> (Double, Double) in
            let angle = -.pi / 2 + Double(index) / Double(Self.sampleCount) * .pi * 2
            return (cos(angle) * 0.24, sin(angle) * 0.24)
        }
        let triangle = Self.samplePolygon(
            vertices: [(0, -0.26), (0.24, 0.16), (-0.24, 0.16)]
        )
        let square = Self.samplePolygon(
            vertices: [(0, -0.2), (0.2, -0.2), (0.2, 0.2), (-0.2, 0.2), (-0.2, -0.2)]
        )
        shapes = [circle, triangle, square].map {
            LoaderLegacyMorphShape(x: $0.map(\.0), y: $0.map(\.1))
        }
        dotCount = max(6, Int((34 * options.iconDensity).rounded()))
    }

    private static func samplePolygon(
        vertices: [(Double, Double)]
    ) -> [(Double, Double)] {
        let lengths = vertices.indices.map { index in
            let current = vertices[index]
            let next = vertices[(index + 1) % vertices.count]
            return hypot(next.0 - current.0, next.1 - current.1)
        }
        let total = lengths.reduce(0, +)
        return (0..<sampleCount).map { sampleIndex in
            var target = Double(sampleIndex) / Double(sampleCount) * total
            var edgeIndex = 0
            while edgeIndex < vertices.count - 1, target > lengths[edgeIndex] {
                target -= lengths[edgeIndex]
                edgeIndex += 1
            }
            let current = vertices[edgeIndex]
            let next = vertices[(edgeIndex + 1) % vertices.count]
            let fraction =
                lengths[edgeIndex] == 0
                ? 0 : min(1, target / lengths[edgeIndex])
            return (
                current.0 + (next.0 - current.0) * fraction,
                current.1 + (next.1 - current.1) * fraction
            )
        }
    }
}

extension LoaderLegacyRenderer {
    func drawLegacyMorph(time: Double, data: LoaderLegacyMorphData) -> [LoaderDot] {
        let hold = 1.4
        let morph = 0.9
        let segment = hold + morph
        let cycleTime = time.truncatingRemainder(dividingBy: segment * Double(data.shapes.count))
        let shapeIndex = Int(floor(cycleTime / segment))
        let localTime = cycleTime - Double(shapeIndex) * segment
        let rawProgress = localTime > hold ? (localTime - hold) / morph : 0
        let progress = rawProgress * rawProgress * (3 - 2 * rawProgress)
        let current = data.shapes[shapeIndex]
        let next = data.shapes[(shapeIndex + 1) % data.shapes.count]
        var x = Array(repeating: 0.0, count: LoaderLegacyMorphData.sampleCount)
        var y = Array(repeating: 0.0, count: LoaderLegacyMorphData.sampleCount)
        for index in 0..<LoaderLegacyMorphData.sampleCount {
            x[index] =
                (current.x[index] + (next.x[index] - current.x[index]) * progress)
                * options.spread
            y[index] =
                (current.y[index] + (next.y[index] - current.y[index]) * progress)
                * options.spread
        }
        var lengths = Array(repeating: 0.0, count: LoaderLegacyMorphData.sampleCount)
        var total = 0.0
        for index in 0..<LoaderLegacyMorphData.sampleCount {
            let nextIndex = (index + 1) % LoaderLegacyMorphData.sampleCount
            let length = hypot(x[nextIndex] - x[index], y[nextIndex] - y[index])
            lengths[index] = length
            total += length
        }

        let effectiveRadius = options.dotRadius * 1.35 * options.spread
        let pulse = 1 + 0.02 * sin(localTime * 3.1)
        let center = size / 2
        var segmentIndex = 0
        var accumulated = 0.0
        return (0..<data.dotCount).map { dotIndex in
            let target = Double(dotIndex) / Double(data.dotCount) * total
            while segmentIndex < LoaderLegacyMorphData.sampleCount - 1,
                accumulated + lengths[segmentIndex] < target
            {
                accumulated += lengths[segmentIndex]
                segmentIndex += 1
            }
            let nextIndex = (segmentIndex + 1) % LoaderLegacyMorphData.sampleCount
            let fraction =
                lengths[segmentIndex] == 0
                ? 0 : min(1, (target - accumulated) / lengths[segmentIndex])
            let pointX = (x[segmentIndex] + (x[nextIndex] - x[segmentIndex]) * fraction) * pulse
            let pointY = (y[segmentIndex] + (y[nextIndex] - y[segmentIndex]) * fraction) * pulse
            return LoaderDot(
                x: center + pointX * size,
                y: center + pointY * size,
                z: 0,
                radius: max(0.35, effectiveRadius * size),
                white: 0.1,
                opacity: 1,
                order: dotIndex
            )
        }
    }
}
