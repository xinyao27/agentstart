#!/usr/bin/env node
// Why: one guarded command keeps the Chrome, iOS, and required runtime release workflows aligned
// without moving signing keys onto a developer machine.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'

import { assertReleaseNotes, releaseNotesRelativePath } from './release-notes.mjs'

const REPOSITORY = 'xinyao27/agentstart'
const ROOT = join(import.meta.dirname, '..')
const FORMULA_TEMPLATE_PATH = join(ROOT, 'Formula', 'agentstart.rb.template')
const MOBILE_PROJECT_PATH = join(ROOT, 'apps', 'mobile', 'project.yml')
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
  join(ROOT, 'apps', 'mobile', 'package.json'),
  join(ROOT, 'packages', 'cli', 'package.json')
]
const FORMULA_CHECKSUM_MARKERS = [
  '__SHA256_AGENTSTART_RUST_DARWIN_ARM64__',
  '__SHA256_AGENTSTART_RUST_DARWIN_X64__',
  '__SHA256_AGENTSTART_RUST_LINUX_ARM64__',
  '__SHA256_AGENTSTART_RUST_LINUX_X64__'
]
const DEFAULT_RELEASE_TARGETS = ['daemon', 'extension', 'ios']

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
    fail(`Expected a stable semantic version such as 0.1.0, received: ${version}`)
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
  // Why: unrelated local tag conflicts must not prevent checking the live release branch.
  execute('git', ['fetch', '--no-tags', 'origin', 'main'])
  const head = captureRequired('git', ['rev-parse', 'HEAD'])
  const remoteMain = captureRequired('git', ['rev-parse', 'FETCH_HEAD'])
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
}

function verifyFormulaTemplate() {
  const template = readFileSync(FORMULA_TEMPLATE_PATH, 'utf8')
  const versionMarkers = template.match(/__AGENTSTART_VERSION__/g) ?? []
  if (versionMarkers.length !== 5) {
    fail(`Homebrew formula template needs five version markers; found ${versionMarkers.length}`)
  }
  for (const marker of FORMULA_CHECKSUM_MARKERS) {
    const occurrences = template.split(marker).length - 1
    if (occurrences !== 1) {
      fail(`Homebrew formula template needs one ${marker} marker; found ${occurrences}`)
    }
  }
  if (/sha256 "[0-9a-f]{64}"/.test(template)) {
    fail('Homebrew formula template must not contain a release checksum')
  }
}

function currentIosVersion() {
  const project = readFileSync(MOBILE_PROJECT_PATH, 'utf8')
  const match = /^\s*MARKETING_VERSION:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/m.exec(project)
  if (!match) {
    fail('apps/mobile/project.yml does not declare MARKETING_VERSION')
  }
  parseVersion(match[1])
  return match[1]
}

