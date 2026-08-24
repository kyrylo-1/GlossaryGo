#!/bin/sh

file_path=$(jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)

case "$file_path" in
  raycast-env.d.ts|*/raycast-env.d.ts)
    printf '%s\n' '{"continue":false,"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"raycast-env.d.ts is generated; update the Raycast source or manifest instead."}}'
    ;;
esac
