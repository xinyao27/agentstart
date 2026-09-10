import SwiftUI
import UIKit

struct LoaderPoint3 {
    let x: Double
    let y: Double
    let z: Double
}

struct LoaderDot {
    let x: Double
    let y: Double
    let z: Double
    let radius: Double
    let white: Double
    let opacity: Double
    let order: Int
}

struct LoaderPalette {
    private let red: Double
    private let green: Double
    private let blue: Double
    private let alpha: Double
    private let extreme: Double

    init(color: Color, colorScheme: ColorScheme) {
        let traits = UITraitCollection(
            userInterfaceStyle: colorScheme == .dark ? .dark : .light
        )
        let resolved = UIColor(color).resolvedColor(with: traits)
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 1
        resolved.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        self.red = Double(red)
        self.green = Double(green)
        self.blue = Double(blue)
        self.alpha = Double(alpha)
        extreme = colorScheme == .dark ? 0 : 1
    }

    func color(white: Double, opacity: Double) -> Color {
        let amount = loaderClamp(white)
        return Color(
            red: red + (extreme - red) * amount,
            green: green + (extreme - green) * amount,
            blue: blue + (extreme - blue) * amount,
            opacity: alpha * loaderClamp(opacity)
        )
    }
}

func loaderClamp(_ value: Double, lower: Double = 0, upper: Double = 1) -> Double {
    min(upper, max(lower, value))
}

func loaderCycle(_ value: Double, offset: Double = 0) -> Double {
    let phase = value + offset
    return phase - floor(phase)
}

func loaderInterpolate(_ value: Double, input: [Double], output: [Double]) -> Double {
    guard input.count == output.count, let first = input.first, let last = input.last,
        let firstOutput = output.first, let lastOutput = output.last
    else { return 0 }
    if value <= first { return firstOutput }
    if value >= last { return lastOutput }
    for index in 0..<(input.count - 1) where value <= input[index + 1] {
        let span = input[index + 1] - input[index]
        let progress = span == 0 ? 0 : (value - input[index]) / span
        return output[index] + (output[index + 1] - output[index]) * progress
    }
    return lastOutput
}

func loaderProject(
    x: Double,
    y: Double,
    z: Double,
    yaw: Double,
    tilt: Double,
    centerX: Double,
    centerY: Double,
    scale: Double
) -> LoaderPoint3 {
    let sinTilt = sin(tilt)
    let cosTilt = cos(tilt)
    let sinYaw = sin(yaw)
    let cosYaw = cos(yaw)
    let x1 = x * cosYaw + z * sinYaw
    let z1 = -x * sinYaw + z * cosYaw
    let y1 = y * cosTilt - z1 * sinTilt
    let z2 = y * sinTilt + z1 * cosTilt
    return LoaderPoint3(
        x: centerX + x1 * scale,
        y: centerY - y1 * scale,
        z: z2
    )
}

func loaderHash(_ first: Double, _ second: Double) -> Double {
    let value = sin(first * 12.9898 + second * 78.233) * 43_758.5453
    return value - floor(value)
}

func loaderRadiusScale(size: Double, power: Double) -> Double {
    pow(size / 300, power)
}

func loaderDrawDot(
    context: inout GraphicsContext,
    x: Double,
    y: Double,
    radius: Double,
    color: Color,
    opacity: Double = 1
) {
    guard radius > 0, opacity >= 0.02 else { return }
    let rect = CGRect(
        x: x - radius,
        y: y - radius,
        width: radius * 2,
        height: radius * 2
    )
    context.fill(Path(ellipseIn: rect), with: .color(color.opacity(loaderClamp(opacity))))
}

func loaderDrawDots(
    context: inout GraphicsContext,
    dots: [LoaderDot],
    palette: LoaderPalette,
    minimumRadius: Double
) {
    let ordered = dots.sorted {
        $0.z == $1.z ? $0.order < $1.order : $0.z < $1.z
    }
    for dot in ordered where dot.opacity >= 0.02 {
        loaderDrawDot(
            context: &context,
            x: dot.x,
            y: dot.y,
            radius: max(minimumRadius, dot.radius),
            color: palette.color(white: dot.white, opacity: dot.opacity)
        )
    }
}
