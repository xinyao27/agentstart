export type ResourceUsageSpaceScanSnapshot = {
  ready: boolean
  previousScanning: boolean
  lastSeenScannedAt: number | null
}

export function resolveResourceUsageSpaceScanReady({
  snapshot,
  open,
  spacePageVisible,
  scannedAt,
  scanning
}: {
  snapshot: ResourceUsageSpaceScanSnapshot
  open: boolean
  // Why: the Space surface is a page tab now, so "is the user looking at Space"
  // is derived from tab selection by the caller instead of compared against a
  // route scalar here.
  spacePageVisible: boolean
  scannedAt: number | null
  scanning: boolean
}): ResourceUsageSpaceScanSnapshot {
  const scanCompleted =
    snapshot.previousScanning &&
    !scanning &&
    scannedAt !== null &&
    scannedAt !== snapshot.lastSeenScannedAt

  if (scanCompleted) {
    return {
      ready: !open && !spacePageVisible,
      previousScanning: scanning,
      lastSeenScannedAt: scannedAt
    }
  }

  if (snapshot.ready && (open || spacePageVisible)) {
    return {
      ready: false,
      previousScanning: scanning,
      lastSeenScannedAt: scannedAt
    }
  }

  if (snapshot.previousScanning !== scanning) {
    return {
      ...snapshot,
      previousScanning: scanning
    }
  }

  return snapshot
}
