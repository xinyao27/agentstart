// Why: a signed .app is not a download a person can install; the drag-to-Applications disk image is
// the only macOS installer shape that needs no terminal, no package manager, and no admin password.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'

const source = resolve(import.meta.dirname, '..')
const app = join(source, 'dist/AgentStart.app')
const image = join(source, 'dist/AgentStart.dmg')
const staging = join(source, '.build/dmg')
const version = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')).version
const isRelease = process.env.AGENTSTART_MAC_RELEASE === '1'
const identity = process.env.AGENTSTART_MACOS_SIGN_IDENTITY ?? process.env.CSC_NAME

if (!existsSync(app)) {
  throw new Error(`Build the app before packaging it: ${app}`)
}
if (isRelease && !identity) {
  throw new Error('AGENTSTART_MACOS_SIGN_IDENTITY is required to sign a release disk image.')
}

rmSync(staging, { force: true, recursive: true })
mkdirSync(staging, { recursive: true })
// Why: the stapled app ticket can live in filesystem metadata that Node's recursive copy does not
// preserve, so use Apple's bundle-aware copier before sealing the installer image.
run('ditto', ['--rsrc', '--extattr', app, join(staging, 'AgentStart.app')])
symlinkSync('/Applications', join(staging, 'Applications'))
rmSync(image, { force: true })
run('hdiutil', [
  'create',
  '-volname',
  `AgentStart ${version}`,
  '-srcfolder',
  staging,
  '-format',
  'UDZO',
  '-fs',
  'HFS+',
  '-ov',
  '-quiet',
  image
])
rmSync(staging, { force: true, recursive: true })

// Why: notarization staples to the image the user actually downloads, and stapling requires the
// image itself to carry a Developer ID signature rather than only the app inside it.
if (isRelease) {
  run('codesign', ['--force', '--timestamp', '--sign', identity, image])
}
console.log(`Packaged installer: ${image}`)

function run(command, commandArguments) {
  execFileSync(command, commandArguments, { stdio: 'inherit' })
}
