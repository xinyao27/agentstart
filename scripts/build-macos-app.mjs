// Why: Gatekeeper rejects a downloaded ad-hoc bundle and SwiftPM emits one host-arch binary, so a
// distributable app must be assembled, made universal, and signed with the release identity here.
import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = join(root, 'apps/macos')
const app = join(source, 'dist/AgentStart.app')
const contents = join(app, 'Contents')
const entitlements = join(source, 'entitlements.plist')
const universalTriples = ['arm64-apple-macosx', 'x86_64-apple-macosx']
const version = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')).version
const args = process.argv.slice(2)
const isUniversal = args.includes('--universal')
const isRelease = process.env.AGENTSTART_MAC_RELEASE === '1'
const identity = resolveSigningIdentity()

if (isRelease && identity === '-') {
  throw new Error('A Developer ID Application identity is required for a release build.')
}

// Why: resolve the daemon first so a wrong argument fails before a multi-minute Swift build.
const daemon = resolveDaemon()
const menuBar = buildMenuBar()

rmSync(app, { force: true, recursive: true })
mkdirSync(join(contents, 'MacOS'), { recursive: true })
mkdirSync(join(contents, 'Resources'), { recursive: true })
cpSync(
  join(source, 'Sources/AgentStartMenuBar/Resources/AgentStart.icns'),
  join(contents, 'Resources/AgentStart.icns')
)
cpSync(join(source, 'Info.plist'), join(contents, 'Info.plist'))
cpSync(menuBar.executable, join(contents, 'MacOS/AgentStartMenuBar'))
cpSync(daemon, join(contents, 'MacOS/agentstart'))
cpSync(
  menuBar.resourceBundle,
  join(contents, 'Resources/AgentStartMenuBar_AgentStartMenuBar.bundle'),
  {
    recursive: true
  }
)
stampVersion()

// Why: nested Mach-O must carry its own signature before the enclosing bundle seals it, or the
// bundle signature covers an unsigned executable and notarization rejects the submission. CI
// artifact downloads also drop the executable bit, which would ship an app that cannot spawn.
for (const path of ['MacOS/agentstart', 'MacOS/AgentStartMenuBar']) {
  chmodSync(join(contents, path), 0o755)
  codesign(join(contents, path))
}
codesign(app)
console.log(`Built app with ${signingKind(identity)} signature: ${app}`)

function buildMenuBar() {
  if (!isUniversal) {
    const binaryDirectory = swiftBuild([])
    return {
      executable: join(binaryDirectory, 'AgentStartMenuBar'),
      resourceBundle: join(binaryDirectory, 'AgentStartMenuBar_AgentStartMenuBar.bundle')
    }
  }
  const binaryDirectories = universalTriples.map((triple) =>
    swiftBuild(['--triple', triple, '--scratch-path', join(source, '.build/targets', triple)])
  )
  const executable = join(source, '.build/universal/AgentStartMenuBar')
  mkdirSync(dirname(executable), { recursive: true })
  run('lipo', [
    '-create',
    ...binaryDirectories.map((directory) => join(directory, 'AgentStartMenuBar')),
    '-output',
    executable
  ])
  return {
    executable,
    // Why: the resource bundle holds images and strings only, so either slice's copy is identical.
    resourceBundle: join(binaryDirectories[0], 'AgentStartMenuBar_AgentStartMenuBar.bundle')
  }
}

function swiftBuild(extraArguments) {
  const swiftArguments = ['build', '-c', 'release', '--package-path', source, ...extraArguments]
  run('swift', swiftArguments)
  return execFileSync('swift', [...swiftArguments, '--show-bin-path'], {
    encoding: 'utf8'
  }).trim()
}

function resolveDaemon() {
  const bundled = argumentValue('--daemon')
  if (bundled) {
    return resolve(bundled)
  }
  const arm64 = argumentValue('--daemon-arm64')
  const x64 = argumentValue('--daemon-x64')
  if (Boolean(arm64) !== Boolean(x64)) {
    throw new Error('--daemon-arm64 and --daemon-x64 must be passed together.')
  }
  if (!arm64 || !x64) {
    return join(root, 'apps/daemon/target/release/agentstart')
  }
  const executable = join(source, '.build/universal/agentstart')
  mkdirSync(dirname(executable), { recursive: true })
  run('lipo', ['-create', resolve(arm64), resolve(x64), '-output', executable])
  return executable
}

// Why: package.json owns the release version, so the checked-in plist value is only a SwiftPM
// placeholder and every assembled bundle is restamped from the package before signing.
function stampVersion() {
  for (const key of ['CFBundleShortVersionString', 'CFBundleVersion']) {
    run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${version}`, join(contents, 'Info.plist')])
  }
}

function codesign(target) {
  const codesignArguments = ['--force', '--sign', identity]
  if (isRelease) {
    codesignArguments.push('--options', 'runtime', '--timestamp', '--entitlements', entitlements)
  }
  run('codesign', [...codesignArguments, target])
}

function resolveSigningIdentity() {
  const explicit = process.env.AGENTSTART_MACOS_SIGN_IDENTITY ?? process.env.CSC_NAME
  if (explicit) {
    return explicit
  }
  let identities = ''
  try {
    identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8'
    })
  } catch {
    return '-'
  }
  const distribution = identities.match(/"([^"]*Developer ID Application:[^"]+)"/)?.[1]
  const development = identities.match(/"([^"]*Apple Development:[^"]+)"/)?.[1]
  return isRelease ? (distribution ?? '-') : (development ?? distribution ?? '-')
}

function signingKind(signingIdentity) {
  if (signingIdentity === '-') {
    return 'ad-hoc'
  }
  if (signingIdentity.includes('Developer ID Application:')) {
    return 'Developer ID'
  }
  if (signingIdentity.includes('Apple Development:')) {
    return 'Apple Development'
  }
  return 'certificate-backed'
}

function argumentValue(name) {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

function run(command, commandArguments) {
  execFileSync(command, commandArguments, { stdio: 'inherit' })
}
