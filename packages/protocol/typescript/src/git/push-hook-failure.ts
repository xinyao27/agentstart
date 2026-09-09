const PUSH_FAILURE_SUMMARY_SCAN_CODE_UNITS = 64 * 1024

const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g
const CONTROL_PATTERN =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g
const PUSH_HOOK_PATTERN = /\b(?:pre-push|prepush)\b/i
const PUSH_HOOK_RUNNER_PATTERN = /\b(?:husky|lint-staged|lefthook)\b/i
const PUSH_CONTEXT_PATTERN = /\b(?:failed to push|hook declined to push|git push)\b/i
const LINT_PATTERN = /\b(?:eslint|oxlint|lint-staged|lint)\b/i
const REMOTE_PUSH_EXCLUSION_PATTERN =
  /authentication failed|repository not found|not a git repository|does not appear to be a git repository|permission denied|protected branch|pre-receive hook declined|non-fast-forward|fetch first|updates were rejected|stale info|submodule|failed to push all needed submodules|unable to push submodule|unable to access|could not resolve host|network is unreachable|connection timed out|failed to connect|rpc failed|remote end hung up/i

function normalizePushFailure(raw: string): string {
  return raw
    .slice(0, PUSH_FAILURE_SUMMARY_SCAN_CODE_UNITS)
    .replace(ANSI_PATTERN, '')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_PATTERN, '')
    .trim()
}

export function isPushHookFailure(raw: string): boolean {
  const normalized = normalizePushFailure(raw)
  if (!normalized) {
    return false
  }

  if (REMOTE_PUSH_EXCLUSION_PATTERN.test(normalized)) {
    return false
  }

  if (/hook declined to push/i.test(normalized)) {
    return true
  }

  if (PUSH_HOOK_PATTERN.test(normalized)) {
    return true
  }

  if (PUSH_HOOK_RUNNER_PATTERN.test(normalized) && PUSH_CONTEXT_PATTERN.test(normalized)) {
    return true
  }

  if (LINT_PATTERN.test(normalized) && PUSH_CONTEXT_PATTERN.test(normalized)) {
    return true
  }

  return false
}

export function sanitizePushFailureDetails(raw: string): string {
  return normalizePushFailure(raw)
}
