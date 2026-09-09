import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { buildImageDataUri } from '~renderer/editor/image-data-uri'
import { translate } from '~renderer/i18n/i18n'
import {
  Image as ImageIcon,
  MagnifyingGlassPlus as ZoomIn,
  MagnifyingGlassMinus as ZoomOut,
  ArrowCounterClockwise as RotateCcw
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import {
  type ApplyImageViewerZoomChange,
  applyAnchoredImageViewerZoomChange,
  applyImageSurfaceWheel,
  getElementSurfaceSize,
  getImageLayoutStyle
} from './image-viewer-dom-zoom'
import ImageViewerPopup from './image-viewer-popup'
import {
  IMAGE_VIEWER_ZOOM_STEP,
  MAX_IMAGE_VIEWER_ZOOM,
  MIN_IMAGE_VIEWER_ZOOM,
  type ImageViewerImageDimensions,
  type ImageViewerSurfaceSize,
  getZoomedImageLayoutSize
} from './image-viewer-zoom'
import PdfViewer from './pdf-viewer'

const FALLBACK_IMAGE_MIME_TYPE = 'image/png'

type ImageViewerProps = {
  content?: string
  filePath: string
  mimeType?: string
  layout?: 'fill' | 'intrinsic'
  src?: string
  byteLength?: number
}

export default function ImageViewer({
  content = '',
  filePath,
  mimeType = FALLBACK_IMAGE_MIME_TYPE,
  layout = 'fill',
  src,
  byteLength
}: ImageViewerProps): JSX.Element {
  const [isPopupOpen, setIsPopupOpen] = useState(false)
  const [inlineZoom, setInlineZoom] = useState(1)
  const [popupZoom, setPopupZoom] = useState(1)
  const inlineSurfaceRef = useRef<HTMLDivElement | null>(null)
  const popupSurfaceRef = useRef<HTMLDivElement | null>(null)
  const [inlineSurfaceSize, setInlineSurfaceSize] = useState<ImageViewerSurfaceSize | null>(null)
  const [popupSurfaceSize, setPopupSurfaceSize] = useState<ImageViewerSurfaceSize | null>(null)
  const [imageDimensions, setImageDimensions] = useState<ImageViewerImageDimensions | null>(null)
  const [failedPreviewSrc, setFailedPreviewSrc] = useState<string | null>(null)

  const filename = (() => filePath.split(/[/\\]/).pop() || filePath)()
  const cleanedContent = (() => content.replace(/\s/g, ''))()
  const imageStateKey = `${filePath}\n${mimeType}\n${src ?? cleanedContent}`
  const [lastImageStateKey, setLastImageStateKey] = useState(imageStateKey)
  if (lastImageStateKey !== imageStateKey) {
    setLastImageStateKey(imageStateKey)
    setInlineZoom(1)
    setPopupZoom(1)
    setImageDimensions(null)
  }
  const isPdf = mimeType === 'application/pdf'
  const isIntrinsicLayout = layout === 'intrinsic'
  const previewSrc = (() => src ?? buildImageDataUri(mimeType, cleanedContent))()
  const imageError = previewSrc !== null && failedPreviewSrc === previewSrc
  const estimatedSize = (() => {
    const bytes = byteLength ?? Math.floor((cleanedContent.length * 3) / 4)
    if (bytes < 1024) {
      return `${bytes} B`
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  })()
  const inlineZoomPercent = Math.round(inlineZoom * 100)
  const inlineImageLayoutSize = (() =>
    isIntrinsicLayout
      ? null
      : getZoomedImageLayoutSize({
          imageDimensions,
          surfaceSize: inlineSurfaceSize,
          zoom: inlineZoom
        }))()
  const popupImageLayoutSize = (() =>
    getZoomedImageLayoutSize({
      imageDimensions,
      surfaceSize: popupSurfaceSize,
      zoom: popupZoom
    }))()
  const inlineImageLayoutStyle = (() => getImageLayoutStyle(inlineImageLayoutSize))()
  const popupImageLayoutStyle = (() => getImageLayoutStyle(popupImageLayoutSize))()
  const applyInlineZoomChange: ApplyImageViewerZoomChange = (getNextZoom, anchor) => {
    applyAnchoredImageViewerZoomChange(inlineSurfaceRef.current, setInlineZoom, getNextZoom, anchor)
  }
  const applyPopupZoomChange: ApplyImageViewerZoomChange = (getNextZoom, anchor) => {
    applyAnchoredImageViewerZoomChange(popupSurfaceRef.current, setPopupZoom, getNextZoom, anchor)
  }
  const openPopup = () => {
    setPopupZoom(inlineZoom)
    setIsPopupOpen(true)
  }
  const handlePopupOpenChange = (open: boolean) => {
    if (open) {
      setPopupZoom(inlineZoom)
    }
    setIsPopupOpen(open)
  }
  const handleInlineImageSurfaceWheel = (event: WheelEvent) => {
    applyImageSurfaceWheel(event, applyInlineZoomChange)
  }
  const handlePopupImageSurfaceWheel = (event: WheelEvent) => {
    applyImageSurfaceWheel(event, applyPopupZoomChange)
  }
  const setInlineSurfaceRef = (surface: HTMLDivElement | null) => {
    if (inlineSurfaceRef.current) {
      inlineSurfaceRef.current.removeEventListener('wheel', handleInlineImageSurfaceWheel)
    }
    inlineSurfaceRef.current = surface
    if (surface) {
      setInlineSurfaceSize(getElementSurfaceSize(surface))
      // Why: Chromium exposes trackpad pinch as ctrl-wheel and requires a
      // native non-passive listener to stop browser/app zoom.
      surface.addEventListener('wheel', handleInlineImageSurfaceWheel, { passive: false })
    } else {
      setInlineSurfaceSize(null)
    }
  }
  const setPopupSurfaceRef = (surface: HTMLDivElement | null) => {
    if (popupSurfaceRef.current) {
      popupSurfaceRef.current.removeEventListener('wheel', handlePopupImageSurfaceWheel)
    }
    popupSurfaceRef.current = surface
    if (surface) {
      setPopupSurfaceSize(getElementSurfaceSize(surface))
      surface.addEventListener('wheel', handlePopupImageSurfaceWheel, { passive: false })
    } else {
      setPopupSurfaceSize(null)
    }
  }

  useEffect(() => {
    const surface = inlineSurfaceRef.current
    if (!surface) {
      return
    }

    const updateSize = () => setInlineSurfaceSize(getElementSurfaceSize(surface))
    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(surface)
    return () => observer.disconnect()
  }, [previewSrc])

  useEffect(() => {
    if (!isPopupOpen) {
      return
    }

    const surface = popupSurfaceRef.current
    if (!surface) {
      return
    }

    const updateSize = () => setPopupSurfaceSize(getElementSurfaceSize(surface))
    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(surface)
    return () => observer.disconnect()
  }, [isPopupOpen])

  if (isPdf) {
    return <PdfViewer content={cleanedContent} filePath={filePath} src={src} />
  }

  if (imageError) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 bg-muted/20 p-8 text-sm text-muted-foreground',
          isIntrinsicLayout ? 'min-h-64' : 'h-full'
        )}
      >
        <ImageIcon size={40} />
        <div>
          {translate(
            'auto.components.editor.ImageViewer.d9d2944855',
            'Failed to load file preview'
          )}
        </div>
        <div className="max-w-md text-center text-xs break-all">{filename}</div>
      </div>
    )
  }

  if (!previewSrc) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-muted-foreground text-sm',
          isIntrinsicLayout ? 'min-h-64' : 'h-full'
        )}
      >
        {translate('auto.components.editor.ImageViewer.3ef9551ba2', 'Loading preview...')}
      </div>
    )
  }

  return (
    <>
      <div className={cn('flex min-h-0 flex-col', isIntrinsicLayout ? 'h-auto' : 'h-full')}>
        <div
          ref={setInlineSurfaceRef}
          className={cn(
            'cursor-pointer bg-muted/20',
            isIntrinsicLayout
              ? 'flex justify-center overflow-visible p-4'
              : 'flex-1 overflow-auto scrollbar-editor'
          )}
          onClick={openPopup}
          title={translate('auto.components.editor.ImageViewer.77bfc9b35a', 'Open image in popup')}
        >
          <div
            className={cn(
              'flex justify-center',
              isIntrinsicLayout
                ? 'max-w-full items-start'
                : 'h-max min-h-full w-max min-w-full items-center p-4'
            )}
          >
            <div
              className="flex items-center justify-center"
              style={
                isIntrinsicLayout
                  ? { transform: `scale(${inlineZoom})`, transformOrigin: 'center center' }
                  : inlineImageLayoutStyle
              }
            >
              <img
                src={previewSrc}
                alt={filename}
                className={cn(
                  'object-contain',
                  isIntrinsicLayout
                    ? 'block h-auto max-h-none max-w-full'
                    : inlineImageLayoutSize
                      ? 'block h-full w-full'
                      : 'block max-h-full max-w-full'
                )}
                onLoad={(event) => {
                  const img = event.currentTarget
                  setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
                  setFailedPreviewSrc(null)
                }}
                // Why: track the failed source identity, not a boolean, so a new
                // image retries immediately without waiting for an Effect reset.
                onError={() => setFailedPreviewSrc(previewSrc)}
              />
            </div>
          </div>
        </div>
        <div className="text-muted-foreground flex items-center gap-4 border-t px-4 py-2 text-xs">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              type="button"
              className="hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground h-auto border-0 p-1"
              onClick={() =>
                applyInlineZoomChange((currentZoom) => currentZoom / IMAGE_VIEWER_ZOOM_STEP)
              }
              disabled={inlineZoom <= MIN_IMAGE_VIEWER_ZOOM}
              title={translate('auto.components.editor.ImageViewer.be27304574', 'Zoom out')}
            >
              <ZoomOut size={14} />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              type="button"
              className="hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground h-auto border-0 p-1"
              onClick={() => applyInlineZoomChange(() => 1)}
              disabled={inlineZoom === 1}
              title={translate('auto.components.editor.ImageViewer.6c89c73d9f', 'Reset zoom')}
            >
              <RotateCcw size={14} />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              type="button"
              className="hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground h-auto border-0 p-1"
              onClick={() =>
                applyInlineZoomChange((currentZoom) => currentZoom * IMAGE_VIEWER_ZOOM_STEP)
              }
              disabled={inlineZoom >= MAX_IMAGE_VIEWER_ZOOM}
              title={translate('auto.components.editor.ImageViewer.3c9217f5a6', 'Zoom in')}
            >
              <ZoomIn size={14} />
            </Button>
            <span className="ml-1 tabular-nums">{inlineZoomPercent}%</span>
          </div>
          <span className="min-w-0 truncate" title={filename}>
            {filename}
          </span>
          {imageDimensions && (
            <span>
              {imageDimensions.width} x {imageDimensions.height}
            </span>
          )}
          <span>{estimatedSize}</span>
        </div>
      </div>
      <ImageViewerPopup
        filename={filename}
        imageLayoutSize={popupImageLayoutSize}
        imageLayoutStyle={popupImageLayoutStyle}
        isOpen={isPopupOpen}
        onOpenChange={handlePopupOpenChange}
        previewUrl={previewSrc}
        setSurfaceRef={setPopupSurfaceRef}
        zoomPercent={Math.round(popupZoom * 100)}
      />
    </>
  )
}
