import React from 'react'
import { reportReactErrorBoundaryCrash } from '~renderer/crash-report/react-error-boundary'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'

type Props = {
  fileId: string
  children: React.ReactNode
}

type State = {
  error: Error | null
  fileId: string
}

// Why: a thrown exception inside the TipTap/ProseMirror render or in the
// effect that runs `setContent` + empty-list repair on external-reload
// would escape to the React root and — without this boundary — cause React
// 18 to unmount the entire renderer subtree, blacking out the whole AgentStart
// window (see issue #826). Scoping the boundary to the rich-markdown editor
// contains the failure to the affected pane so the rest of the workspace
// stays usable. Re-keying on `fileId` resets the boundary when the user
// switches tabs so a transient failure doesn't permanently disable the
// rich editor for that pane.
export class RichMarkdownErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, fileId: this.props.fileId }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.fileId !== state.fileId) {
      return { error: null, fileId: props.fileId }
    }

    return null
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[RichMarkdownEditor] render crash contained by boundary', error, info)
    void reportReactErrorBoundaryCrash({
      boundaryId: 'editor.rich-markdown',
      surface: 'rich-markdown-editor',
      error,
      errorInfo: info
    })
  }

  handleReset = (): void => {
    this.setState({ error: null })
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="text-muted-foreground flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center text-sm">
          <div>
            {translate(
              'auto.components.editor.RichMarkdownErrorBoundary.dfdf1cacd4',
              'The rich markdown editor hit an unexpected error and was reset to keep the rest of AgentStart responsive.'
            )}
          </div>
          <div className="text-xs opacity-70">
            {translate(
              'auto.components.editor.RichMarkdownErrorBoundary.4a5de9f2f0',
              'Switch to source mode, or click retry to reload the rich view.'
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-border/60 focus-visible:bg-accent py-1 text-xs"
            onClick={this.handleReset}
          >
            {translate('auto.components.editor.RichMarkdownErrorBoundary.aad0998127', 'Retry')}
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
