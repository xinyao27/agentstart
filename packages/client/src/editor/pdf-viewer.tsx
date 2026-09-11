import { keybindingMatchesAction } from '@agentstart/protocol/keybindings'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  EventBus,
  PDFFindController,
  PDFLinkService,
  PDFViewer as PdfJsViewer
} from 'pdfjs-dist/web/pdf_viewer.mjs'
import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'

import 'pdfjs-dist/web/pdf_viewer.css'
import { translate } from '~renderer/i18n/i18n'
import {
  Image as ImageIcon,
  MagnifyingGlass as Search,
  MagnifyingGlassPlus as ZoomIn,
  MagnifyingGlassMinus as ZoomOut,
  ArrowCounterClockwise as RotateCcw
} from '~renderer/icons/hugeicons'
import { getShortcutPlatform } from '~renderer/keyboard-input/shortcut-platform'
import { useShortcutLabel } from '~renderer/keyboard-input/use-shortcut-label'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'

import PdfFind from './pdf-find'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const MIN_SCALE = 0.25
const MAX_SCALE = 5
const SCALE_STEP = 1.25

type PdfViewerProps = {
  content?: string
  filePath: string
  src?: string
}

type PdfSourceState =
  | { source: { url: string } | { data: Uint8Array<ArrayBuffer> }; error: null }
  | { source: null; error: string | null }

export default function PdfViewer(props: PdfViewerProps): JSX.Element {
  const content = props.content ?? ''
  return <PdfViewerContent key={`${props.filePath}\0${props.src ?? content}`} {...props} />
}

