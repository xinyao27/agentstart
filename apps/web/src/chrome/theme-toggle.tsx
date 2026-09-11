import { Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { useTheme } from '../theme'

/** Why: an icon button rather than a text link — the footer row is already all
    words, and the control is recognisable without one. */
export function ThemeToggle(): React.JSX.Element {
  const { theme, toggle } = useTheme()
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="text-muted hover:text-ink inline-flex items-center justify-center transition-colors"
    >
      {theme === 'dark' ? (
        <HugeiconsIcon icon={Sun03Icon} className="size-[18px]" aria-hidden="true" />
      ) : (
        <HugeiconsIcon icon={Moon02Icon} className="size-[18px]" aria-hidden="true" />
      )}
    </button>
  )
}
