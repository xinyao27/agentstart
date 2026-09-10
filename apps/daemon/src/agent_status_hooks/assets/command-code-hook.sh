#!/bin/sh
payload=$(cat)
if [ -z "$payload" ]; then
  exit 0
fi
__agentstart_read_ancestor_var() {
  __agentstart_name="$1"
  __agentstart_pid="${PPID:-}"
  while [ -n "$__agentstart_pid" ] && [ "$__agentstart_pid" != "0" ] && [ "$__agentstart_pid" != "1" ]; do
    __agentstart_value=""
    if [ -r "/proc/$__agentstart_pid/environ" ]; then
      __agentstart_value=$(tr "\000" "\n" < "/proc/$__agentstart_pid/environ" 2>/dev/null | sed -n "s/^${__agentstart_name}=//p" | head -n 1)
    fi
    if [ -z "$__agentstart_value" ]; then
      __agentstart_value=$(ps eww -p "$__agentstart_pid" -o command= 2>/dev/null | tr " " "\n" | sed -n "s/^${__agentstart_name}=//p" | head -n 1)
    fi
    if [ -n "$__agentstart_value" ]; then
      printf "%s\n" "$__agentstart_value"
      return 0
    fi
    __agentstart_pid=$(ps -o ppid= -p "$__agentstart_pid" 2>/dev/null | tr -d " ")
  done
  return 1
}
__agentstart_fill_from_ancestor() {
  __agentstart_name="$1"
  case "$__agentstart_name" in
    AGENTSTART_AGENT_HOOK_ENDPOINT) [ -z "${AGENTSTART_AGENT_HOOK_ENDPOINT:-}" ] || return 0 ;;
    AGENTSTART_AGENT_HOOK_PORT) [ -z "${AGENTSTART_AGENT_HOOK_PORT:-}" ] || return 0 ;;
    AGENTSTART_AGENT_HOOK_TOKEN) [ -z "${AGENTSTART_AGENT_HOOK_TOKEN:-}" ] || return 0 ;;
    AGENTSTART_AGENT_HOOK_ENV) [ -z "${AGENTSTART_AGENT_HOOK_ENV:-}" ] || return 0 ;;
    AGENTSTART_AGENT_HOOK_VERSION) [ -z "${AGENTSTART_AGENT_HOOK_VERSION:-}" ] || return 0 ;;
    AGENTSTART_PANE_KEY) [ -z "${AGENTSTART_PANE_KEY:-}" ] || return 0 ;;
    AGENTSTART_TAB_ID) [ -z "${AGENTSTART_TAB_ID:-}" ] || return 0 ;;
    AGENTSTART_WORKTREE_ID) [ -z "${AGENTSTART_WORKTREE_ID:-}" ] || return 0 ;;
    AGENTSTART_AGENT_LAUNCH_TOKEN) [ -z "${AGENTSTART_AGENT_LAUNCH_TOKEN:-}" ] || return 0 ;;
    *) return 0 ;;
  esac
  __agentstart_value=$(__agentstart_read_ancestor_var "$__agentstart_name") || return 0
  [ -n "$__agentstart_value" ] && export "$__agentstart_name=$__agentstart_value"
}
__agentstart_endpoint_value() {
  __agentstart_endpoint_name="$1"
  __agentstart_endpoint_path="$2"
  sed -n "s/^${__agentstart_endpoint_name}=//p" "$__agentstart_endpoint_path" 2>/dev/null | head -n 1
}
__agentstart_fill_from_endpoint_file() {
  __agentstart_endpoint_path="$1"
  [ -r "$__agentstart_endpoint_path" ] || return 0
  __agentstart_endpoint_port=$(__agentstart_endpoint_value AGENTSTART_AGENT_HOOK_PORT "$__agentstart_endpoint_path")
  if [ -n "${AGENTSTART_AGENT_HOOK_PORT:-}" ] && [ -n "$__agentstart_endpoint_port" ] && [ "$__agentstart_endpoint_port" != "$AGENTSTART_AGENT_HOOK_PORT" ]; then
    return 0
  fi
  for __agentstart_endpoint_name in AGENTSTART_AGENT_HOOK_PORT AGENTSTART_AGENT_HOOK_TOKEN AGENTSTART_AGENT_HOOK_ENV AGENTSTART_AGENT_HOOK_VERSION; do
    eval "__agentstart_current=\${$__agentstart_endpoint_name:-}"
    [ -z "$__agentstart_current" ] || continue
    __agentstart_endpoint_value=$(__agentstart_endpoint_value "$__agentstart_endpoint_name" "$__agentstart_endpoint_path")
    [ -n "$__agentstart_endpoint_value" ] && export "$__agentstart_endpoint_name=$__agentstart_endpoint_value"
  done
}
# Why: Command Code sanitizes hook subprocess env. The parent TUI process
# still has AgentStart pane/hook metadata, so recover it before posting.
for __agentstart_name in AGENTSTART_AGENT_HOOK_ENDPOINT AGENTSTART_AGENT_HOOK_PORT AGENTSTART_AGENT_HOOK_TOKEN AGENTSTART_AGENT_HOOK_ENV AGENTSTART_AGENT_HOOK_VERSION AGENTSTART_PANE_KEY AGENTSTART_TAB_ID AGENTSTART_WORKTREE_ID AGENTSTART_AGENT_LAUNCH_TOKEN; do
  __agentstart_fill_from_ancestor "$__agentstart_name"