function PdfViewerContent({ content = '', filePath, src }: PdfViewerProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerDivRef = useRef<HTMLDivElement>(null)
  const [sourceState] = useState<PdfSourceState>(() => resolvePdfSource(content, src))
  const [asyncPdfError, setAsyncPdfError] = useState<string | null>(null)
  const pdfError = sourceState.error ?? asyncPdfError
  const [findOpen, setFindOpen] = useState(false)
  const [scale, setScale] = useState(1)
  const keybindings = useAppStore((state) => state.keybindings)
  const findShortcutLabel = useShortcutLabel('editor.find')
  const eventBusRef = useRef<InstanceType<typeof EventBus> | null>(null)
  const findControllerRef = useRef<InstanceType<typeof PDFFindController> | null>(null)
  const pdfViewerRef = useRef<InstanceType<typeof PdfJsViewer> | null>(null)

  const filename = (() => filePath.split(/[/\\]/).pop() || filePath)()
  useEffect(() => {
    const container = containerRef.current
    const viewerDiv = viewerDivRef.current
    if (!container || !viewerDiv || !sourceState.source) {
      return
    }

    let cancelled = false

    const eventBus = new EventBus()
    eventBusRef.current = eventBus

    const linkService = new PDFLinkService({ eventBus })

    const findController = new PDFFindController({ linkService, eventBus })
    findControllerRef.current = findController

    const viewer = new PdfJsViewer({
      container,
      viewer: viewerDiv,
      eventBus,
      linkService,
      findController,
      textLayerMode: 1,
      removePageBorders: true
    })
    pdfViewerRef.current = viewer

    linkService.setViewer(viewer)

    const handleScaleChanging = (evt: { scale: number }): void => {
      if (!cancelled) {
        setScale(evt.scale)
      }
    }
    eventBus.on('scalechanging', handleScaleChanging)

    const loadingTask = pdfjsLib.getDocument(sourceState.source)

    loadingTask.promise
      .then((doc) => {
        if (cancelled) {
          return
        }
        viewer.setDocument(doc)
        linkService.setDocument(doc)
        findController.setDocument(doc)
        viewer.currentScaleValue = 'page-width'
      })
      .catch((err) => {
        if (cancelled) {
          return
        }
        if (err?.name === 'PasswordException') {
          setAsyncPdfError('This PDF is password-protected')
        } else {
          setAsyncPdfError('Failed to load PDF preview')
        }
      })

    return () => {
      cancelled = true
      setFindOpen(false)
      // Why: pdf.js 6 moved document teardown ownership to the loading task;
      // PDFDocumentProxy no longer exposes a separate destroy operation.
      loadingTask.destroy().catch(() => {})
      // Why: setDocument(null) is the proper teardown — it cancels active
      // renders, clears the find controller, and dispatches pagesdestroy.
      // The runtime accepts null but the types only declare PDFDocumentProxy.
      viewer.setDocument(null as unknown as pdfjsLib.PDFDocumentProxy)
      // Why: pdf.js EventBus retains callbacks by event name; unregister the
      // scale listener so repeated PDF opens do not retain stale component state.
      eventBus.off('scalechanging', handleScaleChanging)
      eventBusRef.current = null
      findControllerRef.current = null
      pdfViewerRef.current = null
    }
  }, [sourceState])

  const closeFindBar = () => {
    const eventBus = eventBusRef.current
    if (eventBus) {
      eventBus.dispatch('findbarclose', { source: null })
    }
    setFindOpen(false)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const platform = getShortcutPlatform()
      if (keybindingMatchesAction('editor.find', e, platform, keybindings)) {
        e.preventDefault()
        e.stopPropagation()
        setFindOpen(true)
        return
      }
      if (keybindingMatchesAction('zoom.in', e, platform, keybindings)) {
        e.preventDefault()
        const viewer = pdfViewerRef.current
        if (viewer) {
          viewer.currentScale = Math.min(MAX_SCALE, viewer.currentScale * SCALE_STEP)
        }
      } else if (keybindingMatchesAction('zoom.out', e, platform, keybindings)) {
        e.preventDefault()
        const viewer = pdfViewerRef.current
        if (viewer) {
          viewer.currentScale = Math.max(MIN_SCALE, viewer.currentScale / SCALE_STEP)
        }
      } else if (keybindingMatchesAction('zoom.reset', e, platform, keybindings)) {
        e.preventDefault()
        const viewer = pdfViewerRef.current
        if (viewer) {
          viewer.currentScaleValue = 'page-width'
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [keybindings])

  const zoomIn = () => {
    const viewer = pdfViewerRef.current
    if (viewer) {
      viewer.currentScale = Math.min(MAX_SCALE, viewer.currentScale * SCALE_STEP)
    }
  }

  const zoomOut = () => {
    const viewer = pdfViewerRef.current
    if (viewer) {
      viewer.currentScale = Math.max(MIN_SCALE, viewer.currentScale / SCALE_STEP)
    }
  }

  const zoomReset = () => {
    const viewer = pdfViewerRef.current
    if (viewer) {
      viewer.currentScaleValue = 'page-width'
    }
  }

  const zoomPercent = Math.round(scale * 100)

  if (pdfError) {
    return (
      <div className="flex h-full flex-col">
        <div className="bg-muted/20 text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 p-8 text-sm">
          <ImageIcon size={40} />
          <div>{pdfError}</div>
          <div className="max-w-md text-center text-xs break-all">{filename}</div>
        </div>
        <div className="text-muted-foreground flex items-center gap-4 border-t px-4 py-2 text-xs">
          <span className="min-w-0 truncate" title={filename}>
            {filename}
          </span>
          <span>{translate('auto.components.editor.PdfViewer.3e98d500d2', 'PDF preview')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <PdfFind isOpen={findOpen} onClose={closeFindBar} eventBusRef={eventBusRef} />
        {/* Why: PDFViewer requires its container to be position:absolute.
            The outer div uses all:revert to prevent Tailwind Preflight from
            cascading into pdf.js DOM (text layer misalignment). The inner div
            carries positioning and background since all:revert nullifies classes. */}
        <div style={{ all: 'revert' }}>
          <div
            ref={containerRef}
            style={{
              position: 'absolute',
              inset: '0',
              overflow: 'auto',
              background: 'var(--pdf-viewer-bg, var(--card))'
            }}
            className="scrollbar-editor dark:[--pdf-viewer-bg:var(--card)]"
          >
            <div ref={viewerDivRef} className="pdfViewer" />
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
            onClick={zoomOut}
            disabled={scale <= MIN_SCALE}
            title={translate('auto.components.editor.PdfViewer.fa5d096b00', 'Zoom out')}
          >
            <ZoomOut size={14} />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            type="button"
            className="hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground h-auto border-0 p-1"
            onClick={zoomReset}
            title={translate('auto.components.editor.PdfViewer.c0119616d6', 'Fit to width')}
          >
            <RotateCcw size={14} />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            type="button"
            className="hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground h-auto border-0 p-1"
            onClick={zoomIn}
            disabled={scale >= MAX_SCALE}
            title={translate('auto.components.editor.PdfViewer.2b6eb1ccd6', 'Zoom in')}
          >
            <ZoomIn size={14} />
          </Button>
          <span className="ml-1 tabular-nums">{zoomPercent}%</span>
        </div>
        <Button
          variant="ghost"
          size="xs"
          type="button"
          className="hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground h-auto border-0 p-1"
          onClick={() => setFindOpen(true)}
          title={translate(
            'auto.components.editor.PdfViewer.069ff59932',
            'Find in PDF ({{value0}})',
            { value0: findShortcutLabel }
          )}
        >
          <Search size={14} />
        </Button>
        <span className="min-w-0 truncate" title={filename}>
          {filename}
        </span>
        <span>{translate('auto.components.editor.PdfViewer.3e98d500d2', 'PDF preview')}</span>
      </div>
    </div>
  )
}

function resolvePdfSource(content: string, src?: string): PdfSourceState {
  if (src) {
    return { source: { url: src }, error: null }
  }
  const cleanedContent = content.replace(/\s/g, '')
  if (!cleanedContent) {
    return { source: null, error: null }
  }
  try {
    const binary = window.atob(cleanedContent)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return { source: { data: bytes }, error: null }
  } catch {
    return { source: null, error: 'Failed to decode PDF content' }
  }
}
