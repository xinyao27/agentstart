import { useSortable } from '@dnd-kit/sortable'
import { translate } from '~renderer/i18n/i18n'
import { GitBranch } from '~renderer/icons/hugeicons'
import { cn } from '~renderer/ui/class-names'

import type { TabDragItemData } from '../tab-group/use-tab-drag-split'
import { getDropIndicatorClasses, type DropIndicator } from './drop-indicator'
import { preventMiddleButtonDefault } from './middle-button-default-guard'
import {
  getTitlebarTabStateClasses,
  TAB_LEADING_ICON_CLASSES,
  TAB_ROOT_CLASSES
} from './tab-chrome-classes'
import { TabCloseButton } from './tab-close-button'
import { TabLabel } from './tab-label'
import { useTabStripPointerActivation } from './tab-strip-pointer-activation'
import { TabActiveSurface, TabHoverSurface } from './tab-surfaces'
import { TAB_CONTAINER_WIDTH_CLASSES } from './tab-width-rules'

export function GitGraphTab({
  id,
  label,
  isActive,
  onActivate,
  onClose,
  dragData,
  dropIndicator
}: {
  id: string
  label: string
  isActive: boolean
  onActivate: () => void
  onClose: () => void
  dragData: TabDragItemData
  dropIndicator?: DropIndicator
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef } = useSortable({ id, data: dragData })
  const { onPointerDown } = useTabStripPointerActivation({ onActivate })

  return (
    <div className={TAB_CONTAINER_WIDTH_CLASSES}>
      <div
        ref={setNodeRef}
        data-tab-id={id}
        {...attributes}
        {...listeners}
        className={cn(
          TAB_ROOT_CLASSES,
          getDropIndicatorClasses(dropIndicator ?? null),
          getTitlebarTabStateClasses(isActive)
        )}
        onPointerDown={(event) => {
          onPointerDown(
            event,
            listeners?.onPointerDown as
              | ((pointerEvent: React.PointerEvent<Element>) => void)
              | undefined
          )
        }}
        onMouseDown={(event) => {
          if (event.button === 1) {
            event.preventDefault()
          }
        }}
        onMouseUp={preventMiddleButtonDefault}
        onAuxClick={(event) => {
          if (event.button === 1) {
            event.preventDefault()
            event.stopPropagation()
            onClose()
          }
        }}
      >
        {isActive ? <TabActiveSurface /> : <TabHoverSurface />}
        <GitBranch className={TAB_LEADING_ICON_CLASSES} />
        <TabLabel label={label} />
        <TabCloseButton
          ariaLabel={translate(
            'auto.components.tab.bar.SortableTab.6df69d9388',
            'Close tab {{value0}}',
            { value0: label }
          )}
          onClose={onClose}
        />
      </div>
    </div>
  )
}
