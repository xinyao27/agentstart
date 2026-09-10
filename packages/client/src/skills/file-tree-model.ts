import type { SkillDirectoryEntry } from '@agentstart/protocol'

export const SKILL_FILE_NAME = 'SKILL.md'

export type SkillFileTreeNode =
  | { kind: 'file'; name: string; relativePath: string; depth: number; size: number }
  | {
      kind: 'directory'
      name: string
      relativePath: string
      depth: number
      children: SkillFileTreeNode[]
    }

type DirectoryDraft = {
  name: string
  relativePath: string
  directories: Map<string, DirectoryDraft>
  files: SkillDirectoryEntry[]
}

function createDraft(name: string, relativePath: string): DirectoryDraft {
  return { name, relativePath, directories: new Map(), files: [] }
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
}

function finalize(draft: DirectoryDraft, depth: number): SkillFileTreeNode[] {
  // Why: directories before files is the Worktree Explorer's ordering, and the
  // tree is unreadable if the two interleave.
  const directories = [...draft.directories.values()]
    .sort(byName)
    .map<SkillFileTreeNode>((child) => ({
      kind: 'directory',
      name: child.name,
      relativePath: child.relativePath,
      depth,
      children: finalize(child, depth + 1)
    }))
  const files = draft.files
    .map<SkillFileTreeNode>((file) => ({
      kind: 'file',
      name: file.relativePath.slice(file.relativePath.lastIndexOf('/') + 1),
      relativePath: file.relativePath,
      depth,
      size: file.size
    }))
    .sort(byName)
  // Why: SKILL.md is the skill's entry point and the one file every skill has,
  // so it outranks even the directories at the root of the tree.
  const skillFile = files.find((file) => file.relativePath === SKILL_FILE_NAME)
  const rest = skillFile ? files.filter((file) => file !== skillFile) : files
  return skillFile ? [skillFile, ...directories, ...rest] : [...directories, ...files]
}

/** Rebuilds the skill's directory shape from its slash-separated file paths. */
export function buildSkillFileTree(files: readonly SkillDirectoryEntry[]): SkillFileTreeNode[] {
  const root = createDraft('', '')
  for (const file of files) {
    const segments = file.relativePath.split('/')
    let current = root
    for (const segment of segments.slice(0, -1)) {
      const relativePath = current.relativePath ? `${current.relativePath}/${segment}` : segment
      const existing = current.directories.get(segment) ?? createDraft(segment, relativePath)
      current.directories.set(segment, existing)
      current = existing
    }
    current.files.push(file)
  }
  return finalize(root, 0)
}

/** The visible rows, depth-first, skipping the contents of collapsed folders. */
export function flattenSkillFileTree(
  nodes: readonly SkillFileTreeNode[],
  collapsedDirectories: ReadonlySet<string>
): SkillFileTreeNode[] {
  const rows: SkillFileTreeNode[] = []
  for (const node of nodes) {
    rows.push(node)
    if (node.kind === 'directory' && !collapsedDirectories.has(node.relativePath)) {
      rows.push(...flattenSkillFileTree(node.children, collapsedDirectories))
    }
  }
  return rows
}
