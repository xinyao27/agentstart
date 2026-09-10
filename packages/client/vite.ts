import { fileURLToPath } from 'node:url'

import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'

const CLIENT_SOURCE_ROOT = fileURLToPath(new URL('./src', import.meta.url))

export type ClientVitePresetOptions = {
  featureWallEnabled: boolean
}

export function createClientVitePreset(options: ClientVitePresetOptions) {
  return {
    root: CLIENT_SOURCE_ROOT,
    // Why: the client owns both plugin versions and their ordering, so every
    // host compiles its TSX and Tailwind source with the same toolchain.
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
    resolve: {
      alias: {
        '~renderer': CLIENT_SOURCE_ROOT
      }
    },
    worker: {
      format: 'es' as const
    },
    define: {
      AGENTSTART_FEATURE_WALL_ENABLED: JSON.stringify(options.featureWallEnabled)
    }
  }
}
