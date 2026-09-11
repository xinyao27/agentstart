import type { CursorPoint } from './state'

export type CursorProps = {
  at: CursorPoint
  pressed: boolean
}

/**
 * Why: the standard arrow pointer, drawn so its tip sits exactly on the
 * coordinate — a centred dot reads as a bullet, not a cursor. White fill with a
 * dark outline keeps it legible on either theme.
 */
export function Cursor({ at, pressed }: CursorProps): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute z-30 transition-all duration-700 ease-out"
      style={{
        left: `${at.x}%`,
        top: `${at.y}%`,
        transform: `scale(${pressed ? 0.85 : 1})`,
        transformOrigin: 'top left'
      }}
    >
      <svg width="15" height="22" viewBox="0 0 12 18" fill="none">
        <path
          d="M1 1v13.2l3.35-3.1 2.26 4.86 2.2-1-2.27-4.83H11z"
          fill="#ffffff"
          stroke="#111111"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
      {pressed ? (
        <span className="border-ink/40 absolute -top-1 -left-1 size-6 rounded-full border" />
      ) : null}
    </span>
  )
}
