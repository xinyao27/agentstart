// Why: Web Store submission needs a deterministic root-level ZIP plus a checksum and structural
// review gate; the ordinary WXT build intentionally emits only an unpacked extension directory.
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

const packageRoot = join(import.meta.dirname, '..')
const distRoot = join(packageRoot, '.output', 'chrome-mv3')
const releaseRoot = join(packageRoot, 'release')
const packageJson = await Bun.file(join(packageRoot, 'package.json')).json()
const manifest = await Bun.file(join(distRoot, 'manifest.json')).json()
const initialUpload = process.argv.includes('--initial-upload')
const expectedExtensionId = 'mfgmfiabfncmdekmikepemddejoeihbf'
const devIconPaths = new Set([
  'icons/dev-16.png',
  'icons/dev-32.png',
  'icons/dev-48.png',
  'icons/dev-128.png'
])

if (manifest.manifest_version !== 3 || manifest.version !== packageJson.version) {
  throw new Error('web_store_manifest_version_mismatch')
}
if (extensionId(manifest.key) !== expectedExtensionId) {
  throw new Error('web_store_extension_id_mismatch')
}
if (manifest.options_page || manifest.options_ui) {
  throw new Error('web_store_standalone_settings_page')
}
const manifestIconPaths = [
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {})
]
if (manifestIconPaths.some((path) => devIconPaths.has(path))) {
  throw new Error('web_store_dev_icon_reference')
}
for (const required of [
  '_locales/en/messages.json',
  '_locales/zh_CN/messages.json',
  'background.js',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
  'managed-storage-schema.json',
  'manifest.json',
  'side-panel.html'
]) {
  if (!(await Bun.file(join(distRoot, required)).exists())) {
    throw new Error(`web_store_required_file_missing:${required}`)
  }
}

const zipRoot = initialUpload ? mkdtempSync(join(tmpdir(), 'agentstart-cws-')) : distRoot
if (initialUpload) {
  // Why: Chrome Web Store creates the first item and its authoritative ID; the pinned development
  // key is adopted only after that item exposes its public key in the Package tab.
  cpSync(distRoot, zipRoot, { recursive: true })
  const uploadManifestPath = join(zipRoot, 'manifest.json')
  const uploadManifest = await Bun.file(uploadManifestPath).json()
  delete uploadManifest.key
  await Bun.write(uploadManifestPath, `${JSON.stringify(uploadManifest, null, 2)}\n`)
}

const files = listFiles(zipRoot).filter((path) => !devIconPaths.has(path))
if (files.includes('settings.html')) {
  throw new Error('web_store_standalone_settings_page')
}
if (
  files.some((path) =>
    /(?:^|\/)(?:\.DS_Store|\.git|node_modules)(?:\/|$)|(?:^|\/)\.env(?:\.|\/|$)|\.(?:cer|crt|der|key|map|mobileprovision|p12|p8|pem)$/i.test(
      path
    )
  )
) {
  throw new Error('web_store_forbidden_file_present')
}

const stableTime = new Date('2026-01-01T00:00:00.000Z')
for (const path of files) {
  utimesSync(join(zipRoot, path), stableTime, stableTime)
}
mkdirSync(releaseRoot, { recursive: true })
const archiveName = `agentstart-extension-${packageJson.version}${initialUpload ? '-initial-upload' : ''}.zip`
const archivePath = join(releaseRoot, archiveName)
rmSync(archivePath, { force: true })

const zip = Bun.spawnSync(['zip', '-X', '-q', archivePath, ...files], {
  cwd: zipRoot,
  // Why: ZIP stores DOS local timestamps; UTC keeps the same package bytes across developer and CI
  // time zones after the source mtimes above are normalized.
  env: { ...process.env, TZ: 'UTC' },
  stderr: 'pipe',
  stdout: 'pipe'
})
if (zip.exitCode !== 0) {
  throw new Error(`web_store_zip_failed:${zip.stderr.toString().trim()}`)
}
const digest = new Bun.CryptoHasher('sha256')
  .update(await Bun.file(archivePath).bytes())
  .digest('hex')
await Bun.write(join(releaseRoot, `${archiveName}.sha256`), `${digest}  ${archiveName}\n`)
if (initialUpload) {
  rmSync(zipRoot, { recursive: true, force: true })
}
console.log(JSON.stringify({ archivePath, digest, files: files.length }))

function listFiles(root) {
  const pending = [root]
  const files = []
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const name of readdirSync(directory).sort()) {
      const absolutePath = join(directory, name)
      if (statSync(absolutePath).isDirectory()) {
        pending.push(absolutePath)
      } else {
        files.push(relative(root, absolutePath).replaceAll('\\', '/'))
      }
    }
  }
  return files.sort()
}

function extensionId(key) {
  if (typeof key !== 'string' || !key) {
    return ''
  }
  const prefix = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)
  return [...prefix].map((value) => String.fromCharCode(97 + Number.parseInt(value, 16))).join('')
}
