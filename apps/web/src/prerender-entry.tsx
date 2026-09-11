import { createMemoryHistory } from '@tanstack/react-router'
import {
  createRequestHandler,
  renderRouterToString,
  RouterServer
} from '@tanstack/react-router/ssr/server'

import { createAppRouter, routeMetas } from './router'
import { canonicalUrl } from './routes'
import type { RouteMeta } from './routes'

/**
 * Why: the build-time counterpart of main.tsx, and the server half of the pairing
 * TanStack Router documents. `createRequestHandler` is not optional scaffolding — it
 * attaches the SSR utilities to the router, and `renderRouterToString` reaches
 * straight through them (`router.ssr.setRenderFinished`), so calling the renderer on
 * a bare router throws.
 *
 * What the pairing buys is hydration: `RouterServer` emits the dehydrated payload
 * that `RouterClient` reads back, which is what makes the client tree agree with the
 * document. Rendering the subtree with plain `renderToString` did not, because the
 * router renders one fewer Suspense boundary under the server resolve condition.
 *
 * It returns a Response because the same call serves live SSR — the dev middleware in
 * vite.config.ts uses it that way. Here the body is read out and written to a file.
 */
export async function renderRoute(meta: RouteMeta): Promise<string> {
  return await renderRequest(new Request(canonicalUrl(meta)), meta.path)
}

export async function renderRequest(request: Request, pathname: string): Promise<string> {
  const handler = createRequestHandler({
    request,
    createRouter: () => createAppRouter(createMemoryHistory({ initialEntries: [pathname] }))
  })
  const response = await handler(({ responseHeaders, router }) =>
    renderRouterToString({
      router,
      responseHeaders,
      children: <RouterServer router={router} />
    })
  )
  return await response.text()
}

export { routeMetas }
