#!/bin/sh
case "$YIRU_ANTIGRAVITY_EVENT" in
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
if [ -n "$YIRU_AGENT_HOOK_ENDPOINT" ] && [ -r "$YIRU_AGENT_HOOK_ENDPOINT" ]; then
  . "$YIRU_AGENT_HOOK_ENDPOINT" 2>/dev/null || :
fi
if [ -z "$YIRU_AGENT_HOOK_PORT" ] || [ -z "$YIRU_AGENT_HOOK_TOKEN" ] || [ -z "$YIRU_PANE_KEY" ]; then
  exit 0
fi
printf '%s' "$payload" | curl -sS -X POST "http://127.0.0.1:${YIRU_AGENT_HOOK_PORT}/hook/antigravity" \
  --connect-timeout 0.5 --max-time 1.5 \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Yiru-Agent-Hook-Token: ${YIRU_AGENT_HOOK_TOKEN}" \
  --data-urlencode "paneKey=${YIRU_PANE_KEY}" \
  --data-urlencode "tabId=${YIRU_TAB_ID}" \
  --data-urlencode "launchToken=${YIRU_AGENT_LAUNCH_TOKEN}" \
  --data-urlencode "worktreeId=${YIRU_WORKTREE_ID}" \
  --data-urlencode "env=${YIRU_AGENT_HOOK_ENV}" \
  --data-urlencode "version=${YIRU_AGENT_HOOK_VERSION}" \
  --data-urlencode "hook_event_name=${YIRU_ANTIGRAVITY_EVENT}" \
  --data-urlencode "payload@-" >/dev/null 2>&1 || true
exit 0
