#!/bin/sh
payload=$(cat)
if [ -z "$payload" ]; then
  exit 0
fi
__yiru_read_ancestor_var() {
  __yiru_name="$1"
  __yiru_pid="${PPID:-}"
  while [ -n "$__yiru_pid" ] && [ "$__yiru_pid" != "0" ] && [ "$__yiru_pid" != "1" ]; do
    __yiru_value=""
    if [ -r "/proc/$__yiru_pid/environ" ]; then
      __yiru_value=$(tr "\000" "\n" < "/proc/$__yiru_pid/environ" 2>/dev/null | sed -n "s/^${__yiru_name}=//p" | head -n 1)
    fi
    if [ -z "$__yiru_value" ]; then
      __yiru_value=$(ps eww -p "$__yiru_pid" -o command= 2>/dev/null | tr " " "\n" | sed -n "s/^${__yiru_name}=//p" | head -n 1)
    fi
    if [ -n "$__yiru_value" ]; then
      printf "%s\n" "$__yiru_value"
      return 0
    fi
    __yiru_pid=$(ps -o ppid= -p "$__yiru_pid" 2>/dev/null | tr -d " ")
  done
  return 1
}
__yiru_fill_from_ancestor() {
  __yiru_name="$1"
  case "$__yiru_name" in
    YIRU_AGENT_HOOK_ENDPOINT) [ -z "${YIRU_AGENT_HOOK_ENDPOINT:-}" ] || return 0 ;;
    YIRU_AGENT_HOOK_PORT) [ -z "${YIRU_AGENT_HOOK_PORT:-}" ] || return 0 ;;
    YIRU_AGENT_HOOK_TOKEN) [ -z "${YIRU_AGENT_HOOK_TOKEN:-}" ] || return 0 ;;
    YIRU_AGENT_HOOK_ENV) [ -z "${YIRU_AGENT_HOOK_ENV:-}" ] || return 0 ;;
    YIRU_AGENT_HOOK_VERSION) [ -z "${YIRU_AGENT_HOOK_VERSION:-}" ] || return 0 ;;
    YIRU_PANE_KEY) [ -z "${YIRU_PANE_KEY:-}" ] || return 0 ;;
    YIRU_TAB_ID) [ -z "${YIRU_TAB_ID:-}" ] || return 0 ;;
    YIRU_WORKTREE_ID) [ -z "${YIRU_WORKTREE_ID:-}" ] || return 0 ;;
    YIRU_AGENT_LAUNCH_TOKEN) [ -z "${YIRU_AGENT_LAUNCH_TOKEN:-}" ] || return 0 ;;
    *) return 0 ;;
  esac
  __yiru_value=$(__yiru_read_ancestor_var "$__yiru_name") || return 0
  [ -n "$__yiru_value" ] && export "$__yiru_name=$__yiru_value"
}
__yiru_endpoint_value() {
  __yiru_endpoint_name="$1"
  __yiru_endpoint_path="$2"
  sed -n "s/^${__yiru_endpoint_name}=//p" "$__yiru_endpoint_path" 2>/dev/null | head -n 1
}
__yiru_fill_from_endpoint_file() {
  __yiru_endpoint_path="$1"
  [ -r "$__yiru_endpoint_path" ] || return 0
  __yiru_endpoint_port=$(__yiru_endpoint_value YIRU_AGENT_HOOK_PORT "$__yiru_endpoint_path")
  if [ -n "${YIRU_AGENT_HOOK_PORT:-}" ] && [ -n "$__yiru_endpoint_port" ] && [ "$__yiru_endpoint_port" != "$YIRU_AGENT_HOOK_PORT" ]; then
    return 0
  fi
  for __yiru_endpoint_name in YIRU_AGENT_HOOK_PORT YIRU_AGENT_HOOK_TOKEN YIRU_AGENT_HOOK_ENV YIRU_AGENT_HOOK_VERSION; do
    eval "__yiru_current=\${$__yiru_endpoint_name:-}"
    [ -z "$__yiru_current" ] || continue
    __yiru_endpoint_value=$(__yiru_endpoint_value "$__yiru_endpoint_name" "$__yiru_endpoint_path")
    [ -n "$__yiru_endpoint_value" ] && export "$__yiru_endpoint_name=$__yiru_endpoint_value"
  done
}
# Why: Command Code sanitizes hook subprocess env. The parent TUI process
# still has Yiru pane/hook metadata, so recover it before posting.
for __yiru_name in YIRU_AGENT_HOOK_ENDPOINT YIRU_AGENT_HOOK_PORT YIRU_AGENT_HOOK_TOKEN YIRU_AGENT_HOOK_ENV YIRU_AGENT_HOOK_VERSION YIRU_PANE_KEY YIRU_TAB_ID YIRU_WORKTREE_ID YIRU_AGENT_LAUNCH_TOKEN; do
  __yiru_fill_from_ancestor "$__yiru_name"
