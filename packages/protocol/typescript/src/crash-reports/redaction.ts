import type {
  CrashReportDetailValue,
  CrashReportBreadcrumbInput,
  CrashReportBreadcrumb
} from './values'

const MAX_STRING_DETAIL_LENGTH = 240
const MAX_STACK_DETAIL_LENGTH = 4_000
const MAX_BREADCRUMB_NAME_LENGTH = 80
const MAX_BREADCRUMBS = 30
const SECRET_PATTERNS = [
  /\b(gh[pousr]_[A-Za-z0-9_]{20,})\b/g,
  /\b(sk-[A-Za-z0-9_-]{20,})\b/g,
  /\b([A-Za-z0-9._%+-]+:[A-Za-z0-9._%+-]+@)(?=[^/\s]+)/g,
  /\b(token|api[_-]?key|secret|password)=([^&\s]+)/gi
]

const PATH_PATTERNS = [
  /\/(?:Users|home)\/(?:(?!\s+(?:\/|[A-Za-z]:\\|\\\\|gh[pousr]_|sk-|(?:token|api[_-]?key|secret|password)=))[^"'`<>\n\r)])+/gi,
  /\/(?:Applications|Library|System|Volumes|etc|media|mnt|opt|private|root|srv|tmp|usr|var)\/(?:(?!\s+(?:\/|[A-Za-z]:\\|\\\\|gh[pousr]_|sk-|(?:token|api[_-]?key|secret|password)=))[^"'`<>\n\r)])+/gi,
  /\/[A-Za-z0-9._ -]+\/(?:(?!\s+(?:\/|[A-Za-z]:\\|\\\\|gh[pousr]_|sk-|(?:token|api[_-]?key|secret|password)=))[^"'`<>\n\r)])+/gi,
  /[A-Za-z]:\\(?:(?!\s+(?:\/|[A-Za-z]:\\|\\\\|gh[pousr]_|sk-|(?:token|api[_-]?key|secret|password)=))[^"'`<>\n\r)])+/gi,
  /\\\\[^\\\s"'`<>\n\r)]+\\(?:(?!\s+(?:\/|[A-Za-z]:\\|\\\\|gh[pousr]_|sk-|(?:token|api[_-]?key|secret|password)=))[^"'`<>\n\r)])+/gi
]
export function sanitizeCrashReportString(
  value: string,
  maxLength = MAX_STRING_DETAIL_LENGTH
): string {
  let sanitized = value
  for (const pattern of PATH_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[redacted-path]')
  }
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match, key?: string) => {
      if (key && /^(token|api[_-]?key|secret|password)$/i.test(key)) {
        return `${key}=[redacted]`
      }
      return match.includes('@') ? '[redacted-credential]@' : '[redacted-secret]'
    })
  }
  return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength)}...` : sanitized
}

function maxDetailStringLengthForKey(key: string): number {
  return /(?:^|_)(?:stack|component_stack|error_stack)$/i.test(key)
    ? MAX_STACK_DETAIL_LENGTH
    : MAX_STRING_DETAIL_LENGTH
}

export function sanitizeCrashReportDetails(
  details: Record<string, unknown>
): Record<string, CrashReportDetailValue> {
  const sanitized: Record<string, CrashReportDetailValue> = {}
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeCrashReportString(value, maxDetailStringLengthForKey(key))
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      sanitized[key] = value
    } else if (typeof value === 'boolean' || value === null) {
      sanitized[key] = value
    }
  }
  return sanitized
}

export function sanitizeCrashReportBreadcrumbs(
  breadcrumbs: CrashReportBreadcrumbInput[] | undefined
): CrashReportBreadcrumb[] | undefined {
  if (!breadcrumbs || breadcrumbs.length === 0) {
    return undefined
  }

  const sanitized = breadcrumbs
    .slice(-MAX_BREADCRUMBS)
    .map((breadcrumb): CrashReportBreadcrumb | null => {
      if (!breadcrumb.name.trim() || !breadcrumb.createdAt.trim()) {
        return null
      }
      const data = breadcrumb.data ? sanitizeCrashReportDetails(breadcrumb.data) : {}
      return {
        createdAt: sanitizeCrashReportString(breadcrumb.createdAt),
        name: sanitizeCrashReportString(breadcrumb.name).slice(0, MAX_BREADCRUMB_NAME_LENGTH),
        ...(Object.keys(data).length > 0 ? { data } : {})
      }
    })
    .filter((breadcrumb): breadcrumb is CrashReportBreadcrumb => breadcrumb !== null)

  return sanitized.length > 0 ? sanitized : undefined
}
