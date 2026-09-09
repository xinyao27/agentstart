#!/usr/bin/env node
// Why: one guarded command keeps the Chrome, iOS, and required runtime release workflows aligned
// without moving signing keys onto a developer machine.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

const REPOSITORY = 'xinyao27/yiru'
const ROOT = join(import.meta.dirname, '..')
const FORMULA_PATH = join(ROOT, 'Formula', 'yiru.rb')
const RUST_DAEMON_ROOT = join(ROOT, 'apps', 'daemon')
const RUST_MANIFEST_PATH = join(RUST_DAEMON_ROOT, 'Cargo.toml')
// Why: the macOS bundle reports its own version to Finder and Gatekeeper from Info.plist, so it is
// written here beside the package versions rather than substituted at package time.
const MACOS_INFO_PLIST_PATH = join(ROOT, 'apps', 'macos', 'Info.plist')
const PACKAGE_PATHS = [
  join(ROOT, 'package.json'),
  join(ROOT, 'apps', 'daemon', 'package.json'),
  join(ROOT, 'apps', 'computer-use-macos', 'package.json'),
  join(ROOT, 'apps', 'extension', 'package.json'),
  join(ROOT, 'apps', 'macos', 'package.json'),
  join(ROOT, 'packages', 'cli', 'package.json')
]
// Why: the release workflow pins these Homebrew checksums from its signed artifacts because Rust
// release bytes exist only after CI signs and notarizes them and cannot be built locally; prepare
// keeps the formula URLs aligned with the version instead.
const RELEASE_ARTIFACTS = [
  'yiru-rust-darwin-arm64',
  'yiru-rust-darwin-x64',
  'yiru-rust-linux-arm64',
  'yiru-rust-linux-x64'
]
const DEFAULT_RELEASE_TARGETS = ['daemon', 'extension', 'ios']
const OPTIONAL_RELEASE_TARGETS = ['apns']

