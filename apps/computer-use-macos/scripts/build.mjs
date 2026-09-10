// Why: SwiftPM emits a binary, while macOS TCC needs a signed helper app with a stable identity.
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'

const PACKAGE_ROOT = join(import.meta.dirname, '..')
const packageMetadata = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'))
const appVersion = packageMetadata.version
const releaseRoot = join(PACKAGE_ROOT, '.build', 'release')
const binaryPath = join(releaseRoot, 'agentstart-computer-use-macos')
const appPath = join(releaseRoot, 'AgentStart Computer Use.app')
const appExecutablePath = join(appPath, 'Contents', 'MacOS', 'agentstart-computer-use-macos')
const appResourcesPath = join(appPath, 'Contents', 'Resources')
const localizationPath = join(PACKAGE_ROOT, 'resources', 'localization')
const iconPath = join(PACKAGE_ROOT, 'resources', 'app-icon.icns')
const bundleId =
  process.env.AGENTSTART_COMPUTER_MACOS_BUNDLE_ID ?? 'com.xinyao27.agentstart.computer-use'
const universalTriples = ['arm64-apple-macosx', 'x86_64-apple-macosx']

if (process.platform !== 'darwin') {
  process.exit(0)
}

if (process.argv.includes('--universal')) {
  buildUniversalBinary()
} else {
  const builtBinary = buildBinary()
  mkdirSync(dirname(binaryPath), { recursive: true })
  copyFileSync(builtBinary, binaryPath)
}
chmodSync(binaryPath, 0o755)
createHelperApp()

function buildUniversalBinary() {
  const binaries = universalTriples.map(buildBinary)
  mkdirSync(dirname(binaryPath), { recursive: true })
  run(['lipo', '-create', ...binaries, '-output', binaryPath])
}

function buildBinary(triple) {
  const scratchPath = triple
    ? join(PACKAGE_ROOT, '.build', 'targets', triple)
    : join(PACKAGE_ROOT, '.build', 'current')
  const argumentsList = [
    'build',
    '-c',
    'release',
    '--package-path',
    PACKAGE_ROOT,
    '--scratch-path',
    scratchPath,
    ...(triple ? ['--triple', triple] : [])
  ]
  run(['swift', ...argumentsList])
  const productDirectory = output(['swift', ...argumentsList, '--show-bin-path'])
  return join(productDirectory, 'agentstart-computer-use-macos')
}

function createHelperApp() {
  rmSync(appPath, { force: true, recursive: true })
  mkdirSync(dirname(appExecutablePath), { recursive: true })
  mkdirSync(appResourcesPath, { recursive: true })
  copyFileSync(binaryPath, appExecutablePath)
  copyFileSync(
    join(PACKAGE_ROOT, 'vendor', 'permission-flow', 'LICENSE'),
    join(appResourcesPath, 'PermissionFlow-LICENSE.txt')
  )
  if (existsSync(iconPath)) {
    copyFileSync(iconPath, join(appResourcesPath, 'AppIcon.icns'))
  }
  for (const locale of ['en.lproj', 'zh-Hans.lproj']) {
    cpSync(join(localizationPath, locale), join(appResourcesPath, locale), { recursive: true })
  }
  chmodSync(appExecutablePath, 0o755)
  writeFileSync(join(appPath, 'Contents', 'Info.plist'), infoPlist(), 'utf8')
  run(['codesign', ...codesignArguments(resolveSigningIdentity(), appPath)])
}

function codesignArguments(identity, targetPath) {
  const args = ['--force', '--deep', '--sign', identity]
  if (process.env.AGENTSTART_MAC_RELEASE === '1' && identity !== '-') {
    args.push(
      '--options',
      'runtime',
      '--timestamp',
      '--entitlements',
      join(PACKAGE_ROOT, 'entitlements.plist')
    )
  }
  args.push(targetPath)
  return args
}

function resolveSigningIdentity() {
  const explicit = process.env.AGENTSTART_COMPUTER_MACOS_SIGN_IDENTITY ?? process.env.CSC_NAME
  if (explicit) {
    return explicit
  }
  const result = Bun.spawnSync(['security', 'find-identity', '-v', '-p', 'codesigning'], {
    stderr: 'ignore',
    stdout: 'pipe'
  })
  if (result.exitCode !== 0) {
    return '-'
  }
  const identities = result.stdout.toString()
  const development = identities.match(/"([^"]*Apple Development:[^"]+)"/)?.[1]
  const distribution =
    identities.match(/"([^"]*Developer ID Application:[^"]+)"/)?.[1] ??
    identities.match(/"([^"]*Apple Distribution:[^"]+)"/)?.[1]
  return process.env.AGENTSTART_MAC_RELEASE === '1'
    ? (distribution ?? development ?? '-')
    : (development ?? distribution ?? '-')
}

function run(command) {
  const result = Bun.spawnSync(command, { stderr: 'inherit', stdout: 'inherit' })
  if (result.signalCode) {
    process.kill(process.pid, result.signalCode)
  }
  if (result.exitCode !== 0) {
    process.exit(result.exitCode)
  }
}

function output(command) {
  const result = Bun.spawnSync(command, { stderr: 'inherit', stdout: 'pipe' })
  if (result.exitCode !== 0) {
    process.exit(result.exitCode)
  }
  return result.stdout.toString().trim()
}

function infoPlist() {
  const icon = existsSync(iconPath)
    ? '  <key>CFBundleIconFile</key>\n  <string>AppIcon</string>\n'
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>agentstart-computer-use-macos</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleId}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
${icon}  <key>CFBundleName</key>
  <string>AgentStart Computer Use</string>
  <key>CFBundleDisplayName</key>
  <string>AgentStart Computer Use</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${appVersion}</string>
  <key>CFBundleVersion</key>
  <string>${appVersion.replace(/\D/g, '') || '1'}</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSAccessibilityUsageDescription</key>
  <string>AgentStart Computer Use needs Accessibility permission to read and interact with app interfaces when you ask AgentStart to use apps.</string>
  <key>NSScreenCaptureUsageDescription</key>
  <string>AgentStart Computer Use needs Screen Recording permission to capture app windows when you ask AgentStart to inspect your screen.</string>
</dict>
</plist>
`
}
