import type { PRCheckAnnotation } from '@agentstart/protocol/hosted-review/review-types'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { ArrowSquareOut as ExternalLink } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'

import {
  cancelAnnotationRevealFrame,
  getOpenableAnnotationLine,
  openAnnotationLocation
} from './check-annotation-open'

export function CheckRunAnnotations({
  annotations,
  worktreeId
}: {
  annotations: PRCheckAnnotation[]
  worktreeId: string | null
}): React.JSX.Element {
  const revealRafRef = React.useRef<number | null>(null)
  const revealInnerRafRef = React.useRef<number | null>(null)
  React.useEffect(
    () => () => {
      cancelAnnotationRevealFrame(revealRafRef)
      cancelAnnotationRevealFrame(revealInnerRafRef)
    },
    []
  )
  const openAnnotation = (path: string, line: number) => {
    if (!worktreeId) {
      return
    }
    openAnnotationLocation({ worktreeId, path, line, revealRafRef, revealInnerRafRef })
  }

  return (
    <section className="border-border bg-background rounded-md border">
      <div className="border-border border-b px-3 py-2 text-sm font-medium">
        {translate('auto.components.editor.CheckRunDetailsPanel.f2fe8a4e8f', 'Annotations')}
      </div>
      <div className="divide-border/50 divide-y">
        {annotations.map((annotation, index) => {
          const openable = worktreeId ? getOpenableAnnotationLine(annotation) : null
          const locationLabel = `${
            annotation.path ??
            translate('auto.components.editor.CheckRunDetailsPanel.cdbfda4dec', 'Annotation')
          }${annotation.startLine ? `:${annotation.startLine}` : ''}`
          return (
            <div key={`${annotation.path ?? 'annotation'}-${index}`} className="px-3 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {openable ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    type="button"
                    onClick={() => openAnnotation(openable.path, openable.line)}
                    title={translate(
                      'auto.components.editor.CheckRunDetailsPanel.5e2a9c3f88',
                      'Open file at this line'
                    )}
                    className="group text-primary h-auto min-w-0 border-0 p-0 font-mono break-all hover:underline"
                  >
                    <span className="min-w-0 text-left break-all">{locationLabel}</span>
                    <ExternalLink className="size-3 shrink-0 opacity-70" />
                  </Button>
                ) : (
                  <span className="text-muted-foreground min-w-0 font-mono text-xs break-all">
                    {locationLabel}
                  </span>
                )}
                {annotation.annotationLevel && (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {annotation.annotationLevel}
                  </span>
                )}
              </div>
              {annotation.title && (
                <div className="text-foreground mt-2 text-sm font-medium">{annotation.title}</div>
              )}
              <div className="text-foreground mt-2 text-sm break-words">{annotation.message}</div>
              {annotation.rawDetails && (
                <pre className="bg-muted/40 text-muted-foreground scrollbar-sleek mt-2 max-h-60 overflow-auto rounded p-3 font-mono text-xs whitespace-pre-wrap">
                  {annotation.rawDetails}
                </pre>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
