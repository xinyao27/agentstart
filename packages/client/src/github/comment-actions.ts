import type { GitHubCommentResult, PRComment } from '@yiru/protocol/hosted-review/review-types'
import type { StateCreator } from 'zustand'
import { translate } from '~renderer/i18n/i18n'
import { runtimeCallDestination } from '~renderer/runtime/github-runtime-destination'
import { openGitHubTarget } from '~renderer/runtime/github-target'
import type { AppState } from '~renderer/store/types'

import {
  hasUsableCommentPayload,
  isFresh,
  mergePRCommentIntoList,
  withBoundedCacheEntry
} from './cache-policy'
import { resolveGitHubCommentRequest } from './comment-request'
import type { GitHubSlice } from './store-contract'

const inflightRequests = new Map<string, Promise<PRComment[]>>()

type GitHubCommentActions = Pick<
  GitHubSlice,
  'fetchPRComments' | 'addPRConversationComment' | 'addPRReviewCommentReply' | 'resolveReviewThread'
>

export function createGitHubCommentActions(
  set: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[1]
): GitHubCommentActions {
  return {
    fetchPRComments: async (repoPath, prNumber, options): Promise<PRComment[]> => {
      const route = resolveGitHubCommentRequest(get(), repoPath, prNumber, options)
      const cacheKey = route.cacheKey
      const cached = get().commentsCache[cacheKey]
      if (!options?.force && isFresh(cached)) {
        return cached.data ?? []
      }

      const inflightRequest = inflightRequests.get(cacheKey)
      if (inflightRequest) {
        return inflightRequest
      }

      const request = (async () => {
        try {
          const client = await openGitHubTarget()
          if (!client) {
            throw new Error('GitHub protocol capability is unavailable')
          }
          const comments = await client.getPrComments(
            {
              repo: route.repo,
              prNumber,
              prRepo: options?.prRepo ?? undefined,
              noCache: options?.force
            },
            { timeoutMs: 30_000, ...runtimeCallDestination(route.target) }
          )
          set((s) => ({
            commentsCache: withBoundedCacheEntry(s.commentsCache, cacheKey, {
              data: comments,
              fetchedAt: Date.now()
            })
          }))
          return comments
        } catch (err) {
          console.error('Failed to fetch PR comments:', err)
          return get().commentsCache[cacheKey]?.data ?? []
        } finally {
          inflightRequests.delete(cacheKey)
        }
      })()

      inflightRequests.set(cacheKey, request)
      return request
    },

    addPRConversationComment: async (repoPath, prNumber, body, options) => {
      const route = resolveGitHubCommentRequest(get(), repoPath, prNumber, options)
      const cacheKey = route.cacheKey
      let result: GitHubCommentResult
      try {
        const client = await openGitHubTarget()
        if (!client) {
          throw new Error('GitHub protocol capability is unavailable')
        }
        result = await client.addPrComment(
          {
            repo: route.repo,
            number: prNumber,
            body,
            prRepo: options?.prRepo ?? undefined
          },
          { timeoutMs: 30_000, ...runtimeCallDestination(route.target) }
        )
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to post comment.'
        return { ok: false, error }
      }
      if (!hasUsableCommentPayload(result)) {
        return result.ok
          ? {
              ok: false,
              error: translate(
                'auto.store.slices.github.f129c42773',
                'GitHub did not return the new comment.'
              )
            }
          : result
      }
      set((s) => {
        const entry = s.commentsCache[cacheKey]
        return {
          commentsCache: withBoundedCacheEntry(s.commentsCache, cacheKey, {
            data: mergePRCommentIntoList(entry?.data, result.comment),
            fetchedAt: Date.now()
          })
        }
      })
      return result
    },

    addPRReviewCommentReply: async (repoPath, prNumber, commentId, body, options) => {
      const route = resolveGitHubCommentRequest(get(), repoPath, prNumber, options)
      const cacheKey = route.cacheKey
      let result: GitHubCommentResult
      try {
        const client = await openGitHubTarget()
        if (!client) {
          throw new Error('GitHub protocol capability is unavailable')
        }
        result = await client.addPrReviewCommentReply(
          {
            repo: route.repo,
            prNumber,
            commentId,
            body,
            threadId: options?.threadId,
            path: options?.path,
            line: options?.line,
            prRepo: options?.prRepo ?? undefined
          },
          { timeoutMs: 30_000, ...runtimeCallDestination(route.target) }
        )
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to post reply.'
        return { ok: false, error }
      }
      if (!hasUsableCommentPayload(result)) {
        return result.ok
          ? {
              ok: false,
              error: translate(
                'auto.store.slices.github.f129c42773',
                'GitHub did not return the new comment.'
              )
            }
          : result
      }
      const comment: PRComment = {
        ...result.comment,
        threadId: result.comment.threadId ?? options?.threadId,
        path: result.comment.path ?? options?.path,
        line: result.comment.line ?? options?.line
      }
      set((s) => {
        const entry = s.commentsCache[cacheKey]
        return {
          commentsCache: withBoundedCacheEntry(s.commentsCache, cacheKey, {
            data: mergePRCommentIntoList(entry?.data, comment),
            fetchedAt: Date.now()
          })
        }
      })
      return { ok: true, comment }
    },

    resolveReviewThread: async (repoPath, prNumber, threadId, resolve, options) => {
      const route = resolveGitHubCommentRequest(get(), repoPath, prNumber, options)
      const cacheKey = route.cacheKey

      // Optimistic update: toggle isResolved on all comments in this thread immediately
      // so the UI feels instant. Reverts if the API call fails.
      const prev = get().commentsCache[cacheKey]?.data
      if (prev) {
        set((s) => ({
          commentsCache: {
            ...s.commentsCache,
            [cacheKey]: {
              ...s.commentsCache[cacheKey],
              data: prev.map((c) => (c.threadId === threadId ? { ...c, isResolved: resolve } : c))
            }
          }
        }))
      }

      let ok = false
      try {
        const client = await openGitHubTarget()
        if (!client) {
          throw new Error('GitHub protocol capability is unavailable')
        }
        ok = await client.resolveReviewThread(route.repo, threadId, resolve, {
          timeoutMs: 30_000,
          ...runtimeCallDestination(route.target)
        })
      } catch (err) {
        console.error('Failed to update review thread:', err)
        ok = false
      }
      if (!ok && prev) {
        // Revert optimistic update on failure
        set((s) => ({
          commentsCache: {
            ...s.commentsCache,
            [cacheKey]: { ...s.commentsCache[cacheKey], data: prev }
          }
        }))
      }
      return ok
    }
  }
}
