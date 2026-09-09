import type { KeybindingPlatform, PlatformBindings } from './model.js'

export function platformBindings(bindings: readonly string[]): PlatformBindings {
  return { darwin: bindings, linux: bindings, win32: bindings }
}

export function getKeybindingPlatform(platform: string): KeybindingPlatform {
  return platform === 'darwin' ? 'darwin' : platform === 'win32' ? 'win32' : 'linux'
}
