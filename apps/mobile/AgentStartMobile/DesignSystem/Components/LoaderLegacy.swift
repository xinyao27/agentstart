import SwiftUI

// Why: LoaderLegacy* is a native port of expo-thinking-orbs 0.1.0 — an upstream React
// Native package. Its MIT notice must
// remain with this substantial port.
//
// Copyright (c) 2026 Jakub Antalik (original thinking-orbs)
// Copyright (c) 2026 Mehdi Davoodi (React Native port)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
enum LoaderLegacyMode {
    case orbits
    case globe
    case rubik
    case wave
    case ribbon
    case morph
}

struct LoaderLegacyOptions {
    let mode: LoaderLegacyMode
    var speed: Double
    var latitudeRings = 0
    var longitudeDensity = 0
    var radiusBase = 0.0
    var radiusDepth = 0.0
    var radiusBoost = 0.0
    var radiusActive = 0.0
    var inkFar = 0.0
    var inkSpan = 0.0
    var radiusPower = 0.6
    var minimumRadius = 0.3
    var scanMultiplier = 1.0
    var dimBase = 1.0
    var moveCount = 0
    var rings = 0
    var orbitCount = 0
    var ghostCount = 0
    var ghostRadius = 0.0
    var ghostAlpha = 0.0
    var particleCount = 0
    var particleRadius = 0.0
    var particleRadiusDepth = 0.0
    var lanes = 0
    var segments = 0
    var spin = 1.0
    var bandMultiplier = 1.0
    var wobbleMultiplier = 1.0
    var dotRadius = 0.0
    var iconDensity = 0.0
    var spread = 1.0

    static func resolved(style: AppLoaderStyle, size: Double) -> LoaderLegacyOptions {
        let isLargeDesign = size >= 36
        let preset: (count: Double, radius: Double, speed: Double)
        var options: LoaderLegacyOptions
        switch style {
        case .working:
            preset = isLargeDesign ? (1, 1, 1.885) : (0.238, 2.4, 3.9)
            options = LoaderLegacyOptions(
                mode: .orbits,
                speed: preset.speed,
                orbitCount: 12,
                ghostCount: 40,
                ghostRadius: 0.9,
                ghostAlpha: 0.5,
                particleCount: 3,
                particleRadius: 1.2,
                particleRadiusDepth: 1.6
            )
        case .searching:
            preset = isLargeDesign ? (0.42, 1.15, 2.015) : (0.105, 1.75, 2.665)
            options = LoaderLegacyOptions(
                mode: .globe,
                speed: preset.speed,
                latitudeRings: 17,
                longitudeDensity: 44,
                radiusBase: 0.6,
                radiusDepth: 1.7,
                radiusBoost: 1,
                inkFar: 0.62,
                inkSpan: 0.54,
                scanMultiplier: isLargeDesign ? 4.08 : 4.335,
                dimBase: 0.45
            )
        case .solving:
            preset = isLargeDesign ? (0.35, 1.05, 1.82) : (0.088, 1.9, 1.95)
            options = LoaderLegacyOptions(
                mode: .rubik,
                speed: preset.speed,
                latitudeRings: 15,
                longitudeDensity: 40,
                radiusBase: 0.6,
                radiusDepth: 1.7,
                radiusActive: 0.3,
                inkFar: 0.62,
                inkSpan: 0.54,
                moveCount: 14
            )
        case .listening:
            preset = isLargeDesign ? (0.341, 1, 4.388) : (0.105, 1.6, 3.998)
            options = LoaderLegacyOptions(
                mode: .wave,
                speed: preset.speed,
                longitudeDensity: 40,
                radiusBase: 0.6,
                radiusDepth: 1.7,
                rings: 15
            )
        case .composing:
            preset = isLargeDesign ? (0.25, 0.85, 2.34) : (0.051, 1.073, 3.12)
            options = LoaderLegacyOptions(
                mode: .ribbon,
                speed: preset.speed,
                radiusBase: 1.1,
                radiusDepth: 1.7,
                ghostCount: 150,
                lanes: 5,
                segments: 88,
                spin: 0,
                bandMultiplier: isLargeDesign ? 3.9 : 4.94,
                wobbleMultiplier: 1
            )
        case .shaping:
            preset = isLargeDesign ? (0.54, 0.395, 2.405) : (0.53, 1.011, 2.08)
            options = LoaderLegacyOptions(
                mode: .morph,
                speed: preset.speed,
                minimumRadius: 0.25,
                dotRadius: 0.021,
                iconDensity: 1,
                spread: 1.45
            )
        case .s1, .s2, .s3, .s4, .s5, .b1, .b2, .b3, .b4, .b5, .c1, .c2,
            .c3, .c4, .c5, .m1, .m2, .m3, .m4, .m5:
            preconditionFailure("AICSS style passed to the legacy loader renderer")
        }
        options.scaleCounts(preset.count)
        options.scaleRadii(preset.radius)
        return options
    }

