import SwiftUI

struct LoaderAICSSRenderer {
    let style: AppLoaderStyle
    let size: Double

    func draw(
        context: inout GraphicsContext,
        time: TimeInterval,
        color: Color,
        reducesMotion: Bool
    ) {
        switch style {
        case .s1, .s2, .s3, .s4, .s5:
            drawLattice(
                context: &context,
                time: time,
                color: color,
                reducesMotion: reducesMotion
            )
        case .b1, .b2, .b3, .b4, .b5:
            drawLens(
                context: &context,
                time: time,
                color: color,
                reducesMotion: reducesMotion
            )
        case .c1, .c2, .c3, .c4, .c5:
            drawRing(
                context: &context,
                time: time,
                color: color,
                reducesMotion: reducesMotion
            )
        case .m1, .m2, .m3, .m4, .m5:
            drawMorph(
                context: &context,
                time: time,
                color: color,
                reducesMotion: reducesMotion
            )
        case .working, .searching, .solving, .listening, .composing, .shaping:
            break
        }
    }

    private func drawLattice(
        context: inout GraphicsContext,
        time: TimeInterval,
        color: Color,
        reducesMotion: Bool
    ) {
        let scale = size / 28
        let baseDiameter = 3 * scale
        let progress = loaderCycle(time * 1_000 / latticeDuration)
        for y in 0..<3 {
            for x in 0..<3 {
                let cell = latticeCell(x: x, y: y)
                let opacity: Double
                let dotScale: Double
                if reducesMotion {
                    opacity = cell.isStill ? 0.1 : (cell.isMiddle ? 1 : 0.2)
                    dotScale = 1
                } else if cell.isStill {
                    opacity = 0.1
                    dotScale = 1
                } else {
                    let phase = loaderCycle(progress, offset: -cell.delay / latticeDuration)
                    if phase <= 0.28 {
                        opacity = loaderInterpolate(phase, input: [0, 0.28], output: [0.2, 1])
                        dotScale = loaderInterpolate(
                            phase,
                            input: [0, 0.28],
                            output: [1, 1.18]
                        )
                    } else if phase <= 0.56 {
                        opacity = loaderInterpolate(
                            phase,
                            input: [0.28, 0.56],
                            output: [1, 0.2]
                        )
                        dotScale = loaderInterpolate(
                            phase,
                            input: [0.28, 0.56],
                            output: [1.18, 1]
                        )
                    } else {
                        opacity = 0.2
                        dotScale = 1
                    }
                }
                loaderDrawDot(
                    context: &context,
                    x: Double(8 + x * 6) * scale,
                    y: Double(8 + y * 6) * scale,
                    radius: baseDiameter * dotScale / 2,
                    color: color,
                    opacity: opacity
                )
            }
        }
    }

    private func latticeCell(x: Int, y: Int) -> (
        delay: Double, isStill: Bool, isMiddle: Bool
    ) {
        let ring = [(0, 0), (1, 0), (2, 0), (2, 1), (2, 2), (1, 2), (0, 2), (0, 1)]
        let ringIndex = ring.firstIndex { $0 == (x, y) }
        let isMiddle = x == 1 && y == 1
        let delay: Double
        switch style {
        case .s1:
            delay = hypot(Double(x - 1), Double(y - 1)) * 700 - (isMiddle ? 180 : 0)
        case .s2:
            delay = Double(x + y) / 4 * 1_500
        case .s3:
            delay = ringIndex.map { -Double((8 - $0) % 8) / 8 * 1_700 } ?? 0
        case .s4:
            delay = Double(x) / 2 * 1_100
        case .s5:
            delay = ringIndex.map { -Double(($0 * 3) % 8) / 8 * 1_700 } ?? 0
        default:
            delay = 0
        }
        return (
            delay: delay,
            isStill: (style == .s3 || style == .s5) && ringIndex == nil,
            isMiddle: isMiddle
        )
    }

    private var latticeDuration: Double {
        style == .s4 ? 1_600 : 1_700
    }

