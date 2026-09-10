#!/bin/sh
case "$AGENTSTART_ANTIGRAVITY_EVENT" in
  Stop)
    printf '{"decision":""}\n'
    ;;
  *)
    printf "{}\n"
    ;;
esac
payload=$(cat)
if [ -z "$payload" ]; then
  payload='{}'
fi
if [ -n "$AGENTSTART_AGENT_HOOK_ENDPOINT" ] && [ -r "$AGENTSTART_AGENT_HOOK_ENDPOINT" ]; then
  . "$AGENTSTART_AGENT_HOOK_ENDPOINT" 2>/dev/null || :
fi
if [ -z "$AGENTSTART_AGENT_HOOK_PORT" ] || [ -z "$AGENTSTART_AGENT_HOOK_TOKEN" ] || [ -z "$AGENTSTART_PANE_KEY" ]; then
  exit 0
fi
printf '%s' "$payload" | curl -sS -X POST "http://127.0.0.1:${AGENTSTART_AGENT_HOOK_PORT}/hook/antigravity" \
  --connect-timeout 0.5 --max-time 1.5 \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-AgentStart-Agent-Hook-Token: ${AGENTSTART_AGENT_HOOK_TOKEN}" \
  --data-urlencode "paneKey=${AGENTSTART_PANE_KEY}" \
  --data-urlencode "tabId=${AGENTSTART_TAB_ID}" \
  --data-urlencode "launchToken=${AGENTSTART_AGENT_LAUNCH_TOKEN}" \
  --data-urlencode "worktreeId=${AGENTSTART_WORKTREE_ID}" \
  --data-urlencode "env=${AGENTSTART_AGENT_HOOK_ENV}" \
  --data-urlencode "version=${AGENTSTART_AGENT_HOOK_VERSION}" \
  --data-urlencode "hook_event_name=${AGENTSTART_ANTIGRAVITY_EVENT}" \
  --data-urlencode "payload@-" >/dev/null 2>&1 || true
exit 0