    private mutating func scaleCounts(_ scale: Double) {
        let squareRoot = sqrt(scale)
        switch mode {
        case .globe, .rubik:
            latitudeRings = max(2, Int((Double(latitudeRings) * squareRoot).rounded()))
            longitudeDensity = max(
                2,
                Int((Double(longitudeDensity) * squareRoot).rounded())
            )
        case .wave:
            rings = max(2, Int((Double(rings) * squareRoot).rounded()))
            longitudeDensity = max(
                2,
                Int((Double(longitudeDensity) * squareRoot).rounded())
            )
        case .ribbon:
            lanes = max(2, Int((Double(lanes) * squareRoot).rounded()))
            segments = max(2, Int((Double(segments) * squareRoot).rounded()))
            ghostCount = max(1, Int((Double(ghostCount) * scale).rounded()))
        case .orbits:
            orbitCount = max(1, Int((Double(orbitCount) * scale).rounded()))
            ghostCount = max(1, Int((Double(ghostCount) * scale).rounded()))
        case .morph:
            iconDensity = max(0.02, iconDensity * scale)
        }
    }

    private mutating func scaleRadii(_ scale: Double) {
        radiusBase *= scale
        radiusDepth *= scale
        radiusActive *= scale
        dotRadius *= scale
        ghostRadius *= scale
        particleRadius *= scale
        particleRadiusDepth *= scale
    }
}

enum LoaderLegacyData {
    case orbits(LoaderLegacyOrbitsData)
    case globe(LoaderLegacyLatticeData)
    case rubik(LoaderLegacyRubikData)
    case wave(LoaderLegacyWaveData)
    case ribbon(LoaderLegacyRibbonData)
    case morph(LoaderLegacyMorphData)
}

struct LoaderLegacyRenderer {
    let size: Double
    let options: LoaderLegacyOptions
    let data: LoaderLegacyData

    init(style: AppLoaderStyle, size: Double) {
        self.size = size
        let options = LoaderLegacyOptions.resolved(style: style, size: size)
        self.options = options
        switch options.mode {
        case .orbits:
            data = .orbits(LoaderLegacyOrbitsData(options: options))
        case .globe:
            data = .globe(LoaderLegacyLatticeData(options: options))
        case .rubik:
            data = .rubik(LoaderLegacyRubikData(options: options))
        case .wave:
            data = .wave(LoaderLegacyWaveData(options: options))
        case .ribbon:
            data = .ribbon(LoaderLegacyRibbonData(options: options))
        case .morph:
            data = .morph(LoaderLegacyMorphData(options: options))
        }
    }

    func draw(
        context: inout GraphicsContext,
        time: TimeInterval,
        palette: LoaderPalette,
        reducesMotion: Bool
    ) {
        let resolvedTime = reducesMotion ? 0.6 : time * options.speed
        let dots: [LoaderDot]
        switch data {
        case .orbits(let data):
            dots = drawOrbits(time: resolvedTime, data: data)
        case .globe(let data):
            dots = drawGlobe(time: resolvedTime, data: data)
        case .rubik(let data):
            dots = drawRubik(time: resolvedTime, data: data)
        case .wave(let data):
            dots = drawWave(time: resolvedTime, data: data)
        case .ribbon(let data):
            dots = drawRibbon(time: resolvedTime, data: data)
        case .morph(let data):
            dots = drawLegacyMorph(time: resolvedTime, data: data)
        }
        loaderDrawDots(
            context: &context,
            dots: dots,
            palette: palette,
            minimumRadius: options.minimumRadius
        )
    }
}