done
if [ -n "$YIRU_AGENT_HOOK_ENDPOINT" ] && [ -r "$YIRU_AGENT_HOOK_ENDPOINT" ]; then
  __yiru_fill_from_endpoint_file "$YIRU_AGENT_HOOK_ENDPOINT"
fi
# Why: Command Code strips TOKEN-like env vars before invoking hooks. If
# YIRU_AGENT_HOOK_ENDPOINT was not exported into this PTY, recover the
# matching endpoint file by the unstripped loopback port.
if [ -z "$YIRU_AGENT_HOOK_TOKEN" ] && [ -n "$YIRU_AGENT_HOOK_PORT" ]; then
  for endpoint in \
    "$HOME/Library/Application Support/yiru-dev/agent-hooks"/*/endpoint.env \
    "$HOME/Library/Application Support/yiru-dev/agent-hooks/endpoint.env" \
    "${XDG_CONFIG_HOME:-$HOME/.config}/yiru-dev/agent-hooks"/*/endpoint.env \
    "${XDG_CONFIG_HOME:-$HOME/.config}/yiru-dev/agent-hooks/endpoint.env" \
    "$HOME/Library/Application Support/yiru/agent-hooks/endpoint.env" \
    "${XDG_CONFIG_HOME:-$HOME/.config}/yiru/agent-hooks/endpoint.env"; do
    [ -r "$endpoint" ] || continue
    endpoint_port=$(sed -n "s/^YIRU_AGENT_HOOK_PORT=//p" "$endpoint" | head -n 1)
    if [ "$endpoint_port" = "$YIRU_AGENT_HOOK_PORT" ]; then
      __yiru_fill_from_endpoint_file "$endpoint"
      break
    fi
  done
fi
if [ -z "$YIRU_AGENT_HOOK_PORT" ] || [ -z "$YIRU_AGENT_HOOK_TOKEN" ] || [ -z "$YIRU_PANE_KEY" ]; then
  exit 0
fi
printf '%s' "$payload" | curl -sS -X POST "http://127.0.0.1:${YIRU_AGENT_HOOK_PORT}/hook/command-code" \
  --connect-timeout 0.5 --max-time 1.5 \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Yiru-Agent-Hook-Token: ${YIRU_AGENT_HOOK_TOKEN}" \
  --data-urlencode "paneKey=${YIRU_PANE_KEY}" \
  --data-urlencode "tabId=${YIRU_TAB_ID}" \
  --data-urlencode "launchToken=${YIRU_AGENT_LAUNCH_TOKEN}" \
  --data-urlencode "worktreeId=${YIRU_WORKTREE_ID}" \
  --data-urlencode "env=${YIRU_AGENT_HOOK_ENV}" \
  --data-urlencode "version=${YIRU_AGENT_HOOK_VERSION}" \
  --data-urlencode "payload@-" >/dev/null 2>&1 || true
exit 0
