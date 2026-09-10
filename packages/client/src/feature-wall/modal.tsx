import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

import { getFeatureWallOpenSource } from './modal-source'
import { FeatureWallTourSurface } from './tour-surface'

export default function FeatureWallModal(): JSX.Element | null {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const isOpen = activeModal === 'feature-wall'
  const source = getFeatureWallOpenSource(modalData)

  const handleOpenChange = (open: boolean): void => {
    if (!open) {
      closeModal()
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="grid h-[min(780px,calc(100vh-2rem))] w-[min(1240px,calc(100vw-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-none"
        tabIndex={-1}
      >
        <DialogHeader className="border-border gap-1 border-b px-7 py-4">
          <DialogTitle className="text-lg">
            {translate(
              'auto.components.feature.wall.FeatureWallModal.3567e147c8',
              'Get to know AgentStart'
            )}
          </DialogTitle>
          {/* Why: Radix requires a description for the dialog to be a11y-compliant,
              but we don't want it visible - the rail and step copy already orient users. */}
          <DialogDescription className="sr-only">
            {translate(
              'auto.components.feature.wall.FeatureWallModal.33dca8bbbe',
              'A short, workflow-by-workflow tour of AgentStart.'
            )}
          </DialogDescription>
        </DialogHeader>

        <FeatureWallTourSurface isOpen={isOpen} source={source} onDone={closeModal} />
      </DialogContent>
    </Dialog>
  )
}
