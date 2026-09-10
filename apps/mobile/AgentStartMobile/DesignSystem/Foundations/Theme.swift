import SwiftUI
import UIKit

enum Theme {
    enum Colors {
        static let background = adaptive(
            light: UIColor(red: 248 / 255, green: 248 / 255, blue: 248 / 255, alpha: 1),
            dark: UIColor(red: 20 / 255, green: 20 / 255, blue: 20 / 255, alpha: 1)
        )
        static let foreground = adaptive(
            light: UIColor(red: 20 / 255, green: 20 / 255, blue: 20 / 255, alpha: 1),
            dark: UIColor(red: 240 / 255, green: 240 / 255, blue: 240 / 255, alpha: 1)
        )
        static let mutedForeground = adaptive(
            light: UIColor(red: 20 / 255, green: 20 / 255, blue: 20 / 255, alpha: 0.6),
            dark: UIColor(red: 240 / 255, green: 240 / 255, blue: 240 / 255, alpha: 0.6)
        )
        static let selection = adaptive(
            light: UIColor(red: 216 / 255, green: 216 / 255, blue: 216 / 255, alpha: 1),
            dark: UIColor(red: 51 / 255, green: 51 / 255, blue: 51 / 255, alpha: 1)
        )
        // Why: an 8% wash, deliberately separate from `selection`, which is the stronger
        // selected-state fill. Collapsing the two makes every inactive surface look selected.
        static let secondary = adaptive(
            light: UIColor(red: 20 / 255, green: 20 / 255, blue: 20 / 255, alpha: 0.08),
            dark: UIColor(red: 240 / 255, green: 240 / 255, blue: 240 / 255, alpha: 0.08)
        )
        // Why: the shortcut keycap needs #eaeaea on the light content surface. Keep it
        // separate from general secondary controls so tuning a keycap cannot alter selection
        // or button surfaces elsewhere.
        static let keycap = adaptive(
            light: UIColor(red: 234 / 255, green: 234 / 255, blue: 234 / 255, alpha: 1),
            dark: UIColor(red: 45 / 255, green: 45 / 255, blue: 45 / 255, alpha: 1)
        )
        // Why: Home's usage tracks read as background quantity, so they use the light
        // secondary surface rather than the stronger selection fill that marks active tabs
        // and selected controls.
        static let usageTrack = adaptive(
            light: UIColor(red: 216 / 255, green: 216 / 255, blue: 216 / 255, alpha: 1),
            dark: UIColor(red: 45 / 255, green: 45 / 255, blue: 45 / 255, alpha: 1)
        )
        // Why: intentionally quieter than the system separator, so rows read as grouped
        // without drawing a second border around every settings surface.
        static let divider = adaptive(
            light: UIColor(red: 20 / 255, green: 20 / 255, blue: 20 / 255, alpha: 0.08),
            dark: UIColor(red: 240 / 255, green: 240 / 255, blue: 240 / 255, alpha: 0.08)
        )
        // Why: Home's four metric tiles carry their own semantic colors, intentionally
        // different from the generic status palette so a tile is not read as a health state.
        static let homeWorking = Color(red: 34 / 255, green: 197 / 255, blue: 94 / 255)
        static let homeAttention = Color(red: 245 / 255, green: 158 / 255, blue: 11 / 255)
        static let homeRecent = Color(red: 167 / 255, green: 139 / 255, blue: 250 / 255)
        // Why: settings groups need #eaeaea on their content surface. Keep this explicit
        // token separate so a darker system separator cannot leak into these rows.
        static let settingsDivider = adaptive(
            light: UIColor(red: 234 / 255, green: 234 / 255, blue: 234 / 255, alpha: 1),
            dark: UIColor(red: 48 / 255, green: 48 / 255, blue: 48 / 255, alpha: 1)
        )
        static let primary = adaptive(
            light: UIColor(red: 39 / 255, green: 120 / 255, blue: 193 / 255, alpha: 1),
            dark: UIColor(red: 89 / 255, green: 156 / 255, blue: 231 / 255, alpha: 1)
        )
        static let statusNeutral = adaptive(
            light: UIColor(red: 20 / 255, green: 20 / 255, blue: 20 / 255, alpha: 0.4),
            dark: UIColor(red: 240 / 255, green: 240 / 255, blue: 240 / 255, alpha: 0.4)
        )
        static let rail = adaptive(
            light: UIColor(red: 20 / 255, green: 20 / 255, blue: 20 / 255, alpha: 0.3),
            dark: UIColor(red: 240 / 255, green: 240 / 255, blue: 240 / 255, alpha: 0.3)
        )
        static let gitAdded = adaptive(
            light: UIColor(red: 0 / 255, green: 112 / 255, blue: 65 / 255, alpha: 1),
            dark: UIColor(red: 112 / 255, green: 180 / 255, blue: 137 / 255, alpha: 1)
        )
        static let gitDeleted = adaptive(
            light: UIColor(red: 190 / 255, green: 23 / 255, blue: 68 / 255, alpha: 1),
            dark: UIColor(red: 252 / 255, green: 107 / 255, blue: 131 / 255, alpha: 1)
        )
        static let gitModified = adaptive(
            light: UIColor(red: 164 / 255, green: 103 / 255, blue: 0 / 255, alpha: 1),
            dark: UIColor(red: 241 / 255, green: 180 / 255, blue: 103 / 255, alpha: 1)
        )
        static let gitRenamed = adaptive(
            light: UIColor(red: 39 / 255, green: 120 / 255, blue: 193 / 255, alpha: 1),
            dark: UIColor(red: 123 / 255, green: 175 / 255, blue: 233 / 255, alpha: 1)
        )
        static let gitUntracked = adaptive(
            light: UIColor(red: 23 / 255, green: 108 / 255, blue: 116 / 255, alpha: 1),
            dark: UIColor(red: 136 / 255, green: 192 / 255, blue: 208 / 255, alpha: 1)
        )
        static let diffInserted = adaptive(
            light: UIColor(red: 0 / 255, green: 175 / 255, blue: 102 / 255, alpha: 0.14),
            dark: UIColor(red: 63 / 255, green: 162 / 255, blue: 102 / 255, alpha: 0.2)
        )
        static let diffRemoved = adaptive(
            light: UIColor(red: 255 / 255, green: 97 / 255, blue: 123 / 255, alpha: 0.22),
            dark: UIColor(red: 184 / 255, green: 0 / 255, blue: 73 / 255, alpha: 0.2)
        )
        // Why: the old Mobile review surface is the visual source of truth. Keep its adaptive
        // editor background, line washes, gutter marks, and syntax palette instead of silently
        // substituting the desktop-only dark Pierre renderer.
        static let diffCodeCanvas = content
        static let diffCodeContext = content
        static let diffCodeAdded = diffInserted
        static let diffCodeDeleted = diffRemoved
        static let diffCodeAddedEmphasis = adaptive(
            light: UIColor(red: 0 / 255, green: 176 / 255, blue: 104 / 255, alpha: 0.22),
            dark: UIColor(red: 63 / 255, green: 162 / 255, blue: 102 / 255, alpha: 0.2)
        )
        static let diffCodeDeletedEmphasis = adaptive(
            light: UIColor(red: 255 / 255, green: 97 / 255, blue: 123 / 255, alpha: 0.32),
            dark: UIColor(red: 184 / 255, green: 0 / 255, blue: 73 / 255, alpha: 0.2)
        )
        static let diffCodeAddedGutter = gitAdded
        static let diffCodeDeletedGutter = gitDeleted
        static let diffCodePlain = foreground
        static let diffCodeComment = mutedForeground
        static let diffCodeKeyword = adaptive(
            light: UIColor(red: 0 / 255, green: 0 / 255, blue: 255 / 255, alpha: 1),
            dark: UIColor(red: 86 / 255, green: 156 / 255, blue: 214 / 255, alpha: 1)
        )
        static let diffCodeString = adaptive(
            light: UIColor(red: 163 / 255, green: 21 / 255, blue: 21 / 255, alpha: 1),
            dark: UIColor(red: 206 / 255, green: 145 / 255, blue: 120 / 255, alpha: 1)
        )
        static let diffCodeNumber = adaptive(
            light: UIColor(red: 9 / 255, green: 134 / 255, blue: 88 / 255, alpha: 1),
            dark: UIColor(red: 181 / 255, green: 206 / 255, blue: 168 / 255, alpha: 1)
        )
        static let diffCodeType = adaptive(
            light: UIColor(red: 38 / 255, green: 127 / 255, blue: 153 / 255, alpha: 1),
            dark: UIColor(red: 78 / 255, green: 201 / 255, blue: 176 / 255, alpha: 1)
        )
        static let diffCodeFunction = adaptive(
            light: UIColor(red: 121 / 255, green: 94 / 255, blue: 38 / 255, alpha: 1),
            dark: UIColor(red: 220 / 255, green: 220 / 255, blue: 170 / 255, alpha: 1)
        )
        static let diffCodeProperty = adaptive(
            light: UIColor(red: 0 / 255, green: 16 / 255, blue: 128 / 255, alpha: 1),
            dark: UIColor(red: 156 / 255, green: 220 / 255, blue: 254 / 255, alpha: 1)
        )
        // Why: the old Mobile review uses the same adaptive editor surface and syntax palette as
        // its ordinary diff preview. Reusing those tokens keeps light-mode deletions pale pink
        // and additions pale green instead of turning the entire review into a dark code block.
        static let reviewCodeCanvas = diffCodeCanvas
        static let reviewCodeContext = diffCodeContext
        static let reviewCodePlain = diffCodePlain
        static let reviewCodeComment = diffCodeComment
        static let reviewCodeKeyword = diffCodeKeyword
        static let reviewCodeString = diffCodeString
        static let reviewCodeNumber = diffCodeNumber
        static let reviewCodeType = diffCodeType
        static let reviewCodeFunction = diffCodeFunction
        static let reviewCodeProperty = diffCodeProperty
        static let reviewCodeAdded = diffCodeAdded
        static let reviewCodeDeleted = diffCodeDeleted
        static let reviewCodeAddedEmphasis = diffCodeAddedEmphasis
        static let reviewCodeDeletedEmphasis = diffCodeDeletedEmphasis
        static let reviewCodeAddedGutter = diffCodeAddedGutter
        static let reviewCodeDeletedGutter = diffCodeDeletedGutter
        static let success = Color(red: 34 / 255, green: 197 / 255, blue: 94 / 255)
        static let attention = Color(red: 239 / 255, green: 68 / 255, blue: 68 / 255)
        static let unread = Color(red: 245 / 255, green: 158 / 255, blue: 11 / 255)
        static let reviewOpen = Color(red: 34 / 255, green: 197 / 255, blue: 94 / 255)
        static let reviewMerged = Color(red: 167 / 255, green: 139 / 255, blue: 250 / 255)
        static let accent = selection
        static let canvas = background
        static let content = adaptive(
            light: UIColor(red: 252 / 255, green: 252 / 255, blue: 252 / 255, alpha: 1),
            dark: UIColor(red: 24 / 255, green: 24 / 255, blue: 24 / 255, alpha: 1)
        )

