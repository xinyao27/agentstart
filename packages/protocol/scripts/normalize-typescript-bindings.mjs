// Why: protoc-gen-es emits a blank line at EOF that git's whitespace check rejects.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const generatedRoot = path.resolve(import.meta.dirname, '..', 'typescript', 'generated')

await normalizeDirectory(generatedRoot)

async function normalizeDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true })

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await normalizeDirectory(entryPath)
        return
      }
      if (!entry.name.endsWith('_pb.js') && !entry.name.endsWith('_pb.d.ts')) {
        return
      }

      const source = await readFile(entryPath, 'utf8')
      const normalized = `${source.trimEnd()}\n`
      if (source !== normalized) {
        await writeFile(entryPath, normalized)
      }
    })
  )
}
