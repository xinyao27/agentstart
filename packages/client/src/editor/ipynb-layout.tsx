import type { Dispatch, SetStateAction } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { FloppyDisk as Save } from '~renderer/icons/hugeicons'
import type { ShortcutKeyComboDetails } from '~renderer/keyboard-input/use-shortcut-label'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

import {
  EditableTextCell,
  getCellKey,
  hasOwnDraft,
  MarkdownCell,
  MemoizedCodeCell
} from './ipynb-cell-editor'
import { NotebookCellHeader, NotebookHeaderButton } from './ipynb-cell-header'
import { CellOutputs } from './ipynb-outputs'
import type { IpynbCellKind, ParsedIpynb } from './ipynb-types'

type IpynbLayoutProps = {
  filePath: string
  notebook: ParsedIpynb
  runError: string | null
  saveShortcut: ShortcutKeyComboDetails
  sourceDrafts: Record<string, string>
  runningCellIndex: number | null
  editingCellKey: string | null
  setEditingCellKey: Dispatch<SetStateAction<string | null>>
  pendingRunCellIndex: number | null
  onSave: () => Promise<void>
  onRunCell: (index: number) => void
  onUpdateCellKind: (index: number, kind: IpynbCellKind) => void
  onInsertCell: (index: number, kind: IpynbCellKind) => void
  onMoveCell: (index: number, direction: -1 | 1) => void
  onDeleteCell: (index: number) => void
  onUpdateCellSource: (index: number, source: string) => void
  onCancelPendingRun: () => void
  onConfirmPendingRun: () => void
}

export function IpynbLayout(props: IpynbLayoutProps): React.JSX.Element {
  const { notebook } = props
  return (
    <>
      <div className="border-border/60 bg-background text-muted-foreground sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-2 text-xs">
        <span className="text-foreground font-medium">{props.filePath.split(/[/\\]/).pop()}</span>
        <span>
          {notebook.cells.length}{' '}
          {translate('auto.components.editor.IpynbViewer.07e7d96612', 'cells')}
        </span>
        <span>{notebook.language}</span>
        {notebook.kernelName ? <span>{notebook.kernelName}</span> : null}
        {props.runError ? <span className="text-destructive">{props.runError}</span> : null}
        <div className="ml-auto flex items-center gap-2">
          <NotebookHeaderButton
            label={translate('auto.components.editor.IpynbViewer.15ec40a735', 'Save notebook')}
            shortcut={props.saveShortcut}
            onClick={() => void props.onSave()}
          >
            <Save className="size-3.5" />
          </NotebookHeaderButton>
          <span className="border-border bg-muted text-muted-foreground rounded-sm border px-1.5 py-0.5 font-medium">
            {translate('auto.components.editor.IpynbViewer.329764e9fc', 'BETA')}
          </span>
          <span className="font-mono">
            {translate('auto.components.editor.IpynbViewer.8c3b21369a', 'nbformat')}
            {notebook.nbformat}
          </span>
        </div>
      </div>
      <div className="mx-auto flex max-w-[980px] flex-col gap-3 px-5 py-5">
        {notebook.cells.length === 0 ? (
          <div className="border-border bg-background text-muted-foreground flex items-center justify-center rounded-md border p-8 text-sm">
            {translate('auto.components.editor.IpynbViewer.d6f37a640b', 'Empty notebook')}
          </div>
        ) : (
          notebook.cells.map((cell, index) => {
            const cellKey = getCellKey(cell, index)
            const source = hasOwnDraft(props.sourceDrafts, cellKey)
              ? (props.sourceDrafts[cellKey] ?? '')
              : cell.source
            return (
              <section
                key={cellKey}
                className="border-border bg-background overflow-hidden rounded-md border"
              >
                <NotebookCellHeader
                  cell={cell}
                  index={index}
                  running={props.runningCellIndex === index}
                  canMoveUp={index > 0}
                  canMoveDown={index < notebook.cells.length - 1}
                  onRun={() => props.onRunCell(index)}
                  onKindChange={(kind) => props.onUpdateCellKind(index, kind)}
                  onInsertAbove={(kind) => props.onInsertCell(index, kind)}
                  onInsertBelow={(kind) => props.onInsertCell(index + 1, kind)}
                  onMoveUp={() => props.onMoveCell(index, -1)}
                  onMoveDown={() => props.onMoveCell(index, 1)}
                  onDelete={() => props.onDeleteCell(index)}
                />
                {cell.kind === 'markdown' ? (
                  <div className="grid gap-0 lg:grid-cols-2">
                    <EditableTextCell
                      source={source}
                      onChange={(nextSource) => props.onUpdateCellSource(index, nextSource)}
                    />
                    <div className="border-border/50 border-t lg:border-t-0 lg:border-l">
                      <MarkdownCell source={source} />
                    </div>
                  </div>
                ) : cell.kind === 'code' ? (
                  <MemoizedCodeCell
                    cell={cell}
                    source={source}
                    active={props.editingCellKey === cellKey}
                    onActivate={() => props.setEditingCellKey(cellKey)}
                    onDeactivate={() =>
                      props.setEditingCellKey((current) => (current === cellKey ? null : current))
                    }
                    onChange={(nextSource) => props.onUpdateCellSource(index, nextSource)}
                    onSaveRequest={props.onSave}
                  />
                ) : (
                  <EditableTextCell
                    source={source}
                    onChange={(nextSource) => props.onUpdateCellSource(index, nextSource)}
                  />
                )}
                <CellOutputs cell={cell} />
              </section>
            )
          })
        )}
      </div>
      <Dialog
        open={props.pendingRunCellIndex !== null}
        onOpenChange={(open) => {
          if (!open) {
            props.onCancelPendingRun()
          }
        }}
      >
        <DialogContent className="max-w-md sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-sm">
              {translate('auto.components.editor.IpynbViewer.9e06ae5d36', 'Run Notebook Code?')}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {translate(
                'auto.components.editor.IpynbViewer.10ed04a685',
                'Notebook cells execute local Python on this machine from the notebook folder. Only run cells from files you trust.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="sm" onClick={props.onCancelPendingRun}>
              {translate('auto.components.editor.IpynbViewer.7f0d7077c6', 'Cancel')}
            </Button>
            <Button type="button" size="sm" autoFocus onClick={props.onConfirmPendingRun}>
              {translate('auto.components.editor.IpynbViewer.859bf9fc21', 'Run cell')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