function fail(message) {
  throw new Error(message)
}

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
    ...options
  })
  if (result.error) {
    fail(`${command} could not start: ${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(`${command} exited with status ${result.status ?? 'unknown'}`)
  }
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    ...options
  })
  return {
    ok: result.status === 0,
    output: result.stdout?.trim() ?? '',
    error: result.stderr?.trim() ?? ''
  }
}

function captureRequired(command, args, options) {
  const result = capture(command, args, options)
  if (!result.ok) {
    fail(result.error || `${command} failed`)
  }
  return result.output
}

function readPackage(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function releaseVersions() {
  return PACKAGE_PATHS.map((path) => readPackage(path).version)
}

function currentVersion() {
  const versions = releaseVersions()
  if (new Set(versions).size !== 1) {
    fail(`Release package versions differ: ${versions.join(', ')}`)
  }
  return versions[0]
}

function parseVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version)
  if (!match) {
    fail(`Expected a stable semantic version such as 0.0.37, received: ${version}`)
  }
  return match.slice(1).map(Number)
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index] - rightParts[index]
    if (difference !== 0) {
      return difference
    }
  }
  return 0
}

function assertToolchain() {
  const bunVersion = captureRequired('bun', ['--version'])
  if (bunVersion !== '1.4.0') {
    fail(`Release artifacts require Bun 1.4.0 to match CI; found ${bunVersion}`)
  }
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10)
  if (nodeMajor !== 24) {
    fail(`Release commands require Node.js 24; found ${process.versions.node}`)
  }
  captureRequired('pnpm', ['--version'])
  const rustVersion = captureRequired('rustc', ['--version'])
  if (!rustVersion.startsWith('rustc 1.95.0 ')) {
    fail(`Release commands require Rust 1.95.0; found ${rustVersion}`)
  }
  captureRequired('cargo', ['--version'])
}

function assertCleanWorktree() {
  const changes = captureRequired('git', ['status', '--porcelain'])
  if (changes) {
    fail(
      'The release command requires a clean worktree. Commit or stash the current changes first.'
    )
  }
}

function assertMainIsPublished() {
  const branch = captureRequired('git', ['branch', '--show-current'])
  if (branch !== 'main') {
    fail(`Releases must run from main; current branch is ${branch || 'detached'}`)
  }
  execute('git', ['fetch', 'origin', 'main', '--tags'])
  const head = captureRequired('git', ['rev-parse', 'HEAD'])
  const remoteMain = captureRequired('git', ['rev-parse', 'origin/main'])
  if (head !== remoteMain) {
    fail('Local main must exactly match origin/main before releasing.')
  }
}

function writePackageVersion(path, version) {
  const manifest = readPackage(path)
  manifest.version = version
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

function replaceExactlyOnce(source, pattern, replacement, label) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))]
  if (matches.length !== 1) {
    fail(`Expected one ${label} marker, found ${matches.length}`)
  }
  return source.replace(pattern, replacement)
}

function updateVersionSources(version) {
  for (const path of PACKAGE_PATHS) {
    writePackageVersion(path, version)
  }

  const rustManifest = readFileSync(RUST_MANIFEST_PATH, 'utf8')
  writeFileSync(
    RUST_MANIFEST_PATH,
    replaceExactlyOnce(
      rustManifest,
      /^version = "\d+\.\d+\.\d+"$/m,
      `version = "${version}"`,
      'Rust daemon package version'
    )
  )
  execute('cargo', ['check'], { cwd: RUST_DAEMON_ROOT })

  const macosInfoPlist = readFileSync(MACOS_INFO_PLIST_PATH, 'utf8')
  writeFileSync(
    MACOS_INFO_PLIST_PATH,
    replaceExactlyOnce(
      macosInfoPlist,
      /<key>CFBundleShortVersionString<\/key><string>\d+\.\d+\.\d+<\/string>/,
      `<key>CFBundleShortVersionString</key><string>${version}</string>`,
      'macOS bundle short version'
    )
  )

  const formula = readFileSync(FORMULA_PATH, 'utf8')
    .replace(/version "\d+\.\d+\.\d+"/, `version "${version}"`)
    .replace(/\/releases\/download\/v\d+\.\d+\.\d+\//g, `/releases/download/v${version}/`)
  writeFileSync(FORMULA_PATH, formula)
}

function verifyFormula(version) {
  const formula = readFileSync(FORMULA_PATH, 'utf8')
  if (!formula.includes(`version "${version}"`)) {
    fail(`Homebrew formula is not set to ${version}`)
  }
  for (const artifact of RELEASE_ARTIFACTS) {
    if (!formula.includes(`/v${version}/${artifact}`)) {
      fail(`Homebrew formula is missing ${artifact} for ${version}`)
    }
  }
}

function parseOptions(args) {
  const values = new Map()
  const flags = new Set()
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (!argument.startsWith('--')) {
      continue
    }
    const separator = argument.indexOf('=')
    if (separator !== -1) {
      values.set(argument.slice(2, separator), argument.slice(separator + 1))
      continue
    }
    const next = args[index + 1]
    if (next && !next.startsWith('--')) {
      values.set(argument.slice(2), next)
      index += 1
    } else {
      flags.add(argument.slice(2))
    }
  }
  return { flags, values }
}

function selectedTargets(options) {
  const targets = DEFAULT_RELEASE_TARGETS.filter((target) => !options.flags.has(`skip-${target}`))
  for (const target of OPTIONAL_RELEASE_TARGETS) {
    if (options.flags.has(`with-${target}`)) {
      targets.push(target)
    }
  }
  if (targets.length === 0) {
    fail('At least one release target must be selected.')
  }
  return targets
}

function secretNames(args = []) {
  const result = capture('gh', [
    'secret',
    'list',
    '--repo',
    REPOSITORY,
    ...args,
    '--json',
    'name',
    '--jq',
    '.[].name'
  ])
  return result.ok ? new Set(result.output.split('\n').filter(Boolean)) : new Set()
}

function assertGitHubCredentials(targets) {
  execute('gh', ['auth', 'status'])
  const repository = captureRequired('gh', [
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '--jq',
    '.nameWithOwner'
  ])
  if (repository !== REPOSITORY) {
    fail(`GitHub CLI resolved ${repository}; expected ${REPOSITORY}`)
  }

  const repositorySecrets = secretNames()
  const required = new Set()
  if (targets.includes('daemon')) {
    for (const name of [
      'APPLE_APP_SPECIFIC_PASSWORD',
      'APPLE_ID',
      'APPLE_TEAM_ID',
      'MAC_CERTS',
      'MAC_CERTS_PASSWORD'
    ]) {
      required.add(name)
    }
    const npmPackage = capture('npm', ['view', '@yiru/cli', 'version'])
    if (!npmPackage.ok) {
      required.add('NPM_TOKEN')
    }
  }
  if (targets.includes('ios')) {
    for (const name of [
      'APPLE_TEAM_ID',
      'ASC_API_KEY_P8',
      'ASC_ISSUER_ID',
      'ASC_KEY_ID',
      'IOS_DIST_CERT_P12',
      'IOS_DIST_CERT_PASSWORD'
    ]) {
      required.add(name)
    }
  }
  if (targets.includes('apns')) {
    for (const name of [
      'APNS_KEY_ID',
      'APNS_KEY_P8',
      'APNS_TEAM_ID',
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_API_TOKEN',
      'GATEWAY_SHARED_SECRET'
    ]) {
      required.add(name)
    }
    const enabled = capture('gh', [
      'variable',
      'get',
      'APNS_GATEWAY_ENABLED',
      '--repo',
      REPOSITORY,
      '--json',
      'value',
      '--jq',
      '.value'
    ])
    if (!enabled.ok || enabled.output !== 'true') {
      required.add('GitHub variable APNS_GATEWAY_ENABLED=true')
    }
  }

  const missing = [...required].filter((name) => !repositorySecrets.has(name))
  if (targets.includes('extension')) {
    const environment = capture('gh', [
      'api',
      `repos/${REPOSITORY}/environments/chrome-web-store`,
      '--silent'
    ])
    if (!environment.ok) {
      missing.push('GitHub environment: chrome-web-store')
    } else {
      const environmentSecrets = secretNames(['--env', 'chrome-web-store'])
      for (const name of [
        'CWS_CLIENT_ID',
        'CWS_CLIENT_SECRET',
        'CWS_PUBLISHER_ID',
        'CWS_REFRESH_TOKEN'
      ]) {
        if (!environmentSecrets.has(name)) {
          missing.push(`chrome-web-store/${name}`)
        }
      }
    }
  }

  if (missing.length > 0) {
    fail(`Release credentials are missing:\n- ${missing.join('\n- ')}`)
  }
}

function tagCommit(tag) {
  const result = capture('git', ['rev-list', '-n', '1', tag])
  return result.ok ? result.output : null
}

function remoteTagExists(tag) {
  return capture('git', ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`]).ok
}

