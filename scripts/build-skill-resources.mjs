// Why: daemon releases embed skill metadata and CLI guides derived from repository product content.
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'

import { parse } from 'yaml'

const WORKSPACE_ROOT = resolve(import.meta.dirname, '..')
const SKILLS_ROOT = join(WORKSPACE_ROOT, 'skills')
const DAEMON_PACKAGE_PATH = join(WORKSPACE_ROOT, 'apps', 'daemon', 'package.json')

function compareCodeUnits(left, right) {
  return left === right ? 0 : left < right ? -1 : 1
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function gitObjectSha(kind, bytes) {
  return createHash('sha1').update(`${kind} ${bytes.length}\0`).update(bytes).digest()
}

function normalizeText(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  return Buffer.from(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8')
}

function describeFile(path, bytes) {
  let normalized = null
  if (!bytes.includes(0)) {
    try {
      normalized = normalizeText(bytes)
    } catch {
      normalized = null
    }
  }
  const classification = normalized ? 'text' : 'binary'
  const exactSha256 = sha256(bytes)
  const textNormalizedSha256 = normalized ? sha256(normalized) : null
  return {
    path,
    size: bytes.length,
    executable: false,
    classification,
    exactSha256,
    textNormalizedSha256,
    identitySha256: textNormalizedSha256 ?? exactSha256,
    gitBlobSha: gitObjectSha('blob', bytes)
  }
}

function compareManifestPaths(left, right) {
  const leftParts = left.split('/')
  const rightParts = right.split('/')
  const sharedLength = Math.min(leftParts.length, rightParts.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const result = compareCodeUnits(leftParts[index], rightParts[index])
    if (result !== 0) {
      return result
    }
  }
  return leftParts.length - rightParts.length
}

async function collectSkillFiles(packageRoot) {
  const files = []
  const foldedPaths = new Map()

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => compareCodeUnits(left.name, right.name))
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name)
      const relativePath = relative(packageRoot, absolutePath)
      if (
        isAbsolute(relativePath) ||
        relativePath === '..' ||
        relativePath.startsWith(`..${sep}`)
      ) {
        throw new Error(`Unsafe skill package path: ${relativePath}`)
      }
      const manifestPath = relativePath.split(sep).join('/')
      const foldedPath = manifestPath.toLocaleLowerCase('en-US')
      const collision = foldedPaths.get(foldedPath)
      if (collision && collision !== manifestPath) {
        throw new Error(`Case-colliding skill paths: ${collision} and ${manifestPath}`)
      }
      foldedPaths.set(foldedPath, manifestPath)
      const fileStat = await lstat(absolutePath)
      if (fileStat.isSymbolicLink()) {
        throw new Error(`Symlink is not allowed in a shipped skill: ${manifestPath}`)
      }
      if (fileStat.isDirectory()) {
        await visit(absolutePath)
        continue
      }
      if (!fileStat.isFile()) {
        throw new Error(`Special file is not allowed in a shipped skill: ${manifestPath}`)
      }
      if ((fileStat.mode & 0o111) !== 0) {
        throw new Error(`Executable file is not allowed in a shipped skill: ${manifestPath}`)
      }
      files.push(describeFile(manifestPath, await readFile(absolutePath)))
    }
  }

  await visit(packageRoot)
  return files.sort((left, right) => compareManifestPaths(left.path, right.path))
}

function skillPackageDigest(files) {
  return sha256(
    Buffer.from(
      JSON.stringify(
        files.map((file) => ({
          path: file.path,
          executable: file.executable,
          classification: file.classification,
          identitySha256: file.identitySha256
        }))
      )
    )
  )
}

function skillPackageGitTreeSha(files) {
  const root = { directories: new Map(), files: [] }
  for (const file of files) {
    const parts = file.path.split('/')
    const filename = parts.pop()
    let directory = root
    for (const part of parts) {
      let child = directory.directories.get(part)
      if (!child) {
        child = { directories: new Map(), files: [] }
        directory.directories.set(part, child)
      }
      directory = child
    }
    directory.files.push({ filename, hash: file.gitBlobSha })
  }

  function hashDirectory(directory) {
    const children = [
      ...[...directory.directories].map(([name, child]) => ({
        mode: '40000',
        name,
        hash: hashDirectory(child)
      })),
      ...directory.files.map((file) => ({ mode: '100644', name: file.filename, hash: file.hash }))
    ].sort((left, right) => {
      const leftName = left.mode === '40000' ? `${left.name}/` : left.name
      const rightName = right.mode === '40000' ? `${right.name}/` : right.name
      return Buffer.from(leftName).compare(Buffer.from(rightName))
    })
    const body = Buffer.concat(
      children.map(({ mode, name, hash }) =>
        Buffer.concat([Buffer.from(`${mode} ${name}\0`, 'utf8'), hash])
      )
    )
    return gitObjectSha('tree', body)
  }

  return hashDirectory(root).toString('hex')
}