done
if [ -n "$AGENTSTART_AGENT_HOOK_ENDPOINT" ] && [ -r "$AGENTSTART_AGENT_HOOK_ENDPOINT" ]; then
  __agentstart_fill_from_endpoint_file "$AGENTSTART_AGENT_HOOK_ENDPOINT"
fi
# Why: Command Code strips TOKEN-like env vars before invoking hooks. If
# AGENTSTART_AGENT_HOOK_ENDPOINT was not exported into this PTY, recover the
# matching endpoint file by the unstripped loopback port.
if [ -z "$AGENTSTART_AGENT_HOOK_TOKEN" ] && [ -n "$AGENTSTART_AGENT_HOOK_PORT" ]; then
  for endpoint in \
    "$HOME/Library/Application Support/agentstart-dev/agent-hooks"/*/endpoint.env \
    "$HOME/Library/Application Support/agentstart-dev/agent-hooks/endpoint.env" \
    "${XDG_CONFIG_HOME:-$HOME/.config}/agentstart-dev/agent-hooks"/*/endpoint.env \
    "${XDG_CONFIG_HOME:-$HOME/.config}/agentstart-dev/agent-hooks/endpoint.env" \
    "$HOME/Library/Application Support/agentstart/agent-hooks/endpoint.env" \
    "${XDG_CONFIG_HOME:-$HOME/.config}/agentstart/agent-hooks/endpoint.env"; do
    [ -r "$endpoint" ] || continue
    endpoint_port=$(sed -n "s/^AGENTSTART_AGENT_HOOK_PORT=//p" "$endpoint" | head -n 1)
    if [ "$endpoint_port" = "$AGENTSTART_AGENT_HOOK_PORT" ]; then
      __agentstart_fill_from_endpoint_file "$endpoint"
      break
    fi
  done
fi
if [ -z "$AGENTSTART_AGENT_HOOK_PORT" ] || [ -z "$AGENTSTART_AGENT_HOOK_TOKEN" ] || [ -z "$AGENTSTART_PANE_KEY" ]; then
  exit 0
fi
printf '%s' "$payload" | curl -sS -X POST "http://127.0.0.1:${AGENTSTART_AGENT_HOOK_PORT}/hook/command-code" \
  --connect-timeout 0.5 --max-time 1.5 \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-AgentStart-Agent-Hook-Token: ${AGENTSTART_AGENT_HOOK_TOKEN}" \
  --data-urlencode "paneKey=${AGENTSTART_PANE_KEY}" \
  --data-urlencode "tabId=${AGENTSTART_TAB_ID}" \
  --data-urlencode "launchToken=${AGENTSTART_AGENT_LAUNCH_TOKEN}" \
  --data-urlencode "worktreeId=${AGENTSTART_WORKTREE_ID}" \
  --data-urlencode "env=${AGENTSTART_AGENT_HOOK_ENV}" \
  --data-urlencode "version=${AGENTSTART_AGENT_HOOK_VERSION}" \
  --data-urlencode "payload@-" >/dev/null 2>&1 || true
exit 0
