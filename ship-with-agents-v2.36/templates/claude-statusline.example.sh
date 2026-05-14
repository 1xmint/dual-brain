#!/bin/bash

# Example Claude Code statusline script.
# Requires jq. Reads Claude Code statusline JSON from stdin and prints one line.

input=$(cat)

model=$(echo "$input" | jq -r '.model.display_name // "?"')
effort=$(echo "$input" | jq -r '.effort.level // "n/a"')
session=$(echo "$input" | jq -r '.session_name // .session_id // "unnamed"' | cut -c1-32)
pct=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
window=$(echo "$input" | jq -r '.context_window.context_window_size // 0')
style=$(echo "$input" | jq -r '.output_style.name // "default"')

reset='\033[0m'

case "$session" in
  h*) lane_color='\033[96m' ;;
  s*) lane_color='\033[95m' ;;
  m*) lane_color='\033[93m' ;;
  a*|w*) lane_color='\033[92m' ;;
  b*) lane_color='\033[38;5;208m' ;;
  *) lane_color='\033[94m' ;;
esac

printf "%b[%s]%b %s | effort:%s | ctx:%s/%s | style:%s\n" \
  "$lane_color" "$session" "$reset" "$model" "$effort" "${pct}%" "$window" "$style"
