// Why: codegen reads the TypeScript sources beside the generated bindings, and those sources import
// each other through .js specifiers that only a bundler resolver can follow; Node's own resolver and
// type stripping stop at the first such import, so the entry runs through Vite's module runner.
import { relative, resolve } from 'node:path'

import { createServer, createServerModuleRunner } from 'vite-plus'

const packageRoot = resolve(import.meta.dirname, '..')
const entryPath = process.argv[2]
if (!entryPath) {
  throw new Error('run-vite-entry requires the path of the module to run')
}
const entryUrl = `/${relative(packageRoot, resolve(packageRoot, entryPath)).replaceAll('\\', '/')}`

const server = await createServer({
  configFile: false,
  root: packageRoot,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error'
})

try {
  await createServerModuleRunner(server.environments.ssr).import(entryUrl)
} finally {
  await server.close()
}
