import React from 'react'
import { createPortal } from 'react-dom'
import { translate } from '~renderer/i18n/i18n'
import { Copy } from '~renderer/icons/hugeicons'
import { shellClient } from '~renderer/runtime/shell-client'
import { Button } from '~renderer/ui/button'

type SelectedTextCopyMenuProps = {
  children: React.ReactNode
  className?: string
}

type MenuState = {
  x: number
  y: number
  text: string
}

const MENU_WIDTH = 144
const MENU_HEIGHT = 36
const MENU_MARGIN = 8

function getSelectionTextInside(container: HTMLElement): string {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return ''
  }

  const anchorNode = selection.anchorNode
  const focusNode = selection.focusNode
  if (!anchorNode || !focusNode) {
    return ''
  }

  if (!container.contains(anchorNode) || !container.contains(focusNode)) {
    return ''
  }

  return selection.toString().trim()
}

export function SelectedTextCopyMenu({
  children,
  className
}: SelectedTextCopyMenuProps): React.JSX.Element {
  const [menu, setMenu] = React.useState<MenuState | null>(null)

  React.useEffect(() => {
    if (!menu) {
      return
    }

    const close = (): void => setMenu(null)
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        close()
      }
    }

    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [menu])

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const selectedText = getSelectionTextInside(event.currentTarget)
    if (!selectedText) {
      return
    }

    // Why: allowing the event through reopens the workspace card menu. Render
    // this through a body portal so transformed hovercards cannot offset it.
    event.preventDefault()
    event.stopPropagation()
    event.nativeEvent.stopImmediatePropagation()
    setMenu({
      text: selectedText,
      x: Math.max(
        MENU_MARGIN,
        Math.min(event.clientX, window.innerWidth - MENU_WIDTH - MENU_MARGIN)
      ),
      y: Math.max(
        MENU_MARGIN,
        Math.min(event.clientY, window.innerHeight - MENU_HEIGHT - MENU_MARGIN)
      )
    })
  }

  const handleCopy = () => {
    if (!menu) {
      return
    }
    void shellClient.ui.writeClipboardText(menu.text)
    setMenu(null)
  }

  return (
    <div className={className} onContextMenuCapture={handleContextMenu}>
      {children}
      {menu &&
        createPortal(
          <div
            className="bg-popover text-popover-foreground border-border fixed z-[100] min-w-36 overflow-hidden rounded-lg border p-1"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="xs"
              type="button"
              className="focus:bg-accent flex h-auto w-full cursor-default justify-start gap-2 border-0 py-1 text-left text-[12px] leading-5 font-[450] font-normal whitespace-normal"
              onClick={handleCopy}
            >
              <Copy className="text-muted-foreground size-3.5" />
              {translate('auto.components.SelectedTextCopyMenu.9b40d7b018', 'Copy')}
            </Button>
          </div>,
          document.body
        )}
    </div>
  )
}
