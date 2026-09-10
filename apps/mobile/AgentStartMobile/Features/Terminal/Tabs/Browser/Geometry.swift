import CoreGraphics

nonisolated struct WorkspaceBrowserFrameGeometry: Sendable {
    let sourceWidth: Double
    let sourceHeight: Double
    let renderedWidth: Double
    let renderedHeight: Double
    let offsetX: Double
    let offsetY: Double
    let scale: Double
}

nonisolated func workspaceBrowserFrameGeometry(
    size: CGSize,
    metadata: WorkspaceBrowserFrameMetadata
) -> WorkspaceBrowserFrameGeometry? {
    guard size.width > 0, size.height > 0 else { return nil }
    let sourceWidth = positive(metadata.deviceWidth) ?? size.width
    let sourceHeight = positive(metadata.deviceHeight) ?? size.height
    let scale = min(size.width / sourceWidth, size.height / sourceHeight)
    guard scale.isFinite, scale > 0 else { return nil }
    let renderedWidth = sourceWidth * scale
    let renderedHeight = sourceHeight * scale
    return WorkspaceBrowserFrameGeometry(
        sourceWidth: sourceWidth,
        sourceHeight: sourceHeight,
        renderedWidth: renderedWidth,
        renderedHeight: renderedHeight,
        offsetX: (size.width - renderedWidth) / 2,
        offsetY: (size.height - renderedHeight) / 2,
        scale: scale
    )
}

nonisolated func workspaceBrowserPoint(
    location: CGPoint,
    size: CGSize,
    metadata: WorkspaceBrowserFrameMetadata,
    zoom: Double = 1,
    offset: CGSize = .zero
) -> WorkspaceBrowserPoint? {
    guard let geometry = workspaceBrowserFrameGeometry(size: size, metadata: metadata) else {
        return nil
    }
    guard zoom.isFinite, zoom > 0 else { return nil }
    let centerX = geometry.offsetX + geometry.renderedWidth / 2 + offset.width
    let centerY = geometry.offsetY + geometry.renderedHeight / 2 + offset.height
    let localX = (location.x - centerX) / zoom + geometry.renderedWidth / 2
    let localY = (location.y - centerY) / zoom + geometry.renderedHeight / 2
    guard localX >= 0, localY >= 0, localX <= geometry.renderedWidth,
        localY <= geometry.renderedHeight
    else { return nil }
    return WorkspaceBrowserPoint(
        x: (localX / geometry.renderedWidth * geometry.sourceWidth).rounded(),
        y: (localY / geometry.renderedHeight * geometry.sourceHeight).rounded()
    )
}

nonisolated func workspaceBrowserClickRadius(
    size: CGSize,
    metadata: WorkspaceBrowserFrameMetadata,
    zoom: Double = 1
) -> Double {
    guard let geometry = workspaceBrowserFrameGeometry(size: size, metadata: metadata) else {
        return 10
    }
    return min(max((14 / (geometry.scale * max(zoom, 1))).rounded(), 6), 48)
}

nonisolated func clampedWorkspaceBrowserOffset(
    _ offset: CGSize,
    zoom: Double,
    size: CGSize,
    metadata: WorkspaceBrowserFrameMetadata
) -> CGSize {
    guard let geometry = workspaceBrowserFrameGeometry(size: size, metadata: metadata) else {
        return .zero
    }
    let boundedZoom = min(max(zoom, 1), 3.5)
    guard boundedZoom > 1.01 else { return .zero }
    let maximumX = max((geometry.renderedWidth * boundedZoom - size.width) / 2, 0)
    let maximumY = max((geometry.renderedHeight * boundedZoom - size.height) / 2, 0)
    return CGSize(
        width: min(max(offset.width, -maximumX), maximumX),
        height: min(max(offset.height, -maximumY), maximumY)
    )
}

nonisolated private func positive(_ value: Double?) -> Double? {
    guard let value, value.isFinite, value > 0 else { return nil }
    return value
}