function prepareReleaseNotes(version) {
  const relativePath = releaseNotesRelativePath(version)
  const path = join(ROOT, relativePath)
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `# AgentStart ${version}\n\n`)
  }
  return relativePath
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
      'MAC_CERTS_PASSWORD',
      'POSTHOG_WRITE_KEY'
    ]) {
      required.add(name)
    }
    const npmPackage = capture('npm', ['view', '@agentstart/cli', 'version'])
    if (!npmPackage.ok) {
      required.add('NPM_TOKEN')
    }
  }
  if (targets.includes('ios')) {
    for (const name of [
      'APPLE_TEAM_ID',
      'APP_STORE_APP_ID',
      'ASC_API_KEY_P8',
      'ASC_ISSUER_ID',
      'ASC_KEY_ID',
      'IOS_DIST_CERT_P12',
      'IOS_DIST_CERT_PASSWORD'
    ]) {
      required.add(name)
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

function remoteTagCommit(tag) {
  const ref = `refs/tags/${tag}`
  const output = captureRequired('git', ['ls-remote', '--tags', 'origin', ref, `${ref}^{}`])
  if (!output) {
    return null
  }
  const refs = new Map(output.split('\n').map((line) => line.split(/\s+/).toReversed()))
  const commit = refs.get(`${ref}^{}`) ?? refs.get(ref)
  if (!commit || !/^[0-9a-f]{40,64}$/.test(commit)) {
    fail(`Remote tag ${tag} did not resolve to a commit`)
  }
  return commit
}

function prepareTags(version, targets, iosVersion) {
  const requested = []
  if (targets.includes('daemon')) {
    requested.push(`v${version}`)
  }
  if (targets.includes('extension')) {
    requested.push(`extension-v${version}`)
  }
  if (targets.includes('ios')) {
    requested.push(`mobile-v${iosVersion}`)
  }

  const head = captureRequired('git', ['rev-parse', 'HEAD'])
  const toPush = []
  const created = []
  const existing = []
  for (const tag of requested) {
    const remoteCommit = remoteTagCommit(tag)
    if (remoteCommit) {
      if (remoteCommit !== head) {
        fail(
          `Remote tag ${tag} already points to ${remoteCommit}, not the current release commit ${head}`
        )
      }
      existing.push(tag)
      continue
    }
    const commit = tagCommit(tag)
    if (commit && commit !== head) {
      fail(`Local tag ${tag} already points to ${commit}, not the current release commit ${head}`)
    }
    toPush.push(tag)
  }

  for (const tag of toPush) {
    if (!tagCommit(tag)) {
      const tagVersion = tag.startsWith('mobile-v') ? iosVersion : version
      execute('git', ['tag', '-a', tag, '-m', `AgentStart ${tagVersion}`])
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

function workflowForReleaseTag(tag, version, iosVersion, distribution, changelog) {
  if (tag === `v${version}`) {
    return { fields: [], startsOnTagPush: true, workflow: 'daemon-release.yml' }
  }
  if (tag === `extension-v${version}`) {
    return { fields: [], startsOnTagPush: true, workflow: 'extension-package.yml' }
  }
  if (iosVersion && tag === `mobile-v${iosVersion}`) {
    const fields = [
      ['release_version', iosVersion],
      ['testflight_distribution', distribution]
    ]
    if (changelog) {
      fields.push(['testflight_changelog', changelog])
    }
    return { fields, startsOnTagPush: false, workflow: 'mobile-release.yml' }
  }
  fail(`Release tag ${tag} has no workflow route`)
}

async function prepare(version) {
  assertToolchain()
  assertCleanWorktree()
  assertMainIsPublished()
  const previousVersion = currentVersion()
  if (compareVersions(version, previousVersion) <= 0) {
    fail(`Release version ${version} must be newer than ${previousVersion}`)
  }

  console.log(`Preparing AgentStart daemon and desktop release ${previousVersion} → ${version}`)
  updateVersionSources(version)
  const releaseNotesPath = prepareReleaseNotes(version)
  execute('pnpm', ['exec', 'vp', 'run', '@agentstart/daemon#build'])
  execute('pnpm', ['exec', 'vp', 'run', '@agentstart/extension#package:web-store'])
  execute('pnpm', ['check'])
  verifyFormulaTemplate()

  console.log('\nDaemon and desktop release files are ready. Review them, then commit and push:')
  console.log(`  Finish the user-facing release notes in ${releaseNotesPath}`)
  const releaseFiles = [
    'package.json',
    'apps/daemon/package.json',
    'apps/computer-use-macos/package.json',
    'apps/daemon/Cargo.toml',
    'apps/daemon/Cargo.lock',
    'apps/extension/package.json',
    'apps/macos/package.json',
    'apps/mobile/package.json',
    'apps/macos/Info.plist',
    'packages/cli/package.json',
    'Formula/agentstart.rb.template',
    releaseNotesPath
  ]
  console.log(`  git add ${releaseFiles.join(' ')}`)
  console.log(`  git commit -m "chore: prepare ${version} release"`)
  console.log('  git push origin main')
  console.log(`  pnpm release -- publish ${version} --ios-version x.y.z`)
}

async function publish(version, args) {
  const options = parseOptions(args)
  const targets = selectedTargets(options)
  const distribution = options.values.get('ios-distribution') ?? 'internal'
  const iosVersion = options.values.get('ios-version')
  if (distribution !== 'internal' && distribution !== 'external') {
    fail('--ios-distribution must be internal or external')
  }
  if (targets.includes('ios')) {
    if (!iosVersion) {
      fail('iOS releases require --ios-version x.y.z')
    }
    parseVersion(iosVersion)
  }
  assertToolchain()
  assertCleanWorktree()
  assertMainIsPublished()
  if (currentVersion() !== version) {
    fail(`Package version is ${currentVersion()}, not ${version}`)
  }
  verifyFormulaTemplate()
  if (targets.includes('daemon')) {
    assertReleaseNotes(ROOT, version)
  }
  assertGitHubCredentials(targets)
  await confirmPublish(version, targets, options)

  const tags = prepareTags(version, targets, iosVersion)
  const changelog = options.values.get('ios-changelog')
  for (const tag of tags.existing) {
    const route = workflowForReleaseTag(tag, version, iosVersion, distribution, changelog)
    dispatchWorkflow(route.workflow, tag, route.fields)
  }
  for (const tag of tags.pushed) {
    const route = workflowForReleaseTag(tag, version, iosVersion, distribution, changelog)
    if (!route.startsOnTagPush) {
      dispatchWorkflow(route.workflow, tag, route.fields)
    }
  }
  console.log('\nRelease workflows started:')
  console.log(`  https://github.com/${REPOSITORY}/actions`)
  console.log(
    `  pnpm release -- status ${version} --ios-version ${iosVersion ?? currentIosVersion()}`
  )
}

function status(version, args) {
  const options = parseOptions(args)
  const unexpectedValues = [...options.values.keys()].filter((name) => name !== 'ios-version')
  if (options.flags.size > 0 || unexpectedValues.length > 0) {
    fail('status only accepts --ios-version x.y.z')
  }
  parseVersion(version)
  const iosVersion = options.values.get('ios-version') ?? currentIosVersion()
  parseVersion(iosVersion)
  const targets = [
    { ref: `v${version}`, workflow: 'daemon-release.yml' },
    { ref: `extension-v${version}`, workflow: 'extension-package.yml' },
    { ref: `mobile-v${iosVersion}`, workflow: 'mobile-release.yml' }
  ]
  console.log('WORKFLOW\tREF\tSTATUS\tURL')
  for (const target of targets) {
    const output = captureRequired('gh', [
      'run',
      'list',
      '--repo',
      REPOSITORY,
      '--workflow',
      target.workflow,
      '--limit',
      '50',
      '--json',
      'status,conclusion,headBranch,url,createdAt'
    ])
    const runs = JSON.parse(output)
    const run = runs.find((candidate) => candidate.headBranch === target.ref)
    console.log(
      `${target.workflow}\t${target.ref}\t${run?.conclusion || run?.status || 'not started'}\t${run?.url ?? ''}`
    )
  }
}

function help() {
  console.log(`AgentStart release conductor

Usage:
  pnpm release -- prepare <daemon-version>
  pnpm release -- publish <daemon-version> [options]
  pnpm release -- status [daemon-version] [--ios-version x.y.z]

Publish options:
  Default targets: Chrome extension, iOS TestFlight, and their required daemon runtime
  Daemon publishing requires POSTHOG_WRITE_KEY and reviewed docs/releases/<version>.md
  --skip-daemon       Do not publish the daemon, GitHub release, Homebrew, or npm CLI
  --skip-extension    Do not submit the Chrome extension
  --skip-ios          Do not upload an iOS build to TestFlight
  --ios-version       Required exact iOS marketing version unless --skip-ios is used
  --ios-distribution  internal (default) or external
  --ios-changelog     TestFlight changelog used for an external release
  --yes               Skip the typed release confirmation
`)
}

const rawArguments = process.argv.slice(2)
const releaseArguments = rawArguments[0] === '--' ? rawArguments.slice(1) : rawArguments
const [command = 'help', versionArgument, ...args] = releaseArguments

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
    status(versionArgument ?? currentVersion(), args)
  } else {
    help()
  }
} catch (error) {
  console.error(`\nRelease stopped: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
