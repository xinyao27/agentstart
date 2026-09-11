import { HeadContent, Scripts } from '@tanstack/react-router'

// Why: this has to run before first paint or the wrong theme flashes, which rules
// out anything React renders as part of the tree. It is the one inline script here.
const THEME_SCRIPT = `try {
  var stored = localStorage.getItem('agentstart-theme')
  var light = stored ? stored === 'light' : !window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('light', light)
} catch (error) {}`

export type ShellProps = {
  children: React.ReactNode
}

/**
 * Why: the root route's `shellComponent`, which makes the router the owner of the
 * whole document rather than of a div inside one. That is the shape TanStack Router
 * documents — the client entry hydrates `document` — and it is what lets its
 * dehydration protocol line the two renders up. The previous arrangement, a Vite
 * index.html with a #root for the router to fill, could not hydrate at all: the
 * router renders one fewer Suspense boundary under the server resolve condition, so
 * React found boundary comments in the document that its client tree did not have.
 *
 * Everything else the head needs comes from the routes' own `head()` through
 * HeadContent, and `Scripts` emits the router's dehydrated payload. Vite's hashed
 * asset tags are injected around this by apps/web/scripts/prerender.mjs, which
 * is the only thing here Vite still owns.
 */
export function Shell({ children }: ShellProps): React.JSX.Element {
  return (
    <html lang="en">
      <head>
        {/* Why: rendered here rather than through a route's `head()`. HeadContent
            dedupes meta by name, so the second theme-color silently replaced the
            first and only the light one survived. */}
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#181818" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
        {/* Why: dev only, and it is what stops a flash of unstyled content there.
            Vite serves CSS through the JS module graph in dev, so the document it
            hands over has no stylesheet at all — and now that the document arrives
            with the page already rendered into it, the browser paints that content
            before main.tsx has run. `?direct` asks Vite for the compiled text rather
            than the module, which makes it a real render-blocking stylesheet. The
            import in main.tsx stays: that is what HMR listens to.
            The build has no need for this; apps/web/scripts/prerender.mjs injects the hashed
            stylesheet right after the charset instead. */}
        {import.meta.env.DEV ? <link rel="stylesheet" href="/src/index.css?direct" /> : null}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        {/* Why: in dev the client entry has to come from the tree, because the
            document is rendered by the middleware in vite.config.ts and Vite's own
            index.html — the only place that script tag normally lives — is bypassed.
            Rendering it here keeps the server and client trees identical, which
            injecting it into the HTML afterwards would not. The build has no need for
            it: apps/web/scripts/prerender.mjs injects the hashed tag instead. */}
        {import.meta.env.DEV ? <script type="module" src="/src/main.tsx" /> : null}
      </body>
    </html>
  )
}
