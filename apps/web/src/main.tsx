import { createBrowserHistory } from '@tanstack/react-router'
import { RouterClient } from '@tanstack/react-router/ssr/client'
import { hydrateRoot } from 'react-dom/client'

import { createAppRouter } from './router'

import './index.css'

/**
 * Why: hydrating `document`, not a container inside it. The root route's
 * shellComponent renders `<html>`, so the router owns the whole document — that is
 * the pairing TanStack Router documents, and `RouterClient` is the half that reads
 * the dehydrated payload `Scripts` emitted on the server. Without it the two renders
 * disagree about Suspense boundaries and hydration fails outright (React #418).
 *
 * StrictMode is deliberately absent: RouterClient suspends on the hydration promise,
 * and StrictMode's double-invoke around that buys nothing here.
 */
const router = createAppRouter(createBrowserHistory())

hydrateRoot(document, <RouterClient router={router} />)