    private func drawLens(
        context: inout GraphicsContext,
        time: TimeInterval,
        color: Color,
        reducesMotion: Bool
    ) {
        let scale = size / 28
        let count = style == .b1 ? 4 : (style == .b4 ? 2 : 3)
        let diameter = (style == .b1 ? 6 : 7) * scale
        let progress = loaderCycle(time * 1_000 / lensDuration)
        for index in 0..<count {
            var opacity = 1.0
            var dotScale = 1.0
            var translateX = 0.0
            var translateY = 0.0
            if reducesMotion {
                opacity = index == 0 ? 1 : 0.3
            } else {
                let phase = loaderCycle(progress, offset: lensPhaseOffset(index: index))
                switch style {
                case .b1:
                    let input = [0.0, 0.12, 0.22, 0.38, 0.58, 0.82, 1]
                    opacity = loaderInterpolate(
                        phase,
                        input: input,
                        output: [0.05, 1, 1, 0.3, 0.1, 0.05, 0.05]
                    )
                    dotScale = loaderInterpolate(
                        phase,
                        input: input,
                        output: [1.12, 1, 1, 1.06, 1.1, 1.12, 1.12]
                    )
                    translateX = [-4.5, 4.5, 4.5, -4.5][index]
                    translateY = [-4.5, -4.5, 4.5, 4.5][index]
                case .b2:
                    let angle = phase * .pi * 2
                    opacity = loaderInterpolate(
                        phase,
                        input: [0, 0.25, 0.5, 0.75, 1],
                        output: [1, 0.55, 0.28, 0.55, 1]
                    )
                    dotScale = loaderInterpolate(
                        phase,
                        input: [0, 0.25, 0.5, 0.75, 1],
                        output: [1, 0.82, 0.66, 0.82, 1]
                    )
                    translateX = sin(angle) * 6.5
                    translateY = cos(angle) * 6.5
                case .b3:
                    let input = [0.0, 0.08, 0.24, 0.42, 0.62, 1]
                    opacity = loaderInterpolate(
                        phase,
                        input: input,
                        output: [0, 1, 1, 0.1, 0, 0]
                    )
                    dotScale = loaderInterpolate(
                        phase,
                        input: input,
                        output: [0.35, 0.55, 0.72, 1.5, 2.4, 2.4]
                    )
                case .b4:
                    if index == 0 {
                        let input = [0.0, 0.1, 0.22, 0.33, 0.43, 0.55, 0.66, 0.77, 0.88, 1]
                        translateX = loaderInterpolate(
                            phase,
                            input: input,
                            output: [0, 0, 2.15, 4.3, 4.3, 0, -4.3, -4.3, -2.15, 0]
                        )
                        translateY = loaderInterpolate(
                            phase,
                            input: input,
                            output: [-5, -5, -1.25, 2.5, 2.5, 2.5, 2.5, 2.5, -1.25, -5]
                        )
                        dotScale = loaderInterpolate(
                            phase,
                            input: input,
                            output: [1, 1, 0.72, 1, 1, 0.72, 1, 1, 0.72, 1]
                        )
                    } else {
                        opacity = loaderInterpolate(
                            phase,
                            input: [0, 0.5, 1],
                            output: [0.16, 0.32, 0.16]
                        )
                        dotScale = loaderInterpolate(
                            phase,
                            input: [0, 0.5, 1],
                            output: [1.2, 0.98, 1.2]
                        )
                    }
                case .b5:
                    if index == 1 {
                        let breathePhase = loaderCycle(progress * (2_800 / 3_600))
                        opacity = loaderInterpolate(
                            breathePhase,
                            input: [0, 0.5, 1],
                            output: [0.16, 0.32, 0.16]
                        )
                        dotScale = loaderInterpolate(
                            breathePhase,
                            input: [0, 0.5, 1],
                            output: [1.2, 0.98, 1.2]
                        )
                    } else {
                        let input = [0.0, 0.22, 0.37, 0.52, 0.7, 1]
                        translateX = loaderInterpolate(
                            phase,
                            input: input,
                            output: [-11, -1, 0, 1, 11, 11]
                        )
                        opacity = loaderInterpolate(
                            phase,
                            input: input,
                            output: [0, 1, 1, 1, 0, 0]
                        )
                        dotScale = loaderInterpolate(
                            phase,
                            input: input,
                            output: [0.55, 1, 1, 1, 0.55, 0.55]
                        )
                    }
                default:
                    break
                }
            }
            loaderDrawDot(
                context: &context,
                x: size / 2 + translateX * scale,
                y: size / 2 + translateY * scale,
                radius: diameter * dotScale / 2,
                color: color,
                opacity: opacity
            )
        }
    }

