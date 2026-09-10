import {
  nativeWindowsRewriteNeedsFollowupRenderRefresh,
  terminalRewriteOutputRenderRefreshDecision,
  terminalRewriteOutputPrefersRenderRefresh,
  windowsEastAsianOutputPrefersRenderRefresh
} from '../pane-manager/terminal-complex-script'
import { containsNonAsciiOutput, type RendererRisk } from './renderer-risk'
import {
  consumeInactiveForegroundImmediateBudget,
  containsCursorRestore,
  containsSynchronizedOutputEnd,
  containsSynchronizedOutputStart,
  FOREGROUND_BUDGET_WINDOW_MS,
  FOREGROUND_IMMEDIATE_BUDGET_CHARS,
  FOREGROUND_INTERACTIVE_REDRAW_CHARS,
  FOREGROUND_INTERACTIVE_REDRAW_WINDOW_MS,
  FOREGROUND_SYNCHRONIZED_FRAME_INTERACTIVE_WINDOW_MS,
  FOREGROUND_THROUGHPUT_IMMEDIATE_CHARS,
  shouldSynchronizedOutputRemainActive
} from './terminal-output-policy'

type ForegroundOutputControllerOptions = {
  rendererRisk: RendererRisk
  getLastInputAt: () => number
  getIsActiveSplitPane: () => boolean
  applyWindowsUnicodeRefresh: boolean
  applyNativeWindowsRewriteRefresh: boolean
  protectNativeWindowsSynchronizedOutput: boolean
}

type ForegroundOutputDecision = {
  refresh: boolean
  inPlaceRewrite: boolean
  recoverAtlasAfterParse: boolean
  nativeCursorRestore: boolean
  nativeInPlaceRewriteFollowup: boolean
  synchronizedOutput: boolean
  synchronizedOutputEnded: boolean
  nextSynchronizedOutputActive: boolean
  synchronizedFrameLatencySensitive: boolean
}

export type ForegroundOutputController = {
  decide: (
    data: string,
    context: { isForegroundOutput: boolean; isPtyForeground: boolean }
  ) => ForegroundOutputDecision
  isLatencySensitive: (data: string) => boolean
}

