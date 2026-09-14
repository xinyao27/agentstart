import type { DeveloperPermissionId } from '@agentstart/protocol'
import type { ReactNode } from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  PersonArmsSpread as Accessibility,
  Bluetooth,
  Camera,
  HardDrive,
  Microphone as Mic,
  Network,
  Usb,
  MonitorArrowUp as MonitorUp,
  FlowArrow as Workflow
} from '~renderer/icons/hugeicons'

export type PermissionDefinition = {
  id: DeveloperPermissionId
  label: string
  description: string
  actionLabel: string
  icon: ReactNode
}

/** macOS privacy permissions that terminal-launched developer tools may need,
 *  with the label of the action that acquires each one. */
export const DEVELOPER_PERMISSIONS: PermissionDefinition[] = [
  {
    id: 'microphone',
    get label() {
      return translate('auto.components.settings.DeveloperPermissionsPane.16381e040a', 'Microphone')
    },
    get description() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.cc8151d9fa',
        'Audio recording, transcription, media capture, sox, ffmpeg, and Whisper CLIs.'
      )
    },
    get actionLabel() {
      return translate('auto.components.settings.DeveloperPermissionsPane.actionRequest', 'Request')
    },
    icon: <Mic className="size-4" />
  },
  {
    id: 'camera',
    get label() {
      return translate('auto.components.settings.DeveloperPermissionsPane.e5b5f3d6b9', 'Camera')
    },
    get description() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.550cfa3750',
        'Webcam capture and camera-driven local test apps.'
      )
    },
    get actionLabel() {
      return translate('auto.components.settings.DeveloperPermissionsPane.actionRequest', 'Request')
    },
    icon: <Camera className="size-4" />
  },
  {
    id: 'screen',
    get label() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.f24f31a884',
        'Screen Recording'
      )
    },
    get description() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.0639db5496',
        'Screenshot, visual automation, and UI inspection tools.'
      )
    },
    get actionLabel() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.actionOpenSettings',
        'Open Settings'
      )
    },
    icon: <MonitorUp className="size-4" />
  },
  {
    id: 'accessibility',
    get label() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.5b2f22ca2d',
        'Accessibility'
      )
    },
    get description() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.9f35980756',
        'Keystroke injection, window control, and UI automation tools.'
      )
    },
    get actionLabel() {
      return translate('auto.components.settings.DeveloperPermissionsPane.actionRequest', 'Request')
    },
    icon: <Accessibility className="size-4" />
  },
  {
    id: 'full-disk-access',
    get label() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.c566bca278',
        'Full Disk Access'
      )
    },
    get description() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.7ca17b62c8',
        'Recommended when projects, worktrees, or symlinked files touch macOS-protected folders.'
      )
    },
    get actionLabel() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.actionOpenSettings',
        'Open Settings'
      )
    },
    icon: <HardDrive className="size-4" />
  },
  {
    id: 'automation',
    get label() {
      return translate('auto.components.settings.DeveloperPermissionsPane.e119f0d66b', 'Automation')
    },
    get description() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.4a73f5217a',
        'Apple Events for scripts that control other local apps.'
      )
    },
    get actionLabel() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.actionTriggerPrompt',
        'Trigger Prompt'
      )
    },
    icon: <Workflow className="size-4" />
  },
  {
    id: 'local-network',
    get label() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.e7bb06007c',
        'Local Network'
      )
    },
    get description() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.f903bf20b5',
        'Discovery and access for development servers on your network.'
      )
    },
    get actionLabel() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.actionTriggerPrompt',
        'Trigger Prompt'
      )
    },
    icon: <Network className="size-4" />
  },
  {
    id: 'usb',
    get label() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.bf51e4a542',
        'USB Devices'
      )
    },
    get description() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.dfbc12c8c8',
        'Hardware debugging and device tools that talk to USB devices.'
      )
    },
    get actionLabel() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.actionOpenSettings',
        'Open Settings'
      )
    },
    icon: <Usb className="size-4" />
  },
  {
    id: 'bluetooth',
    get label() {
      return translate('auto.components.settings.DeveloperPermissionsPane.b2210b1b4f', 'Bluetooth')
    },
    get description() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.4cfaa7e98a',
        'Bluetooth device tools and local hardware experiments.'
      )
    },
    get actionLabel() {
      return translate(
        'auto.components.settings.DeveloperPermissionsPane.actionOpenSettings',
        'Open Settings'
      )
    },
    icon: <Bluetooth className="size-4" />
  }
]
