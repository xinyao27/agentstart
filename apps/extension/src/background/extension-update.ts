// Why: Chrome reads an unpacked extension once and never watches its directory again, so a daemon
// upgrade that stages new code on disk changes nothing until something calls chrome.runtime.reload.
// The extension performing its own replacement is the only way to get there: the code that is
// running is the old bundle, and it is the one that has to hand over.

const RELOADED_VERSION_KEY = 'extensionBundleReloadedVersion'
const OPEN_PAGE_POLL_INTERVAL_MS = 2_000
const OPEN_PAGE_POLL_ATTEMPTS = 15

export type ExtensionVersionChange = {
  bundleVersion?: string | null
  daemonVersion?: string | null
}

export async function applyExtensionVersionChange(change: ExtensionVersionChange): Promise<void> {
  const currentVersion = chrome.runtime.getManifest().version
  const bundleVersion = change.bundleVersion ?? null
  if (bundleVersion === null) {
    // No bundle is managed on disk, so this install came from the Web Store: Chrome owns the code
    // and the only lever here is asking it to check sooner than its own multi-hour cycle.
    if (change.daemonVersion && change.daemonVersion !== currentVersion) {
      await requestStoreUpdateCheck()
    }
    return
  }
  if (bundleVersion === currentVersion || (await readReloadedVersion()) === bundleVersion) {
    return
  }
  // Why: recorded before the reload rather than after, so a reload that loads the same bytes again
  // cannot turn into a loop that reloads the extension on every single bootstrap.
  await chrome.storage.session.set({ [RELOADED_VERSION_KEY]: bundleVersion })
  await waitForNoOpenPage()
  chrome.runtime.reload()
}

async function waitForNoOpenPage(): Promise<void> {
  for (let attempt = 0; attempt < OPEN_PAGE_POLL_ATTEMPTS; attempt += 1) {
    if (!(await hasOpenPage())) {
      return
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, OPEN_PAGE_POLL_INTERVAL_MS)
    })
  }
}

async function hasOpenPage(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['TAB', 'POPUP', 'SIDE_PANEL', 'DEVELOPER_TOOLS']
  })
  return contexts.length > 0
}

async function readReloadedVersion(): Promise<string | null> {
  const stored: unknown = await chrome.storage.session.get(RELOADED_VERSION_KEY)
  const value =
    typeof stored === 'object' && stored !== null ? Reflect.get(stored, RELOADED_VERSION_KEY) : null
  return typeof value === 'string' ? value : null
}

async function requestStoreUpdateCheck(): Promise<void> {
  try {
    await chrome.runtime.requestUpdateCheck()
  } catch {
    // Chrome rejects the check while the listing is unpublished or throttled; neither changes what
    // this extension should do next, so there is nothing to report.
  }
}
