import Hugeicons
import SwiftUI

/// Product-semantic interface icons backed exclusively by Hugeicons Free.
///
/// This is the only source file that knows the provider catalog. Feature code
/// depends on these meanings so changing an asset remains local to DesignSystem.
nonisolated struct YiruIconID: Sendable, Hashable {
    private let asset: HugeiconsAsset

    private init(_ asset: HugeiconsAsset) {
        self.asset = asset
    }

    @MainActor
    func image() -> Image {
        asset.image()
    }

    static let account = Self(Hugeicons.userCircle)
    static let add = Self(Hugeicons.add01)
    static let arrowDown = Self(Hugeicons.arrowDown01)
    static let arrowLeft = Self(Hugeicons.arrowLeft01)
    static let arrowRight = Self(Hugeicons.arrowRight01)
    static let externalLink = Self(Hugeicons.externalLink)
    static let arrowUp = Self(Hugeicons.arrowUp01)
    static let attachment = Self(Hugeicons.attachment)
    static let bell = Self(Hugeicons.bell)
    static let bellRinging = Self(Hugeicons.bellRing)
    static let bellDot = Self(Hugeicons.bellDot)
    static let braces = Self(Hugeicons.braces)
    static let briefcase = Self(Hugeicons.briefcase01)
    static let buildings = Self(Hugeicons.building01)
    static let camera = Self(Hugeicons.camera01)
    static let insights = Self(Hugeicons.analytics01)
    static let chevronDown = Self(Hugeicons.chevronDown)
    static let chevronRight = Self(Hugeicons.chevronRight)
    static let chevronUp = Self(Hugeicons.chevronUp)
    static let chat = Self(Hugeicons.message01)
    static let check = Self(Hugeicons.check)
    static let checkCircle = Self(Hugeicons.checkmarkCircle01)
    static let checklist = Self(Hugeicons.checkList)
    static let checkboxChecked = Self(Hugeicons.checkmarkSquare01)
    static let circle = Self(Hugeicons.circle)
    static let clipboard = Self(Hugeicons.clipboard)
    static let clock = Self(Hugeicons.clock01)
    static let closeCircle = Self(Hugeicons.cancelCircle)
    static let code = Self(Hugeicons.code)
    static let copy = Self(Hugeicons.copy01)
    static let cpu = Self(Hugeicons.cpu)
    static let cube = Self(Hugeicons.cube)
    static let database = Self(Hugeicons.database)
    static let deviceMobile = Self(Hugeicons.smartPhone01)
    static let download = Self(Hugeicons.download01)
    static let edit = Self(Hugeicons.edit01)
    static let eraser = Self(Hugeicons.eraser01)
    static let file = Self(Hugeicons.file01)
    static let fileText = Self(Hugeicons.file02)
    static let filter = Self(Hugeicons.filterHorizontal)
    static let folder = Self(Hugeicons.folder01)
    static let gauge = Self(Hugeicons.gauge)
    static let gitBranch = Self(Hugeicons.gitBranch)
    static let githubLogo = Self(Hugeicons.github)
    static let gitMerge = Self(Hugeicons.gitMerge)
    static let gitPullRequest = Self(Hugeicons.gitPullRequest)
    static let globe = Self(Hugeicons.globe02)
    static let gripVertical = Self(Hugeicons.gripVertical)
    static let hardDrives = Self(Hugeicons.hardDrive)
    static let history = Self(Hugeicons.history)
    static let image = Self(Hugeicons.image01)
    static let info = Self(Hugeicons.informationCircle)
    static let key = Self(Hugeicons.key01)
    static let keyboardControl = Self(Hugeicons.chevronUp)
    static let keyboardEnter = Self(Hugeicons.cornerDownLeft)
    static let keyboardTab = Self(Hugeicons.arrowRightToLine)
    static let laptop = Self(Hugeicons.laptop)
    static let lifebuoy = Self(Hugeicons.lifebuoy)
    static let monitor = Self(Hugeicons.computer)
    static let moon = Self(Hugeicons.moon02)
    // Every header action uses the free bare horizontal-dots glyph; the glass target supplies
    // the circle.
    static let more = Self(Hugeicons.moreHorizontal)
    // Why: leaving a review note is "add a comment", not "change typography" — the textFormat
    // `Aa` glyph that used to sit on this action reads as a font control and is a two-letter
    // form next to the single-stroke add/check icons beside it.
    static let noteAdd = Self(Hugeicons.commentAdd01)
    static let package = Self(Hugeicons.package)
    // Why: Hugeicons Free has no dedicated "palette" asset. paintBoard (wells on a board) reads
    // as appearance/color customization more directly than the brush or color-picker assets.
    static let palette = Self(Hugeicons.paintBoard)
    static let pencil = Self(Hugeicons.pencil)
    static let photo = Self(Hugeicons.image01)
    static let play = Self(Hugeicons.play)
    static let pulse = Self(Hugeicons.pulse01)
    static let pushPin = Self(Hugeicons.pin)
    static let qrCodeScan = Self(Hugeicons.qrCodeScan)
    static let refresh = Self(Hugeicons.refresh)
    static let remove = Self(Hugeicons.remove01)
    static let robot = Self(Hugeicons.robot01)
    static let rocket = Self(Hugeicons.rocket01)
    static let search = Self(Hugeicons.search01)
    static let settings = Self(Hugeicons.settings01)
    static let sidebar = Self(Hugeicons.sidebarLeft)
    static let shapes = Self(Hugeicons.shapes)
    static let shield = Self(Hugeicons.shield01)
    static let scroll = Self(Hugeicons.scroll)
    static let sparkle = Self(Hugeicons.sparkles)
    static let square = Self(Hugeicons.square)
    static let stack = Self(Hugeicons.layers01)
    static let stop = Self(Hugeicons.stop)
    static let terminal = Self(Hugeicons.terminal)
    static let terminalWindow = Self(Hugeicons.commandLine)
    static let textFormat = Self(Hugeicons.textFont)
    static let trash = Self(Hugeicons.delete01)
    static let undo = Self(Hugeicons.undo)
    static let upload = Self(Hugeicons.upload01)
    static let warning = Self(Hugeicons.alert02)
    static let wifiSlash = Self(Hugeicons.wifiOff01)
    static let wrench = Self(Hugeicons.wrench01)
    static let x = Self(Hugeicons.cancel01)
    static let xCircle = Self(Hugeicons.cancelCircle)
}
