import type {
  BrowserProjectBookmark,
  BrowserProjectBookmarkKind
} from '@agentstart/client/extension-bootstrap'

const ROOT_TITLE = 'AgentStart'
const MANAGED_TITLES = {
  dashboard: 'Dashboard',
  docs: 'Documentation',
  pr: 'Pull request',
  staging: 'Staging'
} satisfies Record<BrowserProjectBookmarkKind, string>
const KINDS = ['pr', 'staging', 'dashboard', 'docs'] as const

type ProjectBookmarkInput = {
  displayName: string
  projectId: string
}

export async function readProjectBookmarks(
  input: ProjectBookmarkInput
): Promise<{ enabled: boolean; links: BrowserProjectBookmark[] }> {
  validateIdentity(input)
  if (!(await chrome.permissions.contains({ permissions: ['bookmarks'] }))) {
    return { enabled: false, links: [] }
  }
  const folder = await findProjectFolder(input.projectId)
  return { enabled: true, links: folder ? linksFromFolder(folder) : [] }
}

export async function saveProjectBookmarks(
  input: ProjectBookmarkInput & { links: BrowserProjectBookmark[] }
): Promise<BrowserProjectBookmark[]> {
  validateIdentity(input)
  const links = normalizeLinks(input.links)
  if (!(await chrome.permissions.request({ permissions: ['bookmarks'] }))) {
    throw new Error('bookmarks_permission_denied')
  }
  const root = await findOrCreateRootFolder()
  const prefix = projectFolderPrefix(input.projectId)
  const existing = (root.children ?? []).find(
    (node) => node.url === undefined && node.title.startsWith(prefix)
  )
  const title = `${prefix}${sanitizeTitle(input.displayName)}`
  const folder = existing
    ? await updateFolder(existing, title)
    : await chrome.bookmarks.create({ parentId: root.id, title })
  await Promise.all(
    KINDS.map((kind) => reconcileLink(folder, kind, links.find((link) => link.kind === kind)?.url))
  )
  const refreshed = (await chrome.bookmarks.getSubTree(folder.id))[0]
  return refreshed ? linksFromFolder(refreshed) : []
}

async function findProjectFolder(
  projectId: string
): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
  const tree = await chrome.bookmarks.getTree()
  const root = findFolder(tree, (node) => node.title === ROOT_TITLE)
  if (!root) {
    return null
  }
  const prefix = projectFolderPrefix(projectId)
  return (
    (root.children ?? []).find((node) => node.url === undefined && node.title.startsWith(prefix)) ??
    null
  )
}

async function findOrCreateRootFolder(): Promise<chrome.bookmarks.BookmarkTreeNode> {
  const tree = await chrome.bookmarks.getTree()
  const existing = findFolder(tree, (node) => node.title === ROOT_TITLE)
  if (existing) {
    return existing
  }
  const browserRoot = tree[0]?.children?.find((node) => node.url === undefined) ?? tree[0]
  if (!browserRoot) {
    throw new Error('bookmarks_root_missing')
  }
  return chrome.bookmarks.create({ parentId: browserRoot.id, title: ROOT_TITLE })
}

function findFolder(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  predicate: (node: chrome.bookmarks.BookmarkTreeNode) => boolean
): chrome.bookmarks.BookmarkTreeNode | null {
  for (const node of nodes) {
    if (node.url === undefined && predicate(node)) {
      return node
    }
    const nested = node.children ? findFolder(node.children, predicate) : null
    if (nested) {
      return nested
    }
  }
  return null
}

async function updateFolder(
  folder: chrome.bookmarks.BookmarkTreeNode,
  title: string
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return folder.title === title ? folder : chrome.bookmarks.update(folder.id, { title })
}

async function reconcileLink(
  folder: chrome.bookmarks.BookmarkTreeNode,
  kind: BrowserProjectBookmarkKind,
  url: string | undefined
): Promise<void> {
  const title = MANAGED_TITLES[kind]
  const matches = (folder.children ?? []).filter((node) => node.url && node.title === title)
  if (!url) {
    await Promise.all(matches.map((node) => chrome.bookmarks.remove(node.id)))
    return
  }
  await (matches[0]
    ? chrome.bookmarks.update(matches[0].id, { title, url })
    : chrome.bookmarks.create({ parentId: folder.id, title, url }))
  await Promise.all(matches.slice(1).map((node) => chrome.bookmarks.remove(node.id)))
}

function linksFromFolder(folder: chrome.bookmarks.BookmarkTreeNode): BrowserProjectBookmark[] {
  return KINDS.flatMap((kind) => {
    const title = MANAGED_TITLES[kind]
    const url = (folder.children ?? []).find((node) => node.title === title)?.url
    return url ? [{ kind, url }] : []
  })
}

function normalizeLinks(links: BrowserProjectBookmark[]): BrowserProjectBookmark[] {
  const seen = new Set<BrowserProjectBookmarkKind>()
  return links.map((link) => {
    if (!KINDS.includes(link.kind) || seen.has(link.kind)) {
      throw new Error('project_bookmarks_invalid')
    }
    seen.add(link.kind)
    const url = new URL(link.url)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('project_bookmark_url_invalid')
    }
    return { kind: link.kind, url: url.href }
  })
}

function validateIdentity(input: ProjectBookmarkInput): void {
  if (!input.projectId.trim() || input.projectId.length > 200 || input.displayName.length > 200) {
    throw new Error('project_bookmarks_invalid')
  }
}

function projectFolderPrefix(projectId: string): string {
  return `AgentStart · ${projectId} · `
}

function sanitizeTitle(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim() || 'Project'
}
