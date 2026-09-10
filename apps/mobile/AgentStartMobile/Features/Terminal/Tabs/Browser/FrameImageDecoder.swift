import CoreGraphics
import Foundation

nonisolated enum WorkspaceBrowserFrameImageDecoder {
    static func decode(_ data: Data, maxPixelSize: Int) -> CGImage? {
        PlatformImageDecoder.decode(data, maxPixelSize: maxPixelSize)
    }
}
