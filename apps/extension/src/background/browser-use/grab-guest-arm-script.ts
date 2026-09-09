import { GUEST_ARM_BASE_SCRIPT } from './grab-guest-arm-base-script'
import { GUEST_ARM_CONTEXT_SCRIPT } from './grab-guest-arm-context-script'
import { GUEST_ARM_OVERLAY_SCRIPT } from './grab-guest-arm-overlay-script'
import { GUEST_ARM_SELECTOR_SCRIPT } from './grab-guest-arm-selector-script'
import { GUEST_ARM_SERIALIZATION_SCRIPT } from './grab-guest-arm-serialization-script'

export const ARM_SCRIPT = [
  GUEST_ARM_BASE_SCRIPT,
  GUEST_ARM_SERIALIZATION_SCRIPT,
  GUEST_ARM_SELECTOR_SCRIPT,
  GUEST_ARM_CONTEXT_SCRIPT,
  GUEST_ARM_OVERLAY_SCRIPT
].join('')
