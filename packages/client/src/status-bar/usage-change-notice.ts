export function shouldShowUsagePercentageDisplayChangeNotice(args: {
  persistedUIReady: boolean
  usagePercentageDisplayChangeNoticeDismissed: boolean
  statusBarVisible: boolean
  hasVisibleUsageMeters: boolean
  activeModal: string
}): boolean {
  return (
    args.persistedUIReady &&
    !args.usagePercentageDisplayChangeNoticeDismissed &&
    args.statusBarVisible &&
    args.hasVisibleUsageMeters &&
    args.activeModal === 'none'
  )
}
