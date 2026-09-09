import { useEffect, type CSSProperties } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { LoadingIndicator } from '~renderer/loading/indicator'

import type { VisualStreamGeometry } from './emulator-device-frame-layout'
import { useEmulatorFrameStream } from './use-emulator-frame-stream'

type StreamSize = {
  height: number
  width: number
}

type EmulatorScreenStreamContentProps = {
  loading: boolean
  onStreamError: () => void
  onStreamSize: (size: StreamSize) => void
  previewUrl?: string
  screenAspectRatio?: number
  showStream: boolean
  streamError: boolean
  streamKey?: string
  streamRotation?: VisualStreamGeometry['streamRotation']
}

export function EmulatorScreenStreamContent({
  loading,
  onStreamError,
  onStreamSize,
  previewUrl,
  screenAspectRatio = 9 / 19,
  showStream,
  streamError,
  streamKey,
  streamRotation = 0
}: EmulatorScreenStreamContentProps) {
  const frameStream = useEmulatorFrameStream(
    previewUrl,
    streamKey,
    showStream && Boolean(previewUrl)
  )

  useEffect(() => {
    if (frameStream.error) {
      onStreamError()
    }
  }, [frameStream.error, onStreamError])

  const mediaStyle = resolveStreamMediaStyle(streamRotation, screenAspectRatio)
  const mediaClassName =
    streamRotation === 0
      ? 'block h-full w-full bg-black object-contain'
      : 'absolute left-1/2 top-1/2 block max-w-none bg-black object-contain'

  if (showStream && frameStream.frameUrl) {
    return (
      <img
        key={`${previewUrl}::${streamKey ?? ''}`}
        src={frameStream.frameUrl}
        alt={translate(
          'auto.components.emulator.pane.emulator.screen.stream.content.5ee64cd44e',
          'Emulator screen'
        )}
        className={mediaClassName}
        draggable={false}
        style={mediaStyle}
        onError={onStreamError}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget
          if (naturalWidth <= 0 || naturalHeight <= 0) {
            return
          }
          onStreamSize({ width: naturalWidth, height: naturalHeight })
        }}
      />
    )
  }

  const waitingForFrame = showStream && !frameStream.error
  const displayError = streamError || Boolean(frameStream.error)

  return (
    <div className="bg-muted/20 text-muted-foreground flex h-full w-full flex-col items-center justify-center gap-3">
      {loading || waitingForFrame ? (
        <>
          <LoadingIndicator className="text-primary size-6" />
          <span className="text-xs">
            {translate(
              'auto.components.emulator.pane.emulator.screen.stream.content.5f818f12ab',
              'Connecting emulator…'
            )}
          </span>
        </>
      ) : displayError ? (
        <span className="px-6 text-center text-xs">
          {translate(
            'auto.components.emulator.pane.emulator.screen.stream.content.36841af608',
            'Stream disconnected'
          )}
        </span>
      ) : (
        <span className="px-6 text-center text-xs">
          {translate(
            'auto.components.emulator.pane.emulator.screen.stream.content.8b1a0d8694',
            'Emulator preview'
          )}
        </span>
      )}
    </div>
  )
}

function resolveStreamMediaStyle(
  streamRotation: VisualStreamGeometry['streamRotation'],
  screenAspectRatio: number
): CSSProperties | undefined {
  if (streamRotation === 0 || screenAspectRatio <= 0) {
    return undefined
  }
  return {
    height: `${100 * screenAspectRatio}%`,
    transform: `translate(-50%, -50%) rotate(${streamRotation}deg)`,
    transformOrigin: 'center',
    width: `${100 / screenAspectRatio}%`
  }
}
