export const mobilePageStyles = {
  root: 'relative block size-full overflow-hidden text-foreground',
  hero: 'relative flex size-full items-center justify-center overflow-hidden bg-[radial-gradient(circle,color-mix(in_srgb,var(--foreground)_8%,transparent)_1px,transparent_1.2px)] bg-[length:5px_5px] bg-repeat p-14 max-[920px]:items-start max-[920px]:px-7 max-[920px]:pb-7 max-[920px]:pt-[52px] [@media(max-height:840px)_and_(min-width:921px)]:p-12',
  heroCopy:
    'relative z-[1] flex min-h-[400px] max-w-[560px] flex-col [&>*]:flex [&>*]:flex-1 [&>*]:flex-col max-[920px]:min-h-0',
  introShell: 'min-h-[400px] max-[920px]:min-h-0',
  eyebrowRow: 'mb-[22px] flex items-center gap-3',
  eyebrow: 'text-sm font-semibold uppercase text-muted-foreground',
  heading:
    'm-0 text-[60px] font-semibold leading-[1.06] text-foreground max-[920px]:text-[44px] min-[921px]:max-[1180px]:text-[52px] [@media(max-height:840px)_and_(min-width:921px)]:text-[50px]',
  lead: 'my-5 mb-[22px] max-w-[580px] text-lg font-medium leading-[1.55] text-muted-foreground [@media(max-height:840px)_and_(min-width:921px)]:mb-4 [@media(max-height:840px)_and_(min-width:921px)]:text-[17px]',
  leadSmall:
    'my-[14px] mb-[22px] max-w-[420px] text-[15px] font-medium leading-[1.55] text-muted-foreground',
  platformBadges: 'mb-[18px] flex flex-wrap items-center gap-2',
  platformLabel: 'text-[13px] font-semibold text-muted-foreground',
  platformBadge:
    'inline-flex min-h-[30px] items-center gap-1.5 border border-border bg-card px-[11px] text-[13px] font-semibold text-foreground',
  brandIcon: 'size-4 shrink-0 fill-current',
  pairedList:
    'mt-[18px] flex max-h-72 max-w-[452px] list-none flex-col gap-2 overflow-y-auto p-0 pr-3 scrollbar-sleek',
  pairedRow: 'flex items-center gap-3 border border-border bg-card px-3 py-2.5',
  pairedIcon: 'grid size-8 place-items-center bg-foreground/5 text-foreground',
  pairedMain: 'min-w-0 flex-1',
  pairedName: 'truncate text-sm font-semibold text-foreground',
  pairedMeta: 'mt-0.5 text-xs text-muted-foreground',
  pairedRevoke:
    'inline-flex size-8 cursor-pointer items-center justify-center bg-transparent text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40',
  ctaRow: 'mt-auto flex items-center justify-start gap-3.5 pb-[25px] pt-4',
  primaryAction:
    'inline-flex h-10 cursor-pointer items-center gap-2 bg-primary px-[18px] text-[13px] font-semibold leading-none text-primary-foreground transition-colors',
  flowPrimaryAction: 'w-[150px] justify-center whitespace-nowrap',
  secondaryAction:
    'inline-flex min-h-9 cursor-pointer items-center gap-2 border border-border bg-card px-3.5 text-[13px] font-semibold leading-none text-foreground transition-colors hover:bg-accent',
  flowCard:
    'flex min-h-[400px] flex-1 flex-col border border-border bg-card p-6 text-card-foreground max-[920px]:p-5',
  stepNumber:
    'grid size-[26px] place-items-center border border-border bg-foreground/5 text-xs font-semibold text-foreground',
  flowViewport:
    'relative overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none',
  flowScreen:
    'pointer-events-none absolute left-0 top-0 w-full translate-x-10 opacity-0 transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none',
  flowScreenActive: 'pointer-events-auto relative translate-x-0 opacity-100',
  flowScreenPast: '-translate-x-10 opacity-0',
  flowActions: 'mt-auto flex min-h-14 items-center justify-between pt-4',
  flowBack:
    'inline-flex cursor-pointer items-center gap-1.5 bg-transparent p-0 text-[13px] font-medium text-muted-foreground underline underline-offset-[3px] transition-colors hover:text-foreground',
  flowContinue:
    'inline-flex h-10 cursor-pointer items-center gap-2 bg-primary px-[18px] text-[13px] font-semibold leading-none text-primary-foreground transition-colors',
  stepLayout: 'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-7',
  pairingLayout:
    "grid grid-cols-[minmax(0,1fr)_auto] [grid-template-areas:'copy_qr'_'relay_qr'_'controls_controls'] items-start gap-x-8 gap-y-[18px]",
  pairingCopy: '[grid-area:copy]',
  pairingQr: 'mt-12 [grid-area:qr]',
  pairingRelay: 'min-w-0 [grid-area:relay]',
  pairingControls: 'min-w-0 [grid-area:controls]',
  stepCopy: 'min-w-0',
  stepHeading: 'm-0 text-[34px] font-semibold leading-[1.08] text-foreground',
  platformTabs: 'mb-[22px] mt-0.5 inline-flex gap-[18px]',
  platformTab:
    'inline-flex cursor-pointer items-center gap-1.5 border-b-[1.5px] border-transparent bg-transparent pb-1.5 text-[13px] font-semibold text-muted-foreground transition-colors',
  platformTabActive: 'border-foreground text-foreground',
  inlineActions: 'flex flex-wrap items-center gap-3.5',
  ghostAction:
    'inline-flex cursor-pointer items-center gap-1.5 border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5',
  textLink:
    'inline-flex cursor-pointer items-center gap-1.5 bg-transparent p-0 text-[13px] font-semibold text-foreground opacity-[.85] transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-[.45]',
  qr: 'relative grid place-items-center overflow-hidden bg-white p-2',
  qrLarge: 'size-[184px] p-2.5 [&>img]:size-[164px]',
  qrImage: 'block size-[116px]',
  qrRefreshing: 'opacity-30 blur-[5px]',
  qrLoading:
    'absolute inset-2.5 grid place-items-center bg-background/75 text-xs font-semibold text-foreground',
  qrStack: 'flex flex-col items-center gap-2.5',
  linkUnder:
    'cursor-pointer bg-transparent p-0 text-xs font-medium text-muted-foreground underline underline-offset-[3px] transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
  networkRow: 'mb-[18px] flex flex-wrap items-center gap-2.5 text-[13px]',
  networkLabel: 'font-semibold text-muted-foreground',
  networkSelect: 'min-w-0 max-w-60 flex-[1_1_180px]',
  networkRefresh:
    'inline-flex size-7 cursor-pointer items-center justify-center border border-border bg-transparent text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
  actionDivider: 'text-xs text-muted-foreground opacity-60'
} as const