function prepareTags(version, targets) {
  const requested = []
  if (targets.includes('daemon')) {
    requested.push(`v${version}`)
  }
  if (targets.includes('extension')) {
    requested.push(`extension-v${version}`)
  }

  const head = captureRequired('git', ['rev-parse', 'HEAD'])
  const toPush = []
  const created = []
  const existing = []
  for (const tag of requested) {
    const commit = tagCommit(tag)
    if (commit && commit !== head) {
      fail(`Tag ${tag} already points to ${commit}, not the current release commit ${head}`)
    }
    if (remoteTagExists(tag)) {
      existing.push(tag)
    } else {
      toPush.push(tag)
    }
  }

  for (const tag of toPush) {
    if (!tagCommit(tag)) {
      execute('git', ['tag', '-a', tag, '-m', `Yiru ${version}`])
      created.push(tag)
    }
  }
  if (toPush.length > 0) {
    try {
      execute('git', [
        'push',
        '--atomic',
        'origin',
        ...toPush.map((tag) => `refs/tags/${tag}:refs/tags/${tag}`)
      ])
    } catch (error) {
      for (const tag of created) {
        execute('git', ['tag', '--delete', tag])
      }
      throw error
    }
  }
  return { existing, pushed: toPush }
}

async function confirmPublish(version, targets, options) {
  if (options.flags.has('yes')) {
    return
  }
  if (!process.stdin.isTTY) {
    fail('Interactive confirmation requires a terminal; pass --yes in automation.')
  }
  console.log(`\nRelease ${version} to: ${targets.join(', ')}`)
  const readline = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await readline.question(`Type ${version} to publish: `)
  readline.close()
  if (answer !== version) {
    fail('Release cancelled.')
  }
}

function dispatchWorkflow(workflow, ref, fields = []) {
  const args = ['workflow', 'run', workflow, '--repo', REPOSITORY, '--ref', ref]
  for (const [name, value] of fields) {
    args.push('-f', `${name}=${value}`)
  }
  execute('gh', args)
}

function ensureMainWorkflow(workflow) {
  const head = captureRequired('git', ['rev-parse', 'HEAD'])
  const existing = capture('gh', [
    'run',
    'list',
    '--repo',
    REPOSITORY,
    '--workflow',
    workflow,
    '--commit',
    head,
    '--limit',
    '1',
    '--json',
    'url',
    '--jq',
    '.[0].url // ""'
  ])
  if (existing.ok && existing.output) {
    console.log(`${workflow} already started for the release commit: ${existing.output}`)
  } else {
    dispatchWorkflow(workflow, 'main')
  }
}

