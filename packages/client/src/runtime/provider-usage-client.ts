import { openProviderUsageTarget } from './provider-usage-target'

export const claudeProviderUsageClient = {
  getScanState: async () => {
    const client = await openProviderUsageTarget('claude')
    if (!client) {
      throw new Error('Provider usage capability not available')
    }
    return client.getScanState()
  },
  setEnabled: async (input: { enabled: boolean }) => {
    const client = await openProviderUsageTarget('claude')
    if (!client) {
      throw new Error('Provider usage capability not available')
    }
    return client.setEnabled(input)
  },
  refresh: async (input: { force?: boolean }) => {
    const client = await openProviderUsageTarget('claude')
    if (!client) {
      throw new Error('Provider usage capability not available')
    }
    return client.refresh(input)
  },
  getSnapshot: async (input: { scope: string; range: string; limit?: number }) => {
    const client = await openProviderUsageTarget('claude')
    if (!client) {
      throw new Error('Provider usage capability not available')
    }
    return client.getSnapshot(input)
  }
}

export const codexProviderUsageClient = {
  getScanState: async () => {
    const client = await openProviderUsageTarget('codex')
    if (!client) {
      throw new Error('Provider usage capability not available')
    }
    return client.getScanState()
  },
  setEnabled: async (input: { enabled: boolean }) => {
    const client = await openProviderUsageTarget('codex')
    if (!client) {
      throw new Error('Provider usage capability not available')
    }
    return client.setEnabled(input)
  },
  refresh: async (input: { force?: boolean }) => {
    const client = await openProviderUsageTarget('codex')
    if (!client) {
      throw new Error('Provider usage capability not available')
    }
    return client.refresh(input)
  },
  getSnapshot: async (input: { scope: string; range: string; limit?: number }) => {
    const client = await openProviderUsageTarget('codex')
    if (!client) {
      throw new Error('Provider usage capability not available')
    }
    return client.getSnapshot(input)
  }
}

export const openCodeProviderUsageClient = {
  getScanState: async () => {
    const client = await openProviderUsageTarget('openCode')
    if (!client) {
      throw new Error('Provider usage capability not available')
    }
    return client.getScanState()
  },
  setEnabled: async (input: { enabled: boolean }) => {
    const client = await openProviderUsageTarget('openCode')
    if (!client) {
      throw new Error('Provider usage capability not available')
    }
    return client.setEnabled(input)
  },
  refresh: async (input: { force?: boolean }) => {
    const client = await openProviderUsageTarget('openCode')
    if (!client) {
      throw new Error('Provider usage capability not available')
    }
    return client.refresh(input)
  },
  getSnapshot: async (input: { scope: string; range: string; limit?: number }) => {
    const client = await openProviderUsageTarget('openCode')
    if (!client) {
      throw new Error('Provider usage capability not available')
    }
    return client.getSnapshot(input)
  }
}