    private var lensDuration: Double {
        switch style {
        case .b1: 4_000
        case .b2: 3_300
        case .b3: 4_200
        case .b4: 3_600
        case .b5: 2_800
        default: 1_000
        }
    }

    private func lensPhaseOffset(index: Int) -> Double {
        switch style {
        case .b1: [0, 0.75, 0.5, 0.25][index]
        case .b2, .b3: Double(index) / 3
        case .b4: 0
        case .b5: index == 2 ? 0.5 : 0
        default: 0
        }
    }

    private func drawRing(
        context: inout GraphicsContext,
        time: TimeInterval,
        color: Color,
        reducesMotion: Bool
    ) {
        let scale = size / 28
        let radius = 8.0 * scale
        let dotRadius = 1.5 * scale
        let progress = loaderCycle(time * 1_000 / ringAnimationDuration)
        for index in 0..<8 {
            var opacity = 0.7
            var dotScale = 1.0
            var translateX = 0.0
            var translateY = 0.0
            if !reducesMotion {
                let angle = Double(index) / 8 * .pi * 2 - .pi / 2
                translateX = cos(angle) * radius
                translateY = sin(angle) * radius
                let phase = loaderCycle(
                    progress,
                    offset: -ringDelay(index: index) / ringAnimationDuration
                )
                switch style {
                case .c1:
                    opacity = phase <= 0.12 ? 1 : 0.3
                case .c2:
                    opacity = loaderInterpolate(
                        phase,
                        input: [0, 0.5, 1],
                        output: [0.18, 1, 0.18]
                    )
                    dotScale = loaderInterpolate(
                        phase,
                        input: [0, 0.5, 1],
                        output: [0.7, 1.15, 0.7]
                    )
                case .c3, .c5:
                    opacity = loaderInterpolate(
                        phase,
                        input: [0, 0.12, 0.35, 0.6, 1],
                        output: [0.08, 1, 0.5, 0.12, 0.08]
                    )
                case .c4:
                    opacity = loaderInterpolate(
                        phase,
                        input: [0, 0.5, 1],
                        output: [1, 0.15, 1]
                    )
                default:
                    break
                }
            }
            loaderDrawDot(
                context: &context,
                x: size / 2 + translateX,
                y: size / 2 + translateY,
                radius: dotRadius * dotScale,
                color: color,
                opacity: opacity
            )
        }
    }

    private var ringDuration: Double {
        switch style {
        case .c1: 1_600
        case .c2: 2_000
        case .c3: 1_800
        case .c4: 1_600
        case .c5: 2_200
        default: 1_000
        }
    }

    private var ringAnimationDuration: Double {
        style == .c5 ? 1_800 : ringDuration
    }

    private func ringDelay(index: Int) -> Double {
        switch style {
        case .c1, .c2, .c3:
            -Double(7 - index) / 8 * ringDuration
        case .c4:
            index.isMultiple(of: 2) ? 0 : -(ringDuration / 2)
        case .c5:
            -Double((index * 3) % 8) / 8 * ringDuration
        default:
            0
        }
    }

    private func drawMorph(
        context: inout GraphicsContext,
        time: TimeInterval,
        color: Color,
        reducesMotion: Bool
    ) {
        let scale = size / 28
        let progress = loaderCycle(time * 1_000 / morphDuration)
        for index in 0..<8 {
            var point = (x: 0.0, y: 0.0)
            var opacity = 1.0
            if !reducesMotion {
                let dot = morphDot(index: index)
                let phase = loaderCycle(
                    progress * (style == .m2 || style == .m4 ? 2 : 1),
                    offset: style == .m5 ? Double(index) * 10 / morphDuration : 0
                )
                let points =
                    style == .m5
                    ? [dot.points[0], dot.points[0], dot.points[1], dot.points[1]]
                    : dot.points
                point = morphPoint(phase: phase, points: points)
                if style == .m5 {
                    opacity = loaderInterpolate(
                        phase,
                        input: [0, 0.12, 0.38, 0.62, 0.88, 1],
                        output: [
                            1,
                            1,
                            1 - 0.6 * dot.depth,
                            1 - 0.6 * dot.depth,
                            1,
                            1,
                        ]
                    )
                }
                if style == .m2 || style == .m4 {
                    let angle = progress * .pi * 2
                    point = (
                        point.x * cos(angle) - point.y * sin(angle),
                        point.x * sin(angle) + point.y * cos(angle)
                    )
                }
            }
            loaderDrawDot(
                context: &context,
                x: size / 2 + point.x * scale,
                y: size / 2 + point.y * scale,
                radius: 1.5 * scale,
                color: color,
                opacity: opacity
            )
        }
    }

