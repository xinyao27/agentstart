import { useMemo, useState, type JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useShortcutLabel } from '~renderer/keyboard-input/use-shortcut-label'
import { ClaudeIcon } from '~renderer/status-bar/icons'
import { Card } from '~renderer/ui/card'
import { cn } from '~renderer/ui/class-names'

import {
  BrowserStoryboardCursor,
  BrowserStoryboardDropdownRow,
  BrowserStoryboardGlobeGlyph,
  BrowserStoryboardNavGlyph,
  BrowserStoryboardPlusGlyph,
  BrowserStoryboardTab,
  BrowserStoryboardTerminalGlyph
} from './browser-storyboard-chrome'
import { BrowserStoryboardPricing, BrowserStoryboardSignup } from './browser-storyboard-page'
import { BrowserStoryboardTerminal } from './browser-storyboard-terminal'
import { BROWSER_STORYBOARD_PROMPT } from './browser-storyboard-timeline'
import { FeatureWallClickRing } from './click-ring'
import { useBrowserStoryboard } from './use-browser-storyboard'

export function BrowserAnimatedVisual(props: {
  reducedMotion: boolean
  onCycleComplete?: () => void
}): JSX.Element {
  const [browserPageElement, setBrowserPageElement] = useState<HTMLDivElement | null>(null)
  const [titlebarElement, setTitlebarElement] = useState<HTMLDivElement | null>(null)
  const [newtabButtonElement, setNewtabButtonElement] = useState<HTMLSpanElement | null>(null)
  const [newtabRowElement, setNewtabRowElement] = useState<HTMLDivElement | null>(null)
  const [starterCardElement, setStarterCardElement] = useState<HTMLDivElement | null>(null)
  const [ctaElement, setCtaElement] = useState<HTMLSpanElement | null>(null)
  const [sendButtonElement, setSendButtonElement] = useState<HTMLSpanElement | null>(null)
  const elements = useMemo(
    () => ({
      browserPage: browserPageElement,
      titlebar: titlebarElement,
      newtabButton: newtabButtonElement,
      newtabRow: newtabRowElement,
      starterCard: starterCardElement,
      cta: ctaElement,
      sendButton: sendButtonElement
    }),
    [
      browserPageElement,
      ctaElement,
      newtabButtonElement,
      newtabRowElement,
      sendButtonElement,
      starterCardElement,
      titlebarElement
    ]
  )
  const storyboard = useBrowserStoryboard(props.reducedMotion, props.onCycleComplete, elements)
  const newBrowserShortcutLabel = useShortcutLabel('tab.newBrowser')

  return (
    <div className="flex flex-col gap-2">
      <div className="relative w-full" style={{ height: 270 }}>
        <div
          className="absolute inset-0 grid transition-[grid-template-columns,gap] duration-500 ease-out"
          style={{
            gridTemplateColumns: storyboard.isSplit ? '1fr 1fr' : '1fr 0fr',
            gap: storyboard.isSplit ? 10 : 0
          }}
        >
          <div className="border-border bg-card text-card-foreground relative flex min-w-0 flex-col overflow-hidden rounded-xl border">
            <div
              ref={setTitlebarElement}
              className="border-border bg-muted/40 relative flex min-h-[32px] items-end gap-1.5 border-b px-2.5 pt-2"
            >
              <div className="ml-1 flex flex-1 items-end gap-1 overflow-visible">
                <BrowserStoryboardTab
                  minimized={storyboard.terminalTabMinimized}
                  icon={<BrowserStoryboardTerminalGlyph />}
                  title={translate(
                    'auto.components.feature.wall.BrowserAnimatedVisual.04096318ab',
                    'Terminal 1'
                  )}
                />
                {storyboard.browserTabVisible ? (
                  <BrowserStoryboardTab
                    incoming
                    icon={<BrowserStoryboardGlobeGlyph />}
                    title={translate(
                      'auto.components.feature.wall.BrowserAnimatedVisual.7da6eed7bf',
                      'localhost:3000'
                    )}
                  />
                ) : null}
                <span
                  ref={setNewtabButtonElement}
                  className={cn(
                    'mb-1 inline-flex size-[22px] items-center justify-center text-muted-foreground transition-colors duration-150 rounded-md',
                    storyboard.newtabActive ? 'bg-foreground/10 text-foreground' : null
                  )}
                >
                  <BrowserStoryboardPlusGlyph />
                </span>
              </div>
              <Card
                aria-hidden={!storyboard.dropdownVisible}
                className={cn(
                  'bg-popover text-popover-foreground border-border absolute z-40 gap-0 origin-top-left p-1 py-1 text-[11.5px] transition-[opacity,transform] duration-150',
                  storyboard.dropdownVisible
                    ? 'translate-y-0 scale-100 opacity-100'
                    : '-translate-y-[3px] scale-[0.985] opacity-0'
                )}
                style={{
                  top: 'calc(100% + 4px)',
                  left: storyboard.menuOffsetX,
                  minWidth: 196
                }}
              >
                <BrowserStoryboardDropdownRow widthPct={64} />
                <div
                  ref={setNewtabRowElement}
                  className={cn(
                    'grid items-center gap-2 px-2 py-[5px] rounded-md',
                    storyboard.newtabRowActive ? 'bg-accent' : null
                  )}
                  style={{ gridTemplateColumns: '18px 1fr' }}
                >
                  <span className="text-popover-foreground inline-flex size-[13px] items-center justify-center">
                    <BrowserStoryboardGlobeGlyph />
                  </span>
                  <span className="text-popover-foreground text-[11.5px]">
                    {translate(
                      'auto.components.feature.wall.BrowserAnimatedVisual.0a2bd01c02',
                      'New Browser Tab'
                    )}
                  </span>
                  <span className="text-muted-foreground font-mono text-[10.5px]">
                    {newBrowserShortcutLabel}
                  </span>
                </div>
                <BrowserStoryboardDropdownRow widthPct={52} />
              </Card>
            </div>

            <div
              className="border-border bg-muted/20 flex items-center gap-2 border-b px-2.5 py-1.5"
              style={{ visibility: storyboard.browserChromeVisible ? 'visible' : 'hidden' }}
            >
              <span className="text-muted-foreground inline-flex gap-1">
                <BrowserStoryboardNavGlyph>‹</BrowserStoryboardNavGlyph>
                <BrowserStoryboardNavGlyph>›</BrowserStoryboardNavGlyph>
                <BrowserStoryboardNavGlyph>↻</BrowserStoryboardNavGlyph>
              </span>
              <div className="border-border bg-card flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-md border px-2 py-[3px] font-mono text-[11px]">
                {storyboard.isSplit ? (
                  <span className="text-muted-foreground truncate transition-colors duration-200">
                    {`...${storyboard.showSignup ? '/signup' : '/pricing'}`}
                  </span>
                ) : (
                  <>
                    <span className="text-foreground truncate">
                      {translate(
                        'auto.components.feature.wall.BrowserAnimatedVisual.7da6eed7bf',
                        'localhost:3000'
                      )}
                    </span>
                    <span className="text-muted-foreground truncate transition-colors duration-200">
                      {storyboard.showSignup
                        ? translate(
                            'auto.components.feature.wall.BrowserAnimatedVisual.f39be6ca14',
                            '/signup'
                          )
                        : translate(
                            'auto.components.feature.wall.BrowserAnimatedVisual.73bbb46073',
                            '/pricing'
                          )}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div
              className="bg-card relative flex-1"
              style={{
                overflow: storyboard.bodyOverflowVisible ? 'visible' : 'hidden',
                minHeight: 0
              }}
            >
              <div
                ref={setBrowserPageElement}
                className="relative flex flex-col gap-3 px-5 py-4"
                style={{ visibility: storyboard.browserChromeVisible ? 'visible' : 'hidden' }}
              >
                {storyboard.showSignup ? (
                  <BrowserStoryboardSignup />
                ) : (
                  <BrowserStoryboardPricing
                    cardRef={setStarterCardElement}
                    ctaRef={setCtaElement}
                    ringStarter={storyboard.ringStarter}
                    ctaHighlighted={storyboard.ctaHighlighted}
                    ctaPressing={storyboard.ctaPressing}
                  />
                )}

                <Card
                  aria-hidden={!storyboard.annotateOpen}
                  className={cn(
                    'bg-popover text-popover-foreground border-border pointer-events-none absolute z-30 rounded-md flex origin-top-left flex-col gap-1.5 px-[9px] pb-[7px] pt-2 text-[10px] transition-[opacity,transform] duration-200',
                    storyboard.annotateOpen ? 'scale-100 opacity-100' : 'scale-[0.96] opacity-0'
                  )}
                  style={{
                    left: storyboard.annotateAnchor.left,
                    top: storyboard.annotateAnchor.top,
                    width: 188
                  }}
                >
                  <span className="text-muted-foreground block w-full shrink-0 truncate font-mono text-[9.5px] leading-none">
                    {translate(
                      'auto.components.feature.wall.BrowserAnimatedVisual.d8856b604a',
                      'div.pricing-grid > div.card.starter:nth-of-type(1) > a.cta'
                    )}
                  </span>
                  <span aria-hidden className="bg-popover-foreground/10 h-px w-full shrink-0" />
                  <div className="text-popover-foreground min-h-[28px] flex-1 font-sans text-[10px] leading-[1.35] break-words">
                    {storyboard.typedChars > 0 ? (
                      <>
                        {BROWSER_STORYBOARD_PROMPT.slice(0, storyboard.typedChars)}
                        <span className="bg-popover-foreground ml-px inline-block h-2 w-px translate-y-[1px] align-baseline" />
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        {translate(
                          'auto.components.feature.wall.BrowserAnimatedVisual.3d2352f94b',
                          'Describe the change…'
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <span
                      ref={setSendButtonElement}
                      aria-label={translate(
                        'auto.components.feature.wall.BrowserAnimatedVisual.0f8481e1a7',
                        'Send to Claude'
                      )}
                      className={cn(
                        'inline-flex size-5 shrink-0 items-center justify-center rounded border border-border bg-muted text-foreground transition-[background-color,transform] duration-150',
                        storyboard.sendPressed ? 'scale-[0.92] bg-foreground/[0.12]' : null
                      )}
                    >
                      <ClaudeIcon size={12} />
                    </span>
                  </div>
                </Card>

                <span
                  key={storyboard.flashKey}
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute inset-0 z-40 bg-background/85 dark:bg-foreground/12',
                    storyboard.flashing
                      ? 'animate-[browserFlash_360ms_ease-out_forwards]'
                      : 'opacity-0'
                  )}
                />
              </div>
              <div
                aria-hidden
                className={cn(
                  'pointer-events-none absolute left-0 top-0 z-50 transition-[opacity,transform] duration-700 ease-[cubic-bezier(.45,.05,.2,1)]',
                  storyboard.cursorVisible ? 'opacity-100' : 'opacity-0'
                )}
                style={{
                  transform: `translate(${storyboard.cursorPos.x}px, ${storyboard.cursorPos.y}px)`
                }}
              >
                <div className="relative">
                  <BrowserStoryboardCursor />
                  {storyboard.clickRingVisible ? (
                    <FeatureWallClickRing key={storyboard.clickRingKey} />
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div
            className={cn(
              'flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card font-mono text-[10px] text-card-foreground transition-[opacity,transform] duration-500',
              storyboard.isSplit ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0'
            )}
          >
            <div className="border-border bg-muted/40 text-foreground flex h-5 shrink-0 items-center gap-1.5 border-b px-2 text-[9.5px] font-medium">
              <ClaudeIcon size={11} />
              <span>
                {translate(
                  'auto.components.feature.wall.BrowserAnimatedVisual.6e4616d039',
                  'Claude'
                )}
              </span>
            </div>
            <BrowserStoryboardTerminal phase={storyboard.phase} />
          </div>
        </div>
      </div>
      <style>
        {translate(
          'auto.components.feature.wall.BrowserAnimatedVisual.1bec24acc1',
          '@keyframes browserFlash { 0% { opacity: 0; } 20% { opacity: 0.85; } 100% { opacity: 0; } } @keyframes browserTabIn { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } } @keyframes browserViewIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }'
        )}
      </style>
    </div>
  )
}
