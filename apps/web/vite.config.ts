import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite-plus'
import { defineConfig } from 'vite-plus'

/**
 * Why: the router owns the document (src/shell.tsx), so the dev server has to render
 * it the same way the build does — a static index.html cannot carry the dehydrated
 * payload `RouterClient` reads, and hydrating against one renders Not Found.
 *
 * This is a `transformIndexHtml` hook rather than a middleware on purpose. A
 * middleware registered through `configureServer` never receives the request on this
 * repo's Vite 8 toolchain — verified by instrumenting it: the plugin loads,
 * `configureServer` runs, the handler is never called. That is the same symptom
 * TanStack/router#7614 reports for Start's own dev plugin, and the reason Start is not
 * an option here. `transformIndexHtml` is a first-class hook Vite calls for every HTML
 * request, so it sidesteps middleware ordering entirely: Vite hands over the shell
 * document and this replaces it wholesale with the rendered route.
 */
function renderDocumentInDev(): Plugin {
  return {
    name: 'agentstart-web:dev-ssr',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      async handler(_html, ctx) {
        const pathname = new URL(ctx.originalUrl ?? ctx.path, 'http://localhost').pathname
        const entry = await ctx.server!.ssrLoadModule('/src/prerender-entry.tsx')
        // Why: the shell renders the client entry script itself in dev, so the tag
        // index.html normally carries is not needed here. Vite still post-processes
        // this to inject its own client and the react-refresh preamble.
        return await entry.renderRequest(
          new Request(new URL(pathname, 'http://localhost')),
          pathname
        )
      }
    }
  }
}

export default defineConfig(({ isSsrBuild }) => {
  return {
    build: isSsrBuild ? undefined : {},
    plugins: [react(), tailwindcss(), renderDocumentInDev()],
    resolve: {
      alias: {
        '@': resolve(import.meta.dirname, 'src')
      }
    },
    server: {
      port: 4180
    }
  }
})
