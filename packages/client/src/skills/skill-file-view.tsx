import type { SkillFileReadResult } from '@agentstart/protocol'
import { useEffect, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { readSkillManageDirFile } from '~renderer/runtime/skill-manage-client'
import CommentMarkdown from '~renderer/sidebar/comment-markdown'

export type SkillFileViewProps = {
  directoryPath: string
  relativePath: string
}

type FileViewState =
  | { status: 'loading' }
  | { status: 'markdown'; frontmatter: string | null; body: string; truncated: boolean }
  | { status: 'text'; content: string; truncated: boolean }
  | { status: 'error'; message: string }

type FileViewRequestState = {
  directoryPath: string
  relativePath: string
  view: FileViewState
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/
const MARKDOWN_EXTENSION_RE = /\.(?:md|markdown|mdx)$/i
const LOADING_FILE_VIEW: FileViewState = { status: 'loading' }

// Why: the markdown renderer has no frontmatter plugin, so a leading `---`
// block would parse as a setext heading and scramble the metadata. Split it out
// and show it verbatim rather than dropping it.
function splitFrontmatter(markdown: string): { frontmatter: string | null; body: string } {
  const normalized = markdown.replace(/^\uFEFF/, '')
  const match = FRONTMATTER_RE.exec(normalized)
  if (!match) {
    return { frontmatter: null, body: normalized }
  }
  return { frontmatter: match[1].trim() || null, body: normalized.slice(match[0].length) }
}

function describeReadFailure(
  reason: Extract<SkillFileReadResult, { ok: false }>['reason']
): string {
  switch (reason) {
    case 'invalid-path':
      return translate(
        'auto.components.skills.SkillFileView.invalidPath',
        'That file is no longer part of this skill.'
      )
    case 'binary':
      return translate(
        'auto.components.skills.SkillFileView.binary',
        'This looks like a binary file, so there is nothing to show here.'
      )
    case 'unreadable':
      return translate(
        'auto.components.skills.SkillFileView.unreadable',
        'Could not read this file from disk.'
      )
  }
}

function toViewState(relativePath: string, result: SkillFileReadResult): FileViewState {
  if (!result.ok) {
    return { status: 'error', message: describeReadFailure(result.reason) }
  }
  if (!MARKDOWN_EXTENSION_RE.test(relativePath)) {
    return { status: 'text', content: result.content, truncated: result.truncated }
  }
  return { status: 'markdown', ...splitFrontmatter(result.content), truncated: result.truncated }
}

export function SkillFileView({
  directoryPath,
  relativePath
}: SkillFileViewProps): React.JSX.Element {
  const [requestState, setRequestState] = useState<FileViewRequestState | null>(null)
  const state =
    requestState?.directoryPath === directoryPath && requestState.relativePath === relativePath
      ? requestState.view
      : LOADING_FILE_VIEW

  useEffect(() => {
    let cancelled = false
    readSkillManageDirFile({ directoryPath, relativePath })
      .then((result) => {
        if (!cancelled) {
          setRequestState({
            directoryPath,
            relativePath,
            view: toViewState(relativePath, result)
          })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRequestState({
            directoryPath,
            relativePath,
            view: { status: 'error', message: describeReadFailure('unreadable') }
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [directoryPath, relativePath])

  if (state.status === 'loading') {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <LoadingIndicator className="size-4" />
        {translate('auto.components.skills.SkillFileView.loading', 'Reading file…')}
      </div>
    )
  }

  if (state.status === 'error') {
    return <p className="text-muted-foreground text-sm">{state.message}</p>
  }

  return (
    <div className="space-y-3">
      {state.status === 'markdown' ? (
        <>
          {state.frontmatter ? (
            <pre className="border-border bg-muted text-muted-foreground border px-3 py-2.5 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap">
              {state.frontmatter}
            </pre>
          ) : null}
          {state.body.trim() ? (
            <CommentMarkdown variant="document" content={state.body} className="text-sm" />
          ) : (
            <p className="text-muted-foreground text-sm">
              {translate('auto.components.skills.SkillFileView.emptyBody', 'This file is empty.')}
            </p>
          )}
        </>
      ) : (
        <pre className="text-foreground font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
          {state.content.trim()
            ? state.content
            : translate('auto.components.skills.SkillFileView.emptyBody', 'This file is empty.')}
        </pre>
      )}
      {state.truncated ? (
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.skills.SkillFileView.truncated',
            'This file is too large to show in full. Open it from disk to read the rest.'
          )}
        </p>
      ) : null}
    </div>
  )
}
