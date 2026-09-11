import DOMPurify from 'dompurify'
import type mermaidNamespace from 'mermaid'
import React, { useEffect, useId, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'

import { getMermaidConfig } from './mermaid-config'
import { removeMermaidErrorNode } from './mermaid-error-node'

type MermaidApi = typeof mermaidNamespace

// Why: mermaid is ~650KB and only needed when a diagram actually renders, yet a
// static import drags it into the eager startup chunk (it is reachable from the
// sidebar comment-markdown path). Load it on first render and cache the promise
// so subsequent diagrams reuse the same module instance.
let mermaidModulePromise: Promise<MermaidApi> | null = null
function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid').then((mod) => mod.default)
  }
  return mermaidModulePromise
}

type MermaidBlockProps = {
  content: string
  isDark: boolean
  htmlLabels?: boolean
}

// Why: mermaid.render() manipulates global DOM state (element IDs, internal
// parser state). Running multiple renders concurrently causes race conditions
// where one render can clobber another's temporary DOM node. Serializing all
// render calls through a single promise chain avoids this.
//
// The queue is replaced with a fresh promise after each render completes so
// that old .then() closures (which capture containerRef, content, and id)
// become unreachable and can be GC'd. Without this, the chain grows with
// every MermaidBlock mount/unmount cycle for the lifetime of the renderer.
let renderQueue: Promise<void> = Promise.resolve()

function enqueueRender(fn: () => Promise<void>): void {
  renderQueue = renderQueue.then(fn, fn).then(() => {
    // Why: collapse the chain back to a single resolved promise so previous
    // closures do not remain reachable through a growing .then() chain.
    renderQueue = Promise.resolve()
  })
}

/**
 * Renders a mermaid diagram string as SVG. Falls back to raw source with an
 * error banner if the syntax is invalid — never breaks the rest of the preview.
 */
export default function MermaidBlock({
  content,
  isDark,
  htmlLabels = false
}: MermaidBlockProps): React.JSX.Element {
  const id = useId().replace(/:/g, '_')
  const [error, setError] = useState<string | null>(null)
  const [svg, setSvg] = useState('')
  const sanitizedMarkup = (() => ({ __html: svg }))()

  useEffect(() => {
    let cancelled = false

    const render = async (): Promise<void> => {
      try {
        const mermaid = await loadMermaid()
        if (cancelled) {
          return
        }
        // Why: Mermaid stores initialize() config in global module state. Apply
        // the config inside the same serialized render task so another
        // MermaidBlock cannot overwrite htmlLabels/theme between initialize()
        // and render(), which would make markdown preview fall back to the
        // broken foreignObject label path again.
        mermaid.initialize(getMermaidConfig(isDark, htmlLabels))
        const { svg } = await mermaid.render(`mermaid-${id}`, content)
        if (!cancelled) {
          // Why: although mermaid uses DOMPurify internally, we add an explicit
          // sanitization pass as defense-in-depth against XSS in case upstream
          // behaviour changes or a mermaid version ships without sanitization.
          setSvg(DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } }))
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Invalid mermaid syntax')
          // Mermaid leaves an error element in the DOM on failure — clean it up.
          removeMermaidErrorNode(`mermaid-${id}`)
        }
      }
    }

    // Serialize render calls through a module-level queue to avoid race
    // conditions from concurrent mermaid.render() invocations.
    enqueueRender(render)
    return () => {
      cancelled = true
    }
  }, [content, htmlLabels, isDark, id])

  if (error) {
    return (
      <div className="mermaid-block [&_svg]:h-auto [&_svg]:max-w-full">
        <div className="mb-[0.5em] text-[0.85em] text-[color:var(--warning)]">
          {translate('auto.components.editor.MermaidBlock.dcc132e691', 'Diagram error:')}
          {error}
        </div>
        <pre>
          <code>{content}</code>
        </pre>
      </div>
    )
  }

  return (
    <div
      className="mermaid-block [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={sanitizedMarkup}
    />
  )
}
