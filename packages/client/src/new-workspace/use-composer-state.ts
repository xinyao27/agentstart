import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '~renderer/store/state'

import type { UseComposerStateOptions, UseComposerStateResult } from './composer-contract'
import {
  createComposerSubmissionGuard,
  shouldPreserveComposerSubmissionOnUnmount
} from './composer-submission-guard'
import { createComposerActions } from './create-composer-actions'
import { createComposerCardProps } from './create-composer-card-props'
import { useComposerForm } from './use-composer-form'
import { useComposerSubmissions } from './use-composer-submissions'
export type { UseComposerStateOptions, UseComposerStateResult } from './composer-contract'
// Why: a new composer instance must invalidate preflight retained by an older
// instance; hook-trust handoffs intentionally keep using the same submission.
const composerSubmissionGuard = createComposerSubmissionGuard()

export function useComposerState(options: UseComposerStateOptions): UseComposerStateResult {
  const form = useComposerForm(options)
  const composerActions = createComposerActions(form)
  const submissionGuard = composerSubmissionGuard
  useEffect(
    () => () => {
      const activeModal = useAppStore.getState().activeModal
      if (shouldPreserveComposerSubmissionOnUnmount(activeModal)) {
        return
      }
      // Why: user-dismissed preflight must not create after the composer closes,
      // while the hook-trust modal still needs its awaiting submission to resume.
      submissionGuard.cancel()
    },
    [submissionGuard]
  )

  const navigation = useAppStore(
    useShallow((s) => ({
      closeModal: s.closeModal,
      openSettingsPage: s.openSettingsPage,
      openSettingsTarget: s.openSettingsTarget
    }))
  )

  const handleOpenAgentSettings = (): void => {
    navigation.openSettingsTarget({ pane: 'agents', repoId: null })
    navigation.openSettingsPage()
    navigation.closeModal()
  }

  const { createDisabled, submit, submitQuick } = useComposerSubmissions({
    actions: composerActions,
    form,
    options,
    submissionGuard
  })

  const cardProps = createComposerCardProps({
    actions: composerActions,
    createDisabled,
    form,
    onOpenAgentSettings: handleOpenAgentSettings,
    onSubmit: submit
  })

  return {
    cardProps,
    composerRef: form.composerRef,
    onComposerNodeChange: form.attachments.onComposerNodeChange,
    promptTextareaRef: form.attachments.promptTextareaRef,
    nameInputRef: form.nameInputRef,
    submit,
    submitQuick,
    createDisabled
  }
}
