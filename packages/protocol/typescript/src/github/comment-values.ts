import { StatusCode } from '../../generated/yiru/protocol/v1/errors_pb.js'
import {
  GitHubReactionContent,
  type GitHubComment as ProtocolComment,
  type GitHubCommentResult as ProtocolCommentResult
} from '../../generated/yiru/runtime/v1/github_pb.js'
import { RuntimeProtocolError } from '../error.js'

export type GitHubReactionContentValue =
  | '+1'
  | '-1'
  | 'laugh'
  | 'confused'
  | 'heart'
  | 'hooray'
  | 'rocket'
  | 'eyes'
export type GitHubReaction = { content: GitHubReactionContentValue; count: number }

export type PRComment = {
  id: number
  author: string
  authorAvatarUrl: string
  body: string
  createdAt: string
  url: string
  reactions?: GitHubReaction[]
  path?: string
  threadId?: string
  isResolved?: boolean
  isOutdated?: boolean
  line?: number
  startLine?: number
  isBot?: boolean
}

export type GitHubCommentResult = { ok: true; comment: PRComment } | { ok: false; error: string }

function reactionContent(value: GitHubReactionContent): GitHubReactionContentValue | null {
  switch (value) {
    case GitHubReactionContent.THUMBS_UP:
      return '+1'
    case GitHubReactionContent.THUMBS_DOWN:
      return '-1'
    case GitHubReactionContent.LAUGH:
      return 'laugh'
    case GitHubReactionContent.CONFUSED:
      return 'confused'
    case GitHubReactionContent.HEART:
      return 'heart'
    case GitHubReactionContent.HOORAY:
      return 'hooray'
    case GitHubReactionContent.ROCKET:
      return 'rocket'
    case GitHubReactionContent.EYES:
      return 'eyes'
    default:
      return null
  }
}

export function githubComment(comment: ProtocolComment): PRComment {
  return {
    id: Number(comment.id),
    author: comment.author,
    authorAvatarUrl: comment.authorAvatarUrl,
    body: comment.body,
    createdAt: comment.createdAt,
    url: comment.url,
    reactions: comment.reactions
      .map((reaction) => {
        const content = reactionContent(reaction.content)
        return content ? { content, count: Number(reaction.count) } : null
      })
      .filter((reaction): reaction is GitHubReaction => reaction !== null),
    ...(comment.path !== undefined ? { path: comment.path } : {}),
    ...(comment.threadId !== undefined ? { threadId: comment.threadId } : {}),
    ...(comment.isResolved !== undefined ? { isResolved: comment.isResolved } : {}),
    ...(comment.isOutdated !== undefined ? { isOutdated: comment.isOutdated } : {}),
    ...(comment.line !== undefined ? { line: Number(comment.line) } : {}),
    ...(comment.startLine !== undefined ? { startLine: Number(comment.startLine) } : {}),
    isBot: comment.isBot
  }
}

export function githubCommentResult(
  result: ProtocolCommentResult | undefined
): GitHubCommentResult {
  if (!result) {
    throw invalidResponse('GitHub comment result is missing')
  }
  if (result.ok) {
    if (!result.comment) {
      throw invalidResponse('Successful GitHub comment result is missing its comment')
    }
    return { ok: true, comment: githubComment(result.comment) }
  }
  return { ok: false, error: result.error || 'GitHub comment failed' }
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