    private var morphDuration: Double {
        switch style {
        case .m2, .m4: 9_600
        case .m5: 2_800
        default: 4_800
        }
    }

    private func morphDot(index: Int) -> (points: [(x: Double, y: Double)], depth: Double) {
        let first: (Double, Double)
        let second: (Double, Double)
        let third: (Double, Double)
        let fourth: (Double, Double)
        switch style {
        case .m1:
            first = morphCircle(index: index)
            second = morphSquare(index: index)
            third = morphDiamond(index: index)
            fourth = morphSquare(index: index)
        case .m2:
            first = morphCenter(index: index)
            second = morphCircle(index: index)
            third = morphCenter(index: index)
            fourth = morphCircle(index: index)
        case .m3:
            first = morphCircle(index: index)
            second = morphCircle(index: index, turn: .pi / 2)
            third = morphCircle(index: index, turn: .pi)
            fourth = morphCircle(index: index, turn: .pi * 1.5)
        case .m4:
            first = morphCircle(index: index)
            second = morphDiamond(index: index)
            third = morphCircle(index: index)
            fourth = morphDiamond(index: index)
        case .m5:
            first = morphCircle(index: index)
            second = morphScatter(index: index)
            third = morphCircle(index: index)
            fourth = morphScatter(index: index)
        default:
            first = (0, 0)
            second = (0, 0)
            third = (0, 0)
            fourth = (0, 0)
        }
        let angle = Double(index) / 8 * .pi * 2 - .pi / 2
        return (
            points: [first, second, third, fourth].map { (x: $0.0, y: $0.1) },
            depth: abs(cos(angle))
        )
    }

    private func morphCircle(index: Int, turn: Double = 0) -> (Double, Double) {
        let angle = Double(index) / 8 * .pi * 2 - .pi / 2 + turn
        return (cos(angle) * 7, sin(angle) * 7)
    }

    private func morphSquare(index: Int) -> (Double, Double) {
        let radius = 7 * 0.85
        let corners = [(-radius, -radius), (radius, -radius), (radius, radius), (-radius, radius)]
        let position = (Double(index) / 8 * 4 + 0.5).truncatingRemainder(dividingBy: 4)
        let side = Int(floor(position)) % 4
        let fraction = position - floor(position)
        let from = corners[side]
        let to = corners[(side + 1) % corners.count]
        return (
            from.0 + (to.0 - from.0) * fraction,
            from.1 + (to.1 - from.1) * fraction
        )
    }

    private func morphDiamond(index: Int) -> (Double, Double) {
        let corners = [(0.0, -7.0), (7, 0), (0, 7), (-7, 0)]
        let position = Double(index) / 8 * 4
        let side = Int(floor(position)) % 4
        let fraction = position - floor(position)
        let from = corners[side]
        let to = corners[(side + 1) % corners.count]
        return (
            from.0 + (to.0 - from.0) * fraction,
            from.1 + (to.1 - from.1) * fraction
        )
    }

    private func morphScatter(index: Int) -> (Double, Double) {
        let angle = Double(index) / 8 * .pi * 2 - .pi / 2
        return (-cos(angle) * 7, sin(angle) * 7)
    }

    private func morphCenter(index: Int) -> (Double, Double) {
        let angle = Double(index) / 8 * .pi * 2 - .pi / 2
        return (cos(angle) * 1.5, sin(angle) * 1.5)
    }

    private func morphPoint(
        phase: Double,
        points: [(x: Double, y: Double)]
    ) -> (x: Double, y: Double) {
        let input = [0.0, 0.05, 0.25, 0.3, 0.5, 0.55, 0.75, 0.8, 1]
        let order = [0, 0, 1, 1, 2, 2, 3, 3, 0]
        return (
            loaderInterpolate(phase, input: input, output: order.map { points[$0].x }),
            loaderInterpolate(phase, input: input, output: order.map { points[$0].y })
        )
    }
}
