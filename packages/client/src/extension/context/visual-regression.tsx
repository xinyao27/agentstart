import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Camera, CheckCircle } from '~renderer/icons/hugeicons'
import {
  saveVisualRegression,
  visualRegressionLatestQuery
} from '~renderer/runtime/visual-regression-target'
import { Button } from '~renderer/ui/button'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { worktreesQuery, WORKSPACE_EVENTS_QUERY_ROOT } from '../runtime/queries'
import { pngDataUrlToBlob, readBrowserArtifact, uploadBrowserArtifact } from './artifact-upload'

type VisualRegressionProps = {
  pageUrl: string
  projectId: string
  worktreeId: string
}

type ImageSnapshot = {
  height: number
  pixels: Uint8ClampedArray
  width: number
}

export function VisualRegression({
  pageUrl,
  projectId,
  worktreeId
}: VisualRegressionProps): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const queryClient = useQueryClient()
  const latestQuery = visualRegressionLatestQuery({ pageUrl, projectId, worktreeId })
  const latest = useQuery(latestQuery)
  const automaticCaptureAccess = useQuery({
    queryKey: ['extension-host', 'persistent-page-capture', pageUrl],
    queryFn: capabilities.hasPersistentPageCaptureAccess
  })
  const worktrees = useQuery({ ...worktreesQuery(projectId), refetchInterval: 2_000 })
  const head =
    worktrees.data?.worktrees.find((worktree) => worktree.id === worktreeId)?.head ?? null
  const previousHead = useRef<string | null>(null)
  const capture = useMutation({
    mutationFn: async () => {
      const granted = await capabilities.requestPageCapture()
      if (!granted) {
        throw new Error('page_capture_permission_denied')
      }
      const imageDataUrl = await capabilities.captureVisiblePage()
      const current = await decodeImage(imageDataUrl)
      const previous = latest.data?.capture
        ? await decodeImage(await readBrowserArtifact(latest.data.capture.imageArtifactId))
        : null
      const comparison = previous ? comparePixels(previous, current) : null
      if (comparison?.regions.length) {
        await capabilities.highlightVisualChanges(comparison.regions)
      }
      const imageArtifactId = await uploadBrowserArtifact({
        blob: pngDataUrlToBlob(imageDataUrl),
        fileName: `visual-regression-${new Date().toISOString().replaceAll(':', '-')}.png`,
        projectId
      })
      return saveVisualRegression({
        diffRatio: comparison?.ratio ?? null,
        height: current.height,
        imageArtifactId,
        pageUrl,
        projectId,
        width: current.width,
        worktreeId
      })
    },
    onSuccess: async () => {
      previousHead.current = head
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: latestQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: WORKSPACE_EVENTS_QUERY_ROOT })
      ])
    }
  })
  useEffect(() => {
    if (previousHead.current === null) {
      previousHead.current = head
      return
    }
    if (
      head &&
      head !== previousHead.current &&
      latest.data?.capture &&
      automaticCaptureAccess.data === true &&
      !capture.isPending
    ) {
      previousHead.current = head
      capture.mutate()
    }
  }, [automaticCaptureAccess.data, capture, head, latest.data?.capture])
  const diffRatio = capture.data?.capture.diffRatio ?? latest.data?.capture?.diffRatio ?? null

  return (
    <div className="border-sidebar-border ml-6 border-l px-2 py-1.5">
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={capture.isPending}
        onClick={() => capture.mutate()}
      >
        {capture.isSuccess ? <CheckCircle /> : <Camera />}
        {capture.isPending
          ? translate('extension.visualRegression.capturing', 'Comparing…')
          : translate('extension.visualRegression.capture', 'Capture visual baseline')}
      </Button>
      <p className="text-muted-foreground pt-1 text-xs">
        {diffRatio === null
          ? translate(
              'extension.visualRegression.noBaseline',
              'The first capture becomes baseline.'
            )
          : translate('extension.visualRegression.changed', '{{percent}}% pixels changed', {
              percent: (diffRatio * 100).toFixed(2)
            })}
      </p>
      {capture.isError ? (
        <p className="text-destructive pt-1 text-xs">
          {translate('extension.visualRegression.failed', 'The visible tab could not be compared.')}
        </p>
      ) : null}
    </div>
  )
}

async function decodeImage(source: Blob | string): Promise<ImageSnapshot> {
  const image = new Image()
  const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source)
  image.src = typeof source === 'string' ? source : (objectUrl ?? '')
  try {
    await waitForImage(image)
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('visual_capture_canvas_unavailable')
  }
  context.drawImage(image, 0, 0)
  return {
    height: canvas.height,
    pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
    width: canvas.width
  }
}

async function waitForImage(image: HTMLImageElement): Promise<void> {
  if (!image.complete) {
    await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => reject(new Error('visual_capture_image_invalid')), {
        once: true
      })
    })
  }
  if (image.naturalWidth === 0 || image.naturalHeight === 0) {
    throw new Error('visual_capture_image_invalid')
  }
}

function comparePixels(
  previous: ImageSnapshot,
  current: ImageSnapshot
): {
  ratio: number
  regions: { height: number; width: number; x: number; y: number }[]
} {
  if (previous.width !== current.width || previous.height !== current.height) {
    return { ratio: 1, regions: [{ height: 1, width: 1, x: 0, y: 0 }] }
  }
  let changed = 0
  const pixelCount = current.width * current.height
  const columns = 8
  const rows = 8
  const changedByRegion = new Uint32Array(columns * rows)
  for (let offset = 0; offset < current.pixels.length; offset += 4) {
    if (
      Math.abs(previous.pixels[offset] - current.pixels[offset]) > 8 ||
      Math.abs(previous.pixels[offset + 1] - current.pixels[offset + 1]) > 8 ||
      Math.abs(previous.pixels[offset + 2] - current.pixels[offset + 2]) > 8 ||
      Math.abs(previous.pixels[offset + 3] - current.pixels[offset + 3]) > 8
    ) {
      changed += 1
      const pixel = offset / 4
      const x = pixel % current.width
      const y = Math.floor(pixel / current.width)
      const column = Math.min(columns - 1, Math.floor((x / current.width) * columns))
      const row = Math.min(rows - 1, Math.floor((y / current.height) * rows))
      changedByRegion[row * columns + column] += 1
    }
  }
  const regionPixels = (current.width / columns) * (current.height / rows)
  const regions = [...changedByRegion].flatMap((count, index) =>
    count / regionPixels > 0.03
      ? [
          {
            height: 1 / rows,
            width: 1 / columns,
            x: (index % columns) / columns,
            y: Math.floor(index / columns) / rows
          }
        ]
      : []
  )
  return { ratio: pixelCount === 0 ? 0 : changed / pixelCount, regions }
}