export function createForegroundOutputController(
  options: ForegroundOutputControllerOptions
): ForegroundOutputController {
  let immediateBudgetChars = 0
  let immediateBudgetWindowStart = 0
  let didRewriteEndWithCarriageReturn = false
  let rewriteCsiScanTail = ''
  let isSynchronizedOutputActive = false
  let isSynchronizedFrameInteractive = false

  const consumeImmediateBudget = (dataLength: number): boolean => {
    const now = performance.now()
    if (now - immediateBudgetWindowStart > FOREGROUND_BUDGET_WINDOW_MS) {
      immediateBudgetChars = 0
      immediateBudgetWindowStart = now
    }
    if (immediateBudgetChars + dataLength > FOREGROUND_IMMEDIATE_BUDGET_CHARS) {
      return false
    }
    immediateBudgetChars += dataLength
    return true
  }

  const isLatencySensitive = (data: string): boolean => {
    if (!options.getIsActiveSplitPane()) {
      if (data.includes('\x1b[')) {
        return false
      }
      return consumeInactiveForegroundImmediateBudget(data.length)
    }
    if (data.length <= FOREGROUND_THROUGHPUT_IMMEDIATE_CHARS) {
      return consumeImmediateBudget(data.length)
    }
    const hasRecentInput =
      performance.now() - options.getLastInputAt() <= FOREGROUND_INTERACTIVE_REDRAW_WINDOW_MS
    return (
      hasRecentInput &&
      data.length <= FOREGROUND_INTERACTIVE_REDRAW_CHARS &&
      data.includes('\x1b[') &&
      consumeImmediateBudget(data.length)
    )
  }

  const decideRenderRefresh = (
    data: string
  ): Pick<ForegroundOutputDecision, 'refresh' | 'inPlaceRewrite' | 'recoverAtlasAfterParse'> => {
    const rewriteDecision = terminalRewriteOutputRenderRefreshDecision(data, {
      previousChunkEndsWithCarriageReturn: didRewriteEndWithCarriageReturn,
      previousRewriteCsiScanTail: rewriteCsiScanTail
    })
    didRewriteEndWithCarriageReturn = rewriteDecision.nextChunkEndsWithCarriageReturn
    rewriteCsiScanTail = rewriteDecision.nextRewriteCsiScanTail
    if (options.rendererRisk.foregroundOutputPrefersRefresh(data)) {
      return {
        refresh: true,
        inPlaceRewrite: rewriteDecision.prefersRenderRefresh,
        recoverAtlasAfterParse: true
      }
    }
    if (rewriteDecision.prefersRenderRefresh) {
      return { refresh: true, inPlaceRewrite: true, recoverAtlasAfterParse: false }
    }
    const hasRecentInput =
      performance.now() - options.getLastInputAt() <= FOREGROUND_INTERACTIVE_REDRAW_WINDOW_MS
    if (
      windowsEastAsianOutputPrefersRenderRefresh(data, {
        isWindowsClient: options.applyWindowsUnicodeRefresh,
        isNativeWindowsConpty: options.applyNativeWindowsRewriteRefresh,
        hadRecentInput: hasRecentInput,
        maxInteractiveRedrawChars: FOREGROUND_INTERACTIVE_REDRAW_CHARS
      })
    ) {
      return { refresh: true, inPlaceRewrite: false, recoverAtlasAfterParse: false }
    }
    return {
      refresh:
        options.applyNativeWindowsRewriteRefresh &&
        containsNonAsciiOutput(data) &&
        (data.includes('\r') || terminalRewriteOutputPrefersRenderRefresh(data)),
      inPlaceRewrite: false,
      recoverAtlasAfterParse: false
    }
  }

  return {
    isLatencySensitive,
    decide: (data, context) => {
      const renderDecision = context.isForegroundOutput
        ? decideRenderRefresh(data)
        : { refresh: false, inPlaceRewrite: false, recoverAtlasAfterParse: false }
      const synchronizedOutputStarted =
        options.protectNativeWindowsSynchronizedOutput &&
        context.isPtyForeground &&
        containsSynchronizedOutputStart(data)
      const synchronizedOutputEnded =
        options.protectNativeWindowsSynchronizedOutput &&
        context.isPtyForeground &&
        containsSynchronizedOutputEnd(data)
      const synchronizedOutput =
        options.protectNativeWindowsSynchronizedOutput &&
        context.isPtyForeground &&
        (isSynchronizedOutputActive || synchronizedOutputStarted || synchronizedOutputEnded)
      const nextSynchronizedOutputActive =
        options.protectNativeWindowsSynchronizedOutput &&
        context.isPtyForeground &&
        shouldSynchronizedOutputRemainActive(data, isSynchronizedOutputActive)
      if (synchronizedOutput && synchronizedOutputStarted) {
        isSynchronizedFrameInteractive =
          performance.now() - options.getLastInputAt() <=
          FOREGROUND_SYNCHRONIZED_FRAME_INTERACTIVE_WINDOW_MS
      } else if (!nextSynchronizedOutputActive && !synchronizedOutputEnded) {
        isSynchronizedFrameInteractive = false
      }
      isSynchronizedOutputActive = nextSynchronizedOutputActive
      return {
        ...renderDecision,
        nativeCursorRestore:
          options.protectNativeWindowsSynchronizedOutput &&
          context.isPtyForeground &&
          containsCursorRestore(data),
        nativeInPlaceRewriteFollowup: nativeWindowsRewriteNeedsFollowupRenderRefresh({
          isNativeWindowsConpty: options.applyNativeWindowsRewriteRefresh,
          isForeground: context.isPtyForeground,
          isInPlaceRewrite: renderDecision.inPlaceRewrite
        }),
        synchronizedOutput,
        synchronizedOutputEnded,
        nextSynchronizedOutputActive,
        synchronizedFrameLatencySensitive: synchronizedOutput && isSynchronizedFrameInteractive
      }
    }
  }
}
