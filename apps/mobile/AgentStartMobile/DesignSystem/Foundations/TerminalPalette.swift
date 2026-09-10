import UIKit

struct TerminalVisualPalette {
    let foreground: UIColor
    let background: UIColor
    let selectionForeground: UIColor
    let selectionBackground: UIColor
    let ansiColors: [UIColor]
}

extension Theme {
    enum Terminal {
        static func palette(for style: UIUserInterfaceStyle) -> TerminalVisualPalette {
            style == .dark ? darkPalette : lightPalette
        }

        private static let lightPalette = TerminalVisualPalette(
            foreground: color(0x141414),
            background: color(0xF8F8F8),
            selectionForeground: color(0x141414),
            selectionBackground: color(0xD8D8D8),
            ansiColors: [
                color(0x2E3436),
                color(0xCC0000),
                color(0x4E9A06),
                color(0x8E7700),
                color(0x3465A4),
                color(0x75507B),
                color(0x05727E),
                color(0x6A6A6A),
                color(0x555753),
                color(0xEF2929),
                color(0x1B7A1B),
                color(0x6D5A00),
                color(0x204A87),
                color(0xAD7FA8),
                color(0x034B50),
                color(0x3D3D3D),
            ]
        )

        private static let darkPalette = TerminalVisualPalette(
            foreground: color(0xF0F0F0),
            background: color(0x141414),
            selectionForeground: color(0xF0F0F0),
            selectionBackground: color(0x333333),
            ansiColors: [
                color(0x1D1F21),
                color(0xCC6666),
                color(0xB5BD68),
                color(0xF0C674),
                color(0x81A2BE),
                color(0xB294BB),
                color(0x8ABEB7),
                color(0xC5C8C6),
                color(0x666666),
                color(0xD54E53),
                color(0xB9CA4A),
                color(0xE7C547),
                color(0x7AA6DA),
                color(0xC397D8),
                color(0x70C0B1),
                color(0xEAEAEA),
            ]
        )

        private static func color(_ rgb: UInt32) -> UIColor {
            UIColor(
                red: CGFloat((rgb >> 16) & 0xFF) / 255,
                green: CGFloat((rgb >> 8) & 0xFF) / 255,
                blue: CGFloat(rgb & 0xFF) / 255,
                alpha: 1
            )
        }
    }
}
