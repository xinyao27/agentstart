#!/bin/sh
payload=$(cat)
if [ -z "$payload" ]; then
  exit 0
fi
if [ -n "$YIRU_AGENT_HOOK_ENDPOINT" ] && [ -r "$YIRU_AGENT_HOOK_ENDPOINT" ]; then
  . "$YIRU_AGENT_HOOK_ENDPOINT" 2>/dev/null || :
fi
if [ -z "$YIRU_AGENT_HOOK_PORT" ] || [ -z "$YIRU_AGENT_HOOK_TOKEN" ] || [ -z "$YIRU_PANE_KEY" ]; then
  exit 0
fi
grok_home=
if [ -n "${GROK_HOME:-}" ] && [ "${#GROK_HOME}" -le 4096 ]; then
  grok_home=$GROK_HOME
fi
printf '%s' "$payload" | curl -sS -X POST "http://127.0.0.1:${YIRU_AGENT_HOOK_PORT}/hook/grok" \
  --connect-timeout 0.5 --max-time 1.5 \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Yiru-Agent-Hook-Token: ${YIRU_AGENT_HOOK_TOKEN}" \
  --data-urlencode "paneKey=${YIRU_PANE_KEY}" \
  --data-urlencode "tabId=${YIRU_TAB_ID}" \
  --data-urlencode "launchToken=${YIRU_AGENT_LAUNCH_TOKEN}" \
  --data-urlencode "worktreeId=${YIRU_WORKTREE_ID}" \
  --data-urlencode "env=${YIRU_AGENT_HOOK_ENV}" \
  --data-urlencode "version=${YIRU_AGENT_HOOK_VERSION}" \
  --data-urlencode "grokHome=${grok_home}" \
  --data-urlencode "payload@-" >/dev/null 2>&1 || true
exit 0
