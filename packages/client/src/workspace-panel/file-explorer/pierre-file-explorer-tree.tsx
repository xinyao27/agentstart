import type { FileTreeRenameEvent } from '@pierre/trees'
import { FileTree, useFileTree } from '@pierre/trees/react'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { basename, normalizeRelativePath } from '~renderer/path'

import { PIERRE_FILE_TREE_STYLE, PIERRE_FILE_TREE_UNSAFE_CSS } from '../pierre-file-tree-theme'
import { usePierreFileTreeDragPayload } from '../use-pierre-file-tree-drag-payload'
import { usePierreFileTreeFlash } from '../use-pierre-file-tree-flash'
import type { PierreFileExplorerTreeProps } from './pierre-file-explorer-tree-contract'
import {
  buildPierreFileTreeData,
  buildPierreGitStatusEntries,
  getCanonicalParentPath,
  NEW_FILE_NAME,
  NEW_FOLDER_NAME
} from './pierre-file-tree-data'
import { clearPierreRenameInput } from './pierre-rename-input'
import type { InlineInput } from './row'

export type { PierreFileExplorerTreeHandle } from './pierre-file-explorer-tree-contract'

export function PierreFileExplorerTree({
  worktreePath,
  rowProjection,
  expandedPaths,
  selectedPaths,
  flashingPath,
  inlineInput,
  statusByRelativePath,
  ignoredByRelativePath,
  onScrollElementChange,
  onActivateFile,
  onDoubleClickFile,
  onToggleDirectory,
  onSelectionChange,
  onRenameNode,
  onInlineInputSubmit,
  onInlineInputCancel,
  onMoveDrop,
  onDragSourceChange,
  ref,
  renderContextMenu
}: PierreFileExplorerTreeProps): React.JSX.Element {
  const treeData = (() => buildPierreFileTreeData(rowProjection))()
  const gitStatus = (() =>
    buildPierreGitStatusEntries(statusByRelativePath, ignoredByRelativePath))()
  const copiedPaths = (() =>
    new Set(
      [...statusByRelativePath]
        .filter(([, status]) => status === 'copied')
        .map(([path]) => normalizeRelativePath(path))
    ))()
  const copiedPathsRef = useRef(copiedPaths)
  const expandedCanonicalPaths = (() =>
    [...expandedPaths]
      .map((path) => treeData.canonicalPathByAbsolutePath.get(path))
      .filter((path): path is string => Boolean(path)))()
  const selectedCanonicalPaths = (() =>
    [...selectedPaths]
      .map((path) => treeData.canonicalPathByAbsolutePath.get(path))
      .filter((path): path is string => Boolean(path)))()
  const dragPayloadHandlers = usePierreFileTreeDragPayload({
    onDragSourceChange,
    selectedPaths,
    treeData
  })

  const callbacksRef = useRef({
    inlineInput,
    onInlineInputSubmit,
    onMoveDrop,
    onRenameNode,
    onSelectionChange,
    treeData,
    worktreePath
  })
  const resettingRef = useRef(false)

  useLayoutEffect(() => {
    copiedPathsRef.current = copiedPaths
    callbacksRef.current = {
      inlineInput,
      onInlineInputSubmit,
      onMoveDrop,
      onRenameNode,
      onSelectionChange,
      treeData,
      worktreePath
    }
  }, [
    copiedPaths,
    inlineInput,
    onInlineInputSubmit,
    onMoveDrop,
    onRenameNode,
    onSelectionChange,
    treeData,
    worktreePath
  ])

  const { model } = useFileTree({
    paths: treeData.paths,
    flattenEmptyDirectories: false,
    initialExpansion: 'closed',
    initialExpandedPaths: expandedCanonicalPaths,
    initialSelectedPaths: selectedCanonicalPaths,
    itemHeight: 26,
    overscan: 20,
    stickyFolders: false,
    icons: { set: 'complete', colored: false },
    gitStatus,
    composition: {
      contextMenu: { enabled: true, triggerMode: 'right-click' }
    },
    dragAndDrop: {
      onDropComplete: ({ draggedPaths, target }) => {
        const callbacks = callbacksRef.current
        const destinationDirectory = target.directoryPath
          ? callbacks.treeData.nodeByCanonicalPath.get(target.directoryPath)?.path
          : callbacks.worktreePath
        if (!destinationDirectory) {
          return
        }
        for (const path of draggedPaths) {
          const node = callbacks.treeData.nodeByCanonicalPath.get(path)
          if (node) {
            callbacks.onMoveDrop(node.path, destinationDirectory)
          }
        }
      }
    },
    renaming: {
      onRename: (event: FileTreeRenameEvent) => {
        const callbacks = callbacksRef.current
        const newName = basename(event.destinationPath)
        const sourceName = basename(event.sourcePath)
        if (sourceName === NEW_FILE_NAME || sourceName === NEW_FOLDER_NAME) {
          callbacks.onInlineInputSubmit(newName)
          return
        }
        const node = callbacks.treeData.nodeByCanonicalPath.get(event.sourcePath)
        if (node) {
          if (callbacks.inlineInput?.type === 'rename') {
            callbacks.onInlineInputSubmit(newName)
          } else {
            callbacks.onRenameNode(node, newName)
          }
        }
      }
    },
    onSelectionChange: (paths) => {
      if (resettingRef.current) {
        return
      }
      const callbacks = callbacksRef.current
      callbacks.onSelectionChange(
        new Set(
          paths.flatMap((path) => {
            const node = callbacks.treeData.nodeByCanonicalPath.get(path)
            return node ? [node.path] : []
          })
        )
      )
    },
    renderRowDecoration: ({ item }) =>
      copiedPathsRef.current.has(item.path.replace(/\/$/u, ''))
        ? {
            text: 'C',
            title: translate(
              'auto.components.right.sidebar.PierreFileExplorerTree.copied',
              'Copied'
            )
          }
        : null,
    unsafeCSS: PIERRE_FILE_TREE_UNSAFE_CSS
  })
  usePierreFileTreeFlash({ flashingPath, model, treeData })

  const expandedPathsRef = useRef(expandedPaths)
  const treeDataRef = useRef(treeData)
  const onToggleDirectoryRef = useRef(onToggleDirectory)

  useLayoutEffect(() => {
    expandedPathsRef.current = expandedPaths
    treeDataRef.current = treeData
    onToggleDirectoryRef.current = onToggleDirectory
  }, [expandedPaths, onToggleDirectory, treeData])

  useLayoutEffect(() => {
    resettingRef.current = true
    model.resetPaths(treeData.paths, { initialExpandedPaths: expandedCanonicalPaths })
    resettingRef.current = false
  }, [expandedCanonicalPaths, model, treeData.paths])

  useLayoutEffect(() => {
    model.setGitStatus(gitStatus)
  }, [gitStatus, model])

  useLayoutEffect(() => {
    const target = new Set(selectedCanonicalPaths)
    if (
      target.size === model.getSelectedPaths().length &&
      model.getSelectedPaths().every((path) => target.has(path))
    ) {
      return
    }
    resettingRef.current = true
    for (const selectedPath of model.getSelectedPaths()) {
      if (!target.has(selectedPath)) {
        model.getItem(selectedPath)?.deselect()
      }
    }
    for (const selectedPath of target) {
      model.getItem(selectedPath)?.select()
    }
    resettingRef.current = false
  }, [model, selectedCanonicalPaths])

  useEffect(
    () =>
      model.subscribe(() => {
        if (resettingRef.current) {
          return
        }
        for (const [canonicalPath, node] of treeDataRef.current.nodeByCanonicalPath) {
          if (!node.isDirectory) {
            continue
          }
          const item = model.getItem(canonicalPath)
          if (!item || !('isExpanded' in item)) {
            continue
          }
          if (item.isExpanded() !== expandedPathsRef.current.has(node.path)) {
            onToggleDirectoryRef.current(node)
          }
        }
      }),
    [model]
  )

  const lastInlineInputRef = useRef<InlineInput | null>(null)
  useLayoutEffect(() => {
    if (!inlineInput || lastInlineInputRef.current === inlineInput) {
      return
    }
    lastInlineInputRef.current = inlineInput
    if (inlineInput.type === 'rename' && inlineInput.existingPath) {
      const path = treeData.canonicalPathByAbsolutePath.get(inlineInput.existingPath)
      if (path) {
        model.startRenaming(path)
      }
      return
    }
    const parentPath = getCanonicalParentPath(worktreePath, inlineInput.parentPath)
    const placeholderName = inlineInput.type === 'folder' ? NEW_FOLDER_NAME : NEW_FILE_NAME
    const placeholderPath = `${parentPath}${placeholderName}${
      inlineInput.type === 'folder' ? '/' : ''
    }`
    model.add(placeholderPath)
    model.startRenaming(placeholderPath, { removeIfCanceled: true })
    queueMicrotask(() => {
      const input = model
        .getFileTreeContainer()
        ?.shadowRoot?.querySelector<HTMLInputElement>('[data-item-rename-input]')
      if (!input) {
        return
      }
      // Why: Trees derives the rename value from the required placeholder path,
      // while AgentStart's new-file flow intentionally starts with an empty field.
      clearPierreRenameInput(input)
    })
  }, [inlineInput, model, treeData.canonicalPathByAbsolutePath, worktreePath])

  useLayoutEffect(() => {
    const container = model.getFileTreeContainer()
    const scrollElement = container?.shadowRoot?.querySelector<HTMLDivElement>(
      '[data-file-tree-virtualized-scroll="true"]'
    )
    onScrollElementChange(scrollElement ?? null)
    return () => {
      onScrollElementChange(null)
    }
  }, [model, onScrollElementChange])

  useImperativeHandle(
    ref,
    () => ({
      scrollToAbsolutePath: (path, align = 'nearest') => {
        const canonicalPath = treeDataRef.current.canonicalPathByAbsolutePath.get(path)
        if (canonicalPath) {
          model.scrollToPath(canonicalPath, { focus: false, offset: align })
        }
      }
    }),
    [model]
  )

  return (
    <FileTree
      model={model}
      className="agentstart-pierre-file-tree bg-sidebar block h-full min-h-0 w-full"
      style={PIERRE_FILE_TREE_STYLE}
      onClickCapture={(event) => {
        const eventPath = event.nativeEvent.composedPath()
        const button = eventPath.find(
          (entry): entry is HTMLButtonElement => entry instanceof HTMLButtonElement
        )
        // Why: Pierre selects rows without moving document focus into its Shadow DOM,
        // so explorer-scoped shortcuts otherwise still belong to the previous surface.
        button?.focus({ preventScroll: true })
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return
        }
        const row = eventPath.find(
          (entry): entry is HTMLElement =>
            entry instanceof HTMLElement && entry.dataset.type === 'item'
        )
        const canonicalPath = row?.dataset.itemPath
        const node = canonicalPath ? treeData.nodeByCanonicalPath.get(canonicalPath) : null
        if (node && !node.isDirectory) {
          onActivateFile(node)
        }
      }}
      onDragStart={dragPayloadHandlers.onDragStart}
      onDragEndCapture={dragPayloadHandlers.onDragEndCapture}
      onDoubleClickCapture={(event) => {
        const row = event.nativeEvent
          .composedPath()
          .find(
            (entry): entry is HTMLElement =>
              entry instanceof HTMLElement && entry.dataset.type === 'item'
          )
        const canonicalPath = row?.dataset.itemPath
        const node = canonicalPath ? treeData.nodeByCanonicalPath.get(canonicalPath) : null
        if (node && !node.isDirectory) {
          onDoubleClickFile(node)
        }
      }}
      onKeyDownCapture={(event) => {
        const renameInput = event.nativeEvent
          .composedPath()
          .find(
            (entry): entry is HTMLInputElement =>
              entry instanceof HTMLInputElement && entry.hasAttribute('data-item-rename-input')
          )
        if (renameInput) {
          if (event.key === 'Escape') {
            queueMicrotask(onInlineInputCancel)
          }
          return
        }
        if (event.key !== ' ') {
          return
        }
        const focusedPath = model.getFocusedPath()
        const node = focusedPath ? treeData.nodeByCanonicalPath.get(focusedPath) : null
        if (node && !node.isDirectory) {
          event.preventDefault()
          onActivateFile(node)
        }
      }}
      renderContextMenu={(item, context) => {
        const node = treeData.nodeByCanonicalPath.get(item.path)
        if (!node) {
          context.close()
          return null
        }
        const treeItem = model.getItem(item.path)
        const isExpanded = Boolean(treeItem && 'isExpanded' in treeItem && treeItem.isExpanded())
        return renderContextMenu(node, context, isExpanded)
      }}
    />
  )
}
