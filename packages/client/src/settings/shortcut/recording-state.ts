import type { KeybindingActionId } from '@yiru/protocol/keybindings'

export function clearRecordingActionForShortcutMutation(
  recordingActionId: KeybindingActionId | null,
  actionId: KeybindingActionId
): KeybindingActionId | null {
  return recordingActionId === actionId ? null : recordingActionId
}
