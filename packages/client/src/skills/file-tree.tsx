import type { SkillDirectoryEntry } from '@agentstart/protocol'
import { createElement, useState } from 'react'
import { getFileTypeIcon } from '~renderer/file-presentation/icons'
import {
  CaretRight as ChevronRight,
  Folder,
  FolderOpen,
  type IconProps
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { ScrollArea } from '~renderer/ui/scroll-area'

import { buildSkillFileTree, flattenSkillFileTree, type SkillFileTreeNode } from './file-tree-model'
import { formatFileSize } from './labels'

export type SkillFileTreeProps = {
  files: readonly SkillDirectoryEntry[]
  selectedRelativePath: string
  onSelect: (relativePath: string) => void
}

const NO_COLLAPSED_DIRECTORIES: ReadonlySet<string> = new Set()

function rowIndentStyle(depth: number): React.CSSProperties {
  // Why: the Worktree Explorer's indent step, so a skill's tree reads the same
  // as the repository tree next to it.
  return { paddingLeft: `${depth * 16 + 8}px` }
}

export function SkillFileTree({
  files,
  selectedRelativePath,
  onSelect
}: SkillFileTreeProps): React.JSX.Element {
  // Why: a skill directory is small, so everything starts open and the state
  // only has to remember what the user closed.
  const [collapsedDirectories, setCollapsedDirectories] =
    useState<ReadonlySet<string>>(NO_COLLAPSED_DIRECTORIES)
  const rows = (() => flattenSkillFileTree(buildSkillFileTree(files), collapsedDirectories))()

  const toggleDirectory = (relativePath: string): void => {
    setCollapsedDirectories((current) => {
      const next = new Set(current)
      if (!next.delete(relativePath)) {
        next.add(relativePath)
      }
      return next
    })
  }

  return (
    // Why: the cap must sit on the viewport — with only a max-height, the root has
    // no definite height for the viewport's h-full to resolve against, so the
    // content would overflow the root instead of scrolling.
    <ScrollArea viewportClassName="max-h-52">
      <div role="tree" className="py-1">
        {rows.map((node) =>
          node.kind === 'directory' ? (
            <SkillFileTreeDirectoryRow
              key={node.relativePath}
              node={node}
              expanded={!collapsedDirectories.has(node.relativePath)}
              onToggle={toggleDirectory}
            />
          ) : (
            <SkillFileTreeFileRow
              key={node.relativePath}
              node={node}
              selected={node.relativePath === selectedRelativePath}
              onSelect={onSelect}
            />
          )
        )}
      </div>
    </ScrollArea>
  )
}

function SkillFileTreeDirectoryRow({
  node,
  expanded,
  onToggle
}: {
  node: Extract<SkillFileTreeNode, { kind: 'directory' }>
  expanded: boolean
  onToggle: (relativePath: string) => void
}): React.JSX.Element {
  const FolderIcon = expanded ? FolderOpen : Folder
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      role="treeitem"
      aria-expanded={expanded}
      className="w-full justify-start pr-2 font-normal"
      style={rowIndentStyle(node.depth)}
      onClick={() => onToggle(node.relativePath)}
    >
      <ChevronRight
        className={`text-muted-foreground size-3 shrink-0 transition-transform${
          expanded ? ' rotate-90' : ''
        }`}
      />
      <FolderIcon className="text-muted-foreground size-3 shrink-0" />
      <span className="truncate">{node.name}</span>
    </Button>
  )
}

function SkillFileTreeFileRow({
  node,
  selected,
  onSelect
}: {
  node: Extract<SkillFileTreeNode, { kind: 'file' }>
  selected: boolean
  onSelect: (relativePath: string) => void
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="picker-row"
      size="xs"
      role="treeitem"
      aria-selected={selected}
      className="w-full justify-start pr-2"
      style={rowIndentStyle(node.depth)}
      onClick={() => onSelect(node.relativePath)}
    >
      <span className="size-3 shrink-0" />
      <FileTypeIcon path={node.relativePath} className="text-muted-foreground size-3 shrink-0" />
      <span className="truncate">{node.name}</span>
      <span className="text-muted-foreground ml-auto shrink-0 pl-2 text-[10px]">
        {formatFileSize(node.size)}
      </span>
    </Button>
  )
}

function FileTypeIcon({ path, ...props }: IconProps & { path: string }): React.JSX.Element {
  return createElement(getFileTypeIcon(path), props)
}
