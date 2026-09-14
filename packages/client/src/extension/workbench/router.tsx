import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider
} from '@tanstack/react-router'

import {
  configureWorkbenchLocation,
  configureWorkbenchNavigation
} from '../../runtime/workbench-location'
import {
  type WorkbenchRouteSearch,
  workbenchLocationFromSearch,
  workbenchPageIntentFromSearch,
  workbenchSearchFromLocation,
  validateWorkbenchRouteSearch
} from './location'
import { ExtensionWorkbenchSurface } from './surface'

const rootRoute = createRootRoute({ component: Outlet })

const workbenchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace.html',
  validateSearch: validateWorkbenchRouteSearch,
  beforeLoad: ({ search }) => {
    configureWorkbenchLocation(workbenchLocationFromSearch(search))
  },
  component: WorkbenchRoute
})

const routeTree = rootRoute.addChildren([workbenchRoute])
const router = createRouter({ routeTree })
configureWorkbenchNavigation((location) => {
  void router.navigate({
    to: '/workspace.html',
    search: workbenchSearchFromLocation(location)
  })
})

function WorkbenchRoute(): React.JSX.Element {
  const search: WorkbenchRouteSearch = workbenchRoute.useSearch()
  return (
    <ExtensionWorkbenchSurface
      initialPage={workbenchPageIntentFromSearch(search)}
      location={workbenchLocationFromSearch(search)}
    />
  )
}

export function ExtensionWorkbenchRouter(): React.JSX.Element {
  return <RouterProvider router={router} />
}
