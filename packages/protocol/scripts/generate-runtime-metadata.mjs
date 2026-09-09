// Why: Rust needs the same keybinding defaults and compatibility versions as browser clients.
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { KEYBINDING_DEFINITIONS } from '../typescript/src/keybindings/definitions.ts'
import {
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  MIN_COMPATIBLE_RUNTIME_SERVER_VERSION,
  RUNTIME_PROTOCOL_VERSION
} from '../typescript/src/runtime/compatibility.ts'

const packageRoot = join(import.meta.dirname, '..')
const outputPath = join(packageRoot, 'generated', 'runtime-metadata.json')

const keybindings = KEYBINDING_DEFINITIONS.map((definition) => ({
  id: definition.id,
  title: definition.title,
  scope: definition.scope,
  ...(definition.conflictGroup === undefined ? {} : { conflictGroup: definition.conflictGroup }),
  ...(definition.allowBareKeybindings === true ? { allowBareKeybindings: true } : {}),
  defaultBindings: definition.defaultBindings
}))
if (new Set(keybindings.map((definition) => definition.id)).size !== keybindings.length) {
  throw new Error('runtime metadata generation found duplicate keybinding action ids')
}

const manifest = {
  schemaVersion: 1,
  protocol: {
    version: RUNTIME_PROTOCOL_VERSION,
    minCompatibleClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
    minCompatibleServerVersion: MIN_COMPATIBLE_RUNTIME_SERVER_VERSION
  },
  keybindings
}

await mkdir(join(packageRoot, 'generated'), { recursive: true })
const temporaryPath = `${outputPath}.${process.pid}.tmp`
try {
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await rename(temporaryPath, outputPath)
} finally {
  await rm(temporaryPath, { force: true })
}