function parseGuide(markdown, sourcePath) {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const frontmatter = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(normalized)
  if (!frontmatter) {
    throw new Error(`Skill guide has no YAML frontmatter: ${sourcePath}`)
  }
  const metadata = parse(frontmatter[1])
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    typeof metadata.name !== 'string' ||
    typeof metadata.description !== 'string'
  ) {
    throw new Error(`Skill guide must declare name and description: ${sourcePath}`)
  }
  return {
    name: metadata.name,
    description: metadata.description.replace(/\s+/g, ' ').trim(),
    markdown: normalized,
    fullMarkdown: normalized,
    aliases: []
  }
}

function withoutBuildHashes(files) {
  return files.map(({ gitBlobSha: _gitBlobSha, ...file }) => file)
}

function serialized(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function releaseRevisionFromVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!match) {
    throw new Error(`Daemon version is not semantic: ${version}`)
  }
  const [, major, minor, patch] = match.map(Number)
  const revision = major * 1_000_000 + minor * 1_000 + patch + 1
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error(`Daemon version cannot map to a skill revision: ${version}`)
  }
  return revision
}

export async function buildSkillResources(outputDirectory, appVersionOverride) {
  const [appVersion, directories] = await Promise.all([
    appVersionOverride ??
      readFile(DAEMON_PACKAGE_PATH, 'utf8').then(JSON.parse).then(packageVersion),
    readdir(SKILLS_ROOT, { withFileTypes: true })
  ])
  if (typeof appVersion !== 'string') {
    throw new Error('Skill resource release version is missing')
  }
  const releaseRevision = releaseRevisionFromVersion(appVersion)
  const registry = { schemaVersion: 1, skills: {} }
  const releaseSkills = {}
  const currentSkills = []
  const guides = []
  const names = directories
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareCodeUnits)

  for (const name of names) {
    const packageRoot = join(SKILLS_ROOT, name)
    const skillPath = join(packageRoot, 'SKILL.md')
    let markdown
    try {
      markdown = await readFile(skillPath, 'utf8')
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        continue
      }
      throw error
    }
    const guide = parseGuide(markdown, relative(WORKSPACE_ROOT, skillPath))
    if (guide.name !== name) {
      throw new Error(`Skill package ${name} declares mismatched name ${guide.name}`)
    }
    const filesWithBuildHashes = await collectSkillFiles(packageRoot)
    const packageDigest = skillPackageDigest(filesWithBuildHashes)
    const snapshot = {
      releaseRevision,
      packageDigest,
      gitTreeSha: skillPackageGitTreeSha(filesWithBuildHashes),
      files: withoutBuildHashes(filesWithBuildHashes)
    }
    registry.skills[name] = [snapshot]
    releaseSkills[name] = releaseRevision
    currentSkills.push({ name, sourcePath: `skills/${name}`, ...snapshot })
    guides.push(guide)
  }

  const artifacts = {
    'current-manifest.json': { schemaVersion: 2, skills: currentSkills },
    'snapshot-registry.json': registry,
    'release-mapping.json': {
      schemaVersion: 1,
      releases: [{ appVersion, skills: releaseSkills }]
    },
    'skill-guides.json': { schemaVersion: 1, guides }
  }
  await mkdir(outputDirectory, { recursive: true })
  await Promise.all(
    Object.entries(artifacts).map(([name, value]) =>
      writeFile(join(outputDirectory, name), serialized(value), 'utf8')
    )
  )
  return Object.keys(artifacts).map((name) => join(outputDirectory, name))
}

function packageVersion(manifest) {
  return manifest.version
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const outputFlagIndex = process.argv.indexOf('--output')
  const outputDirectory = process.argv[outputFlagIndex + 1]
  const versionFlagIndex = process.argv.indexOf('--version')
  const appVersion = versionFlagIndex < 0 ? undefined : process.argv[versionFlagIndex + 1]
  if (
    outputFlagIndex < 0 ||
    !outputDirectory ||
    basename(process.argv[outputFlagIndex]) !== '--output' ||
    (versionFlagIndex >= 0 && !appVersion)
  ) {
    throw new Error('Usage: build-skill-resources.mjs --output <directory> [--version <version>]')
  }
  await buildSkillResources(resolve(outputDirectory), appVersion)
}
