import { CancelledError } from '@tanstack/react-query'

export function isProjectCatalogRefreshCancellation(error: unknown): boolean {
  return error instanceof CancelledError
}
