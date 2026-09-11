// Why: the router owns the document while Vite owns hashed asset URLs, so build-time rendering must
// join both outputs after the client build; Vite's package task cannot express that data flow.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { build } from 'vite'

// TanStack Start would do all of this, including a dev server that renders the same
// way. Its dev plugin is broken on this repo's Vite 8 toolchain (TanStack/router#7614,
// still open), so vite.config.ts carries a small middleware for dev and this script
// covers the build.
const appDirectory = resolve(import.meta.dirname, '..')
const bundleDirectory = resolve(appDirectory, '.prerender')
const distDirectory = resolve(appDirectory, 'dist')
const shellPath = resolve(distDirectory, 'index.html')

// Why: an exact marker, so a change to what the shell renders fails the build instead
// of silently shipping a page whose stylesheet is nowhere near the top of head.
const CHARSET_MARKER = '<meta charSet="utf-8"/>'

await build({
  configFile: resolve(appDirectory, 'vite.config.ts'),
  root: appDirectory,
  logLevel: 'warn',
  build: {
    ssr: resolve(appDirectory, 'src/prerender-entry.tsx'),
    outDir: bundleDirectory,
    emptyOutDir: true,
    copyPublicDir: false
  }
})

/**
 * Why: read off the built document rather than the manifest. The manifest names the
 * entry chunk but not the tag shape Vite decided on — crossorigin, modulepreload,
 * the stylesheet order — and getting that subtly wrong is how a page loads its CSS
 * twice or not at all.
 */
function extractAssetTags(shell) {
  const head = []
  const body = []
  for (const match of shell.matchAll(/<(link|script)\b[^>]*?(?:\/>|>(?:[\s\S]*?<\/\1>)?)/g)) {
    const tag = match[0]
    if (!/(?:href|src)="\/assets\//.test(tag)) {
      continue
    }
    if (match[1] === 'link') {
      head.push(tag)
    } else {
      body.push(tag)
    }
  }
  // Why: both, not just the script. A missing stylesheet does not break the page
  // loudly — it ships every document unstyled and the build still passes, which is
  // the one failure here that nothing downstream would catch.
  if (!body.length) {
    throw new Error(`${shellPath} has no /assets/ script tag — the client entry is missing`)
  }
  if (!head.length) {
    throw new Error(`${shellPath} has no /assets/ stylesheet link — every page would ship unstyled`)
  }
  return { head, body }
}

try {
  const bundlePath = resolve(bundleDirectory, 'prerender-entry.js')
  const { renderRoute, routeMetas } = await import(pathToFileURL(bundlePath).href)
  const assets = extractAssetTags(await readFile(shellPath, 'utf8'))

  for (const meta of routeMetas) {
    const rendered = await renderRoute(meta)
    if (!rendered.includes('</head>') || !rendered.includes('</body>')) {
      throw new Error(`${meta.path} rendered without a head or body to inject assets into`)
    }
    // Why: the stylesheet goes in directly after the charset, as early as head allows.
    // Injected before </head> instead it sat behind the theme script and 1.5 kB of
    // JSON-LD and the browser painted before it applied — a white flash on every load.
    // After the charset rather than before it because the parser needs the encoding
    // first, and the spec wants it inside the first 1024 bytes.
    if (!rendered.includes(CHARSET_MARKER)) {
      throw new Error(`${meta.path} rendered without ${CHARSET_MARKER} to anchor the assets to`)
    }
    const document = rendered
      .replace(CHARSET_MARKER, `${CHARSET_MARKER}${assets.head.join('')}`)
      .replace('</body>', `${assets.body.join('')}</body>`)
    const outputPath = resolve(distDirectory, meta.file)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, document)
    console.log(`prerendered ${meta.path} -> dist/${meta.file}`)
  }
} finally {
  // Why: the bundle is a build intermediate. Leaving it behind would put a
  // Node-targeted copy of the app next to the assets wrangler uploads.
  await rm(bundleDirectory, { recursive: true, force: true })
}
