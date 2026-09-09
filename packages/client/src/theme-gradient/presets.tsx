import type { ThemeGradientTheme } from '@yiru/protocol/settings/theme-gradient'
import type React from 'react'
import { useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretLeft, CaretRight } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'

import { THEME_GRADIENT_PRESET_PAGES, themeFromPreset } from './preset-data'

type ThemeGradientPresetsProps = {
  theme: ThemeGradientTheme | null
  onSelect: (theme: ThemeGradientTheme) => void
}

export function ThemeGradientPresets({
  theme,
  onSelect
}: ThemeGradientPresetsProps): React.JSX.Element {
  const pagesRef = useRef<HTMLDivElement | null>(null)
  const [pageIndex, setPageIndex] = useState(0)

  const showPage = (nextPageIndex: number): void => {
    const boundedIndex = Math.max(
      0,
      Math.min(THEME_GRADIENT_PRESET_PAGES.length - 1, nextPageIndex)
    )
    setPageIndex(boundedIndex)
    const pages = pagesRef.current
    if (pages) {
      pages.scrollTo({ left: boundedIndex * pages.clientWidth, behavior: 'smooth' })
    }
  }

  return (
    <div className="flex items-center">
      <Button
        type="button"
        variant="ghost"
        size="icon-palette-page"
        disabled={pageIndex === 0}
        onClick={() => showPage(pageIndex - 1)}
        aria-label={translate('themeGradient.presets.previous', 'Previous palette row')}
      >
        <CaretLeft />
      </Button>
      <div
        ref={pagesRef}
        data-theme-preset-pages
        className="mx-2.5 flex flex-1 snap-x snap-mandatory items-center overflow-hidden px-px"
      >
        {THEME_GRADIENT_PRESET_PAGES.map((page, currentPageIndex) => (
          <div
            key={`palette-page-${currentPageIndex}`}
            aria-hidden={currentPageIndex !== pageIndex}
            className="flex min-w-full snap-start items-center justify-between"
          >
            {page.map((preset, index) => {
              const presetTheme = themeFromPreset(preset, theme)
              return (
                <Button
                  data-theme-color-swatch
                  key={preset.id}
                  type="button"
                  variant="color-swatch"
                  size="icon-palette-swatch"
                  className="shrink-0"
                  tabIndex={currentPageIndex === pageIndex ? 0 : -1}
                  onClick={() => onSelect(presetTheme)}
                  aria-label={translate(
                    'themeGradient.presets.applyNumbered',
                    'Apply palette preset {{value0}} of {{value1}}',
                    { value0: index + 1, value1: page.length }
                  )}
                >
                  <span
                    data-theme-color-swatch-fill
                    aria-hidden
                    className="size-full"
                    style={{ background: preset.previewBackground }}
                  />
                </Button>
              )
            })}
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-palette-page"
        disabled={pageIndex >= THEME_GRADIENT_PRESET_PAGES.length - 1}
        onClick={() => showPage(pageIndex + 1)}
        aria-label={translate('themeGradient.presets.next', 'Next palette row')}
      >
        <CaretRight />
      </Button>
    </div>
  )
}
