import type { KeybindingActionId } from '@agentstart/protocol/keybindings'

export function clearRecordingActionForShortcutMutation(
  recordingActionId: KeybindingActionId | null,
  actionId: KeybindingActionId
): KeybindingActionId | null {
  return recordingActionId === actionId ? null : recordingActionId
}
