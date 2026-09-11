import { cn } from 'cnfast'
export type WindowChromeProps = {
  title: string
}

/** Why: real macOS light colours make the remote daemon window recognizable;
    they are decorative only — never focusable, never interactive. */
const lights = ['bg-[#ff5f57]', 'bg-[#febc2e]', 'bg-[#28c840]']

export function WindowChrome({ title }: WindowChromeProps): React.JSX.Element {
  return (
    <div className="border-hairline flex h-9 shrink-0 items-center gap-2 border-b px-3">
      <span className="flex items-center gap-[6px]" aria-hidden="true">
        {lights.map((light) => (
          <span key={light} className={cn('size-[11px] rounded-full', light)} />
        ))}
      </span>
      <span className="text-faint flex-1 text-center font-mono text-[11px]">{title}</span>
      <span className="w-[46px]" />
    </div>
  )
}