        nonisolated private static func adaptive(light: UIColor, dark: UIColor) -> Color {
            Color(uiColor: UIColor { traits in traits.userInterfaceStyle == .dark ? dark : light })
        }
    }

    enum Spacing {
        static let extraSmall: CGFloat = 4
        static let small: CGFloat = 8
        static let medium: CGFloat = 12
        static let standard: CGFloat = 16
        static let large: CGFloat = 20
        static let extraLarge: CGFloat = 24
        static let huge: CGFloat = 32
        static let page: CGFloat = standard
    }

    enum Radius {
        static let content: CGFloat = 18
        static let control: CGFloat = 14
        static let floatingSurface: CGFloat = 24
    }

    enum Opacity {
        static let statusFill: Double = 0.14
    }

    enum Size {
        static let minimumHitTarget: CGFloat = 44
        static let readingWidth: CGFloat = 720
        // Why: one physical pixel on the iPhone target (3x display scale). A one-point
        // SwiftUI stroke is three pixels and reads as a dark outline around every
        // otherwise-white content section.
        static let hairline: CGFloat = 1.0 / 3.0
    }

    // Why: one compiled text scale for every role, so information density stays fixed
    // instead of each role drifting independently as screens are tuned.
    nonisolated enum Typography {
        static let metadata: CGFloat = 13
        static let supporting: CGFloat = 15
        static let primary: CGFloat = 17
        static let emphasis: CGFloat = 19
        static let pageTitle: CGFloat = 21
        static let code: CGFloat = 13
    }

    enum Control {
        static let inlineHeight: CGFloat = 32
        static let regularHeight: CGFloat = 36
        static let largeHeight: CGFloat = 44
        // Why: the review filter is a compact menu control, not a full-width regular
        // action; 111pt is its measured iPhone width including the glass inset.
        static let reviewFilterWidth: CGFloat = 111
        static let inlineIcon: CGFloat = 16
        static let regularIcon: CGFloat = 18
        static let largeIcon: CGFloat = 20
        static let statusIndicator: CGFloat = 6
    }

    enum Motion {
        static let stateChange = Animation.snappy(duration: 0.32)
        static let gentle = Animation.smooth(duration: 0.42)
    }

    enum Glass {
        static let groupSpacing: CGFloat = Spacing.small
        // Why: stacked glass actions stay on the same 8pt rhythm as horizontal groups; a
        // 12pt vertical gap makes compact action pairs visibly taller than their row form.
        static let stackedActionSpacing: CGFloat = Spacing.small
    }
}