async function prepare(version) {
  assertToolchain()
  assertCleanWorktree()
  assertMainIsPublished()
  const previousVersion = currentVersion()
  if (compareVersions(version, previousVersion) <= 0) {
    fail(`Release version ${version} must be newer than ${previousVersion}`)
  }

  console.log(`Preparing Yiru ${previousVersion} → ${version}`)
  updateVersionSources(version)
  execute('pnpm', ['exec', 'vp', 'run', '@yiru/daemon#build'])
  execute('pnpm', ['exec', 'vp', 'run', '@yiru/extension#package:web-store'])
  execute('pnpm', ['check'])
  verifyFormula(version)

  console.log('\nRelease files are ready. Review them, then commit and push:')
  const releaseFiles = [
    'package.json',
    'apps/daemon/package.json',
    'apps/computer-use-macos/package.json',
    'apps/daemon/Cargo.toml',
    'apps/daemon/Cargo.lock',
    'apps/extension/package.json',
    'apps/macos/package.json',
    'apps/macos/Info.plist',
    'packages/cli/package.json',
    'Formula/yiru.rb'
  ]
  console.log(`  git add ${releaseFiles.join(' ')}`)
  console.log(`  git commit -m "chore: prepare ${version} release"`)
  console.log('  git push origin main')
  console.log(`  pnpm release -- publish ${version}`)
}

async function publish(version, args) {
  const options = parseOptions(args)
  const targets = selectedTargets(options)
  const distribution = options.values.get('ios-distribution') ?? 'internal'
  if (distribution !== 'internal' && distribution !== 'external') {
    fail('--ios-distribution must be internal or external')
  }
  assertToolchain()
  assertCleanWorktree()
  assertMainIsPublished()
  if (currentVersion() !== version) {
    fail(`Package version is ${currentVersion()}, not ${version}`)
  }
  verifyFormula(version)
  assertGitHubCredentials(targets)
  await confirmPublish(version, targets, options)

  const tags = prepareTags(version, targets)
  for (const tag of tags.existing) {
    const workflow = tag.startsWith('extension-') ? 'extension-package.yml' : 'daemon-release.yml'
    dispatchWorkflow(workflow, tag)
  }

  if (targets.includes('ios')) {
    const fields = [
      ['release_version', version],
      ['bump_patch_version', 'false'],
      ['testflight_distribution', distribution]
    ]
    const changelog = options.values.get('ios-changelog')
    if (changelog) {
      fields.push(['testflight_changelog', changelog])
    }
    dispatchWorkflow('mobile-release.yml', 'main', fields)
  }
  if (targets.includes('apns')) {
    ensureMainWorkflow('apns-gateway.yml')
  }

  console.log('\nRelease workflows started:')
  console.log(`  https://github.com/${REPOSITORY}/actions`)
  console.log(`  pnpm release -- status ${version}`)
}

function status(version) {
  execute('gh', [
    'run',
    'list',
    '--repo',
    REPOSITORY,
    '--limit',
    '15',
    '--json',
    'workflowName,displayTitle,status,conclusion,headBranch,url',
    '--template',
    '{{tablerow "WORKFLOW" "REF" "STATUS" "URL"}}{{range .}}{{tablerow .workflowName .headBranch (or .conclusion .status) .url}}{{end}}'
  ])
  console.log(`\nExpected release tags: v${version}, extension-v${version}`)
}

function help() {
  console.log(`Yiru release conductor

Usage:
  pnpm release -- prepare <version>
  pnpm release -- publish <version> [options]
  pnpm release -- status [version]

Publish options:
  Default targets: Chrome extension, iOS TestFlight, and their required daemon runtime
  --skip-daemon       Do not publish the daemon, GitHub release, Homebrew, or npm CLI
  --skip-extension    Do not submit the Chrome extension
  --skip-ios          Do not upload an iOS build to TestFlight
  --with-apns         Also redeploy the APNs gateway
  --ios-distribution  internal (default) or external
  --ios-changelog     TestFlight changelog used for an external release
  --yes               Skip the typed release confirmation
`)
}

const [command = 'help', versionArgument, ...args] = process.argv.slice(2)

try {
  if (command === 'prepare') {
    if (!versionArgument) {
      fail('prepare requires a version')
    }
    await prepare(versionArgument)
  } else if (command === 'publish') {
    if (!versionArgument) {
      fail('publish requires a version')
    }
    parseVersion(versionArgument)
    await publish(versionArgument, args)
  } else if (command === 'status') {
    status(versionArgument ?? currentVersion())
  } else {
    help()
  }
} catch (error) {
  console.error(`\nRelease stopped: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
