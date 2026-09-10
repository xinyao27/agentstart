import type { DropIndicator } from '~renderer/tab-bar/drop-indicator'

// Why: titlebar chrome is denser than tabs; a 1px seam reads as an insertion
// cue without covering neighboring icon buttons.
export function getDropIndicatorClasses(dropIndicator: DropIndicator): string {
  if (dropIndicator === 'left') {
    return "before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-blue-500 before:z-10 before:content-['']"
  }
  if (dropIndicator === 'right') {
    return "after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-blue-500 after:z-10 after:content-['']"
  }
  return ''
}
