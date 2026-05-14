#!/usr/bin/env sh
set -eu

TARGET_REPO="${1:-}"
if [ -z "$TARGET_REPO" ]; then
  echo "usage: sh bootstrap/agent-system-doctor.sh <repo-path>"
  exit 1
fi

TARGET_ROOT="$(CDPATH= cd -- "$TARGET_REPO" && pwd)"
FAIL_COUNT=0
WARN_COUNT=0
ORCHESTRATION_INSTALL=0

pass() { echo "PASS - $1"; }
warn() { echo "WARN - $1"; WARN_COUNT=$((WARN_COUNT + 1)); }
fail() { echo "FAIL - $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

check_path() {
  path="$1"
  kind="$2"
  if [ "$kind" = "file" ] && [ -f "$path" ]; then
    pass "found $path"
  elif [ "$kind" = "dir" ] && [ -d "$path" ]; then
    pass "found $path"
  else
    fail "missing $path"
  fi
}

check_live_vendor_files() {
  directory="$1"
  allowed="$2"
  tmp_file="$(mktemp)"
  find "$directory" -maxdepth 1 -type f > "$tmp_file" 2>/dev/null || true
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    name="$(basename "$file")"
    allowed_match=0
    for allowed_name in $allowed; do
      if [ "$name" = "$allowed_name" ]; then
        allowed_match=1
        break
      fi
    done
    if [ "$allowed_match" -eq 0 ]; then
      warn "live-looking file inside vendor layer: $file"
    fi
  done < "$tmp_file"
  rm -f "$tmp_file"
}

check_active_map_health() {
  map_path="$1"
  [ -f "$map_path" ] || return

  if grep -Eq 'Last verified:[[:space:]]*`?<YYYY-MM-DD' "$map_path"; then
    warn "active chat map still has placeholder Last verified line: $map_path"
  fi

  if ! grep -Fq 'display name:' "$map_path" || ! grep -Fq 'routing id:' "$map_path"; then
    warn "active chat map does not yet separate display name and routing id clearly: $map_path"
  fi

  if awk '
    /^## Active Child Chats/ { in_section=1; next }
    /^## / && in_section { exit }
    in_section && /state:[[:space:]]*`?closed`?/ { found=1; exit }
    END { exit(found ? 0 : 1) }
  ' "$map_path"
  then
    warn "closed row still present inside Active Child Chats: $map_path"
  fi
}

check_optional_file() {
  path="$1"
  if [ -f "$path" ]; then
    pass "runtime helper file present: $path"
  else
    warn "missing runtime helper file: $path"
  fi
}

list_meaningful_markdown_files() {
  directory="$1"
  [ -d "$directory" ] || return
  find "$directory" -maxdepth 1 -type f -name '*.md' ! -name 'README.md' ! -name 'TEMPLATE.md'
}

check_checkpoint_continuity_health() {
  checkpoint_dir="$1"
  closeout_dir="$2"

  list_meaningful_markdown_files "$checkpoint_dir" | while IFS= read -r file; do
    [ -n "$file" ] || continue
    missing=""

    for field in \
      'Last verified at:' \
      'Freshness window:' \
      'Terminal status:' \
      'Pickup confidence:' \
      'Resume risk:' \
      'Closeout packet needed:' \
      'Lane state if stopping now:'
    do
      if ! grep -Fq "$field" "$file"; then
        if [ -n "$missing" ]; then
          missing="$missing, $field"
        else
          missing="$field"
        fi
      fi
    done

    if [ -n "$missing" ]; then
      warn "checkpoint missing continuity field(s): $file -> $missing"
    fi

    if grep -Eiq '^Closeout packet needed:[[:space:]]*(yes|probably later)([[:space:]]|$)' "$file"; then
      expected_closeout="$closeout_dir/$(basename "$file")"
      if [ ! -f "$expected_closeout" ]; then
        warn "checkpoint says closeout packet is needed but closeout file is missing: $expected_closeout"
      fi
    fi
  done
}

check_closeout_continuity_health() {
  closeout_dir="$1"

  list_meaningful_markdown_files "$closeout_dir" | while IFS= read -r file; do
    [ -n "$file" ] || continue
    missing=""

    for field in \
      'Lane state action:' \
      'Active-workstreams action:' \
      'Active-chat-map action:' \
      'Expected next session:'
    do
      if ! grep -Fq "$field" "$file"; then
        if [ -n "$missing" ]; then
          missing="$missing, $field"
        else
          missing="$field"
        fi
      fi
    done

    if [ -n "$missing" ]; then
      warn "closeout missing lane-state cleanup field(s): $file -> $missing"
    fi
  done
}

check_lane_capsule_inbox_health() {
  lane_dir="$1"

  [ -d "$lane_dir" ] || return

  find "$lane_dir" -mindepth 2 -maxdepth 2 -type f -name 'STATE.md' | while IFS= read -r file; do
    [ -n "$file" ] || continue

    inbox_rel="$(sed -n 's/^Inbox path:[[:space:]]*`\(.*\)`/\1/p' "$file" | head -n 1)"
    if [ -z "$inbox_rel" ]; then
      inbox_rel="$(sed -n 's/^Inbox:[[:space:]]*`\(.*\)`/\1/p' "$file" | head -n 1)"
    fi
    lane_state="$(sed -n 's/^Lifecycle state:[[:space:]]*`\(.*\)`/\1/p' "$file" | head -n 1)"

    [ -n "$inbox_rel" ] || continue

    case "$lane_state" in
      closed|inactive|superseded|archived)
        continue
        ;;
    esac

    case "$inbox_rel" in
      _agent-system-runtime/*)
        inbox_path="$TARGET_ROOT/${inbox_rel#_agent-system-runtime/}"
        inbox_path="$TARGET_ROOT/_agent-system-runtime/${inbox_rel#_agent-system-runtime/}"
        ;;
      _agent-system/*)
        inbox_path="$TARGET_ROOT/${inbox_rel#_agent-system/}"
        inbox_path="$TARGET_ROOT/_agent-system/${inbox_rel#_agent-system/}"
        ;;
      *)
        inbox_path="$TARGET_ROOT/$inbox_rel"
        ;;
    esac

    if [ ! -f "$inbox_path" ]; then
      warn "missing lane inbox for live lane capsule: $file -> $inbox_path"
    fi
  done
}

check_naming_schema_health() {
  vendor_root="$1"
  claude_agents_root="$2"
  schema_path="$vendor_root/NAMING-SCHEMA.md"

  if [ -f "$schema_path" ]; then
    pass "naming schema present: $schema_path"
  else
    fail "missing naming schema: $schema_path"
  fi

  for file in \
    "$vendor_root/ACTIVE-CHAT-MAP.md" \
    "$vendor_root/ACTIVE-MAP-HYGIENE.md" \
    "$vendor_root/DISPLAY-NAME-AND-ROUTING-ID-SEPARATION.md" \
    "$vendor_root/HUMAN-FRIENDLY-NAMING-GATE.md" \
    "$vendor_root/HOW-IT-WORKS.md" \
    "$vendor_root/NAMING-SCHEMA.md" \
    "$vendor_root/ROUTING-MATRIX.md" \
    "$vendor_root/START-BRAINSTORM.md" \
    "$vendor_root/START-DOCTOR.md" \
    "$vendor_root/START-HEAD.md" \
    "$vendor_root/START-MANAGER.md" \
    "$vendor_root/START-SUPER.md" \
    "$vendor_root/START-AGENT.md" \
    "$vendor_root/START-WORKER.md" \
    "$vendor_root/agent-prompt.md" \
    "$vendor_root/agent-reference.md" \
    "$vendor_root/head-prompt.md" \
    "$vendor_root/manager-prompt.md" \
    "$vendor_root/super-prompt.md" \
    "$claude_agents_root/head.md" \
    "$claude_agents_root/manager.md" \
    "$claude_agents_root/super.md" \
    "$claude_agents_root/agent.md" \
    "$claude_agents_root/doctor.md"
  do
    [ -f "$file" ] || continue

    if [ "$(basename "$file")" != "DISPLAY-NAME-AND-ROUTING-ID-SEPARATION.md" ]; then
      if grep -Eq 'h<N>|s<N>|s<N>-<workstream>|a<N>-<workstream>|-r<N>|\.<N>' "$file" ||
         grep -Eq '(^|[^[:alnum:]_-])s[0-9]+(-[a-z0-9][a-z0-9-]*)+(-r[0-9]+)?(\.[0-9]+)?([^[:alnum:]_-]|$)' "$file" ||
         grep -Eq '(^|[^[:alnum:]_-])a[0-9]+(-[a-z0-9][a-z0-9-]*)+(-r[0-9]+)?(\.[0-9]+)?([^[:alnum:]_-]|$)' "$file" ||
         grep -Eq '(^|[^[:alnum:]_-])[hb][0-9]+r[0-9]+(\.[0-9]+)?([^[:alnum:]_-]|$)' "$file"
      then
        warn "legacy compact naming still present in shipped guidance: $file"
      fi
    fi

    if grep -Eq '(^|[^[:alnum:]_-])(Head|Manager|Supervisor|Doctor|Agent|Brainstorm|Worker)[0-9]+[[:space:]]+-' "$file"
    then
      warn "legacy numbered buyer-facing title still present in shipped guidance: $file"
    fi
  done
}

echo "Doctor report for $TARGET_ROOT"
echo

if [ -f "$TARGET_ROOT/AGENTS.md" ]; then
  pass "AGENTS.md found"
else
  fail "missing AGENTS.md in repo root"
fi

if [ -f "$TARGET_ROOT/CLAUDE.md" ]; then
  pass "CLAUDE.md found"
else
  warn "missing CLAUDE.md in repo root"
fi

if [ -d "$TARGET_ROOT/_agent-system" ]; then
  ORCHESTRATION_INSTALL=1
  pass "_agent-system/ found"
  [ -f "$TARGET_ROOT/_agent-system/DOCTOR-PLAYBOOK.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/DOCTOR-PLAYBOOK.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/DOCTOR-PLAYBOOK.md"
  [ -f "$TARGET_ROOT/_agent-system/DOCTOR-FINDING-SCHEMA.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/DOCTOR-FINDING-SCHEMA.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/DOCTOR-FINDING-SCHEMA.md"
  [ -f "$TARGET_ROOT/_agent-system/DOCTOR-SEVERITY-MODEL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/DOCTOR-SEVERITY-MODEL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/DOCTOR-SEVERITY-MODEL.md"
  [ -f "$TARGET_ROOT/_agent-system/DOCTOR-OBSERVABILITY-LAYER.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/DOCTOR-OBSERVABILITY-LAYER.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/DOCTOR-OBSERVABILITY-LAYER.md"
  [ -f "$TARGET_ROOT/_agent-system/DOCTOR-SWEEP-PROTOCOL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/DOCTOR-SWEEP-PROTOCOL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/DOCTOR-SWEEP-PROTOCOL.md"
  [ -f "$TARGET_ROOT/_agent-system/DOCTOR-CONTROL-PLANE-DASHBOARD.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/DOCTOR-CONTROL-PLANE-DASHBOARD.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/DOCTOR-CONTROL-PLANE-DASHBOARD.md"
  [ -f "$TARGET_ROOT/_agent-system/TURN-OUTCOME-EVENT-SCHEMA.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/TURN-OUTCOME-EVENT-SCHEMA.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/TURN-OUTCOME-EVENT-SCHEMA.md"
  [ -f "$TARGET_ROOT/_agent-system/EVIDENCE-RETENTION-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/EVIDENCE-RETENTION-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/EVIDENCE-RETENTION-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/OBSERVABILITY-METRICS-MODEL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/OBSERVABILITY-METRICS-MODEL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/OBSERVABILITY-METRICS-MODEL.md"
  [ -f "$TARGET_ROOT/_agent-system/LANE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/LANE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/LANE.md"
  [ -f "$TARGET_ROOT/_agent-system/UNRESOLVED-ISSUES-REGISTER.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/UNRESOLVED-ISSUES-REGISTER.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/UNRESOLVED-ISSUES-REGISTER.md"
  [ -f "$TARGET_ROOT/_agent-system/ORPHAN-LANE-DETECTOR.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/ORPHAN-LANE-DETECTOR.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/ORPHAN-LANE-DETECTOR.md"
  [ -f "$TARGET_ROOT/_agent-system/STATE-FRESHNESS-SLA.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/STATE-FRESHNESS-SLA.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/STATE-FRESHNESS-SLA.md"
  [ -f "$TARGET_ROOT/_agent-system/TURN-EVENT-CAPTURE-POLICY.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/TURN-EVENT-CAPTURE-POLICY.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/TURN-EVENT-CAPTURE-POLICY.md"
  [ -f "$TARGET_ROOT/_agent-system/FRUSTRATION-RESOLUTION-PROTOCOL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/FRUSTRATION-RESOLUTION-PROTOCOL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/FRUSTRATION-RESOLUTION-PROTOCOL.md"
  [ -f "$TARGET_ROOT/_agent-system/CROSS-LANE-AWARENESS-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/CROSS-LANE-AWARENESS-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/CROSS-LANE-AWARENESS-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/STRATEGIC-FOUNDATION-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/STRATEGIC-FOUNDATION-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/STRATEGIC-FOUNDATION-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/LINEAGE-AND-PROGRESSION-MODEL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/LINEAGE-AND-PROGRESSION-MODEL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/LINEAGE-AND-PROGRESSION-MODEL.md"
  [ -f "$TARGET_ROOT/_agent-system/EXECUTION-OWNER-REUSE-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/EXECUTION-OWNER-REUSE-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/EXECUTION-OWNER-REUSE-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/HEAD-DECISION-RUBRIC.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/HEAD-DECISION-RUBRIC.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/HEAD-DECISION-RUBRIC.md"
  [ -f "$TARGET_ROOT/_agent-system/MANAGER-SUPER-AUDIT-RUBRIC.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/MANAGER-SUPER-AUDIT-RUBRIC.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/MANAGER-SUPER-AUDIT-RUBRIC.md"
  [ -f "$TARGET_ROOT/_agent-system/TOP-CHAIN-ANTI-PATTERNS.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/TOP-CHAIN-ANTI-PATTERNS.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/TOP-CHAIN-ANTI-PATTERNS.md"
  [ -f "$TARGET_ROOT/_agent-system/HEAD-MANAGER-SCOREBOARD.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/HEAD-MANAGER-SCOREBOARD.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/HEAD-MANAGER-SCOREBOARD.md"
  [ -f "$TARGET_ROOT/_agent-system/EXECUTION-COMPLETION-TO-CLOSEOUT-PROTOCOL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/EXECUTION-COMPLETION-TO-CLOSEOUT-PROTOCOL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/EXECUTION-COMPLETION-TO-CLOSEOUT-PROTOCOL.md"
  [ -f "$TARGET_ROOT/_agent-system/TERMINAL-REPORT-CONVERSION-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/TERMINAL-REPORT-CONVERSION-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/TERMINAL-REPORT-CONVERSION-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/BUDGET-AND-SUBSCRIPTION-ROUTING.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/BUDGET-AND-SUBSCRIPTION-ROUTING.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/BUDGET-AND-SUBSCRIPTION-ROUTING.md"
  [ -f "$TARGET_ROOT/_agent-system/USER-SUPPORT-PROFILE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/USER-SUPPORT-PROFILE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/USER-SUPPORT-PROFILE.md"
  [ -f "$TARGET_ROOT/_agent-system/SUPPORT-POSTURE-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/SUPPORT-POSTURE-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/SUPPORT-POSTURE-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/DOCTOR-NOTE-PROTOCOL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/DOCTOR-NOTE-PROTOCOL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/DOCTOR-NOTE-PROTOCOL.md"
  [ -f "$TARGET_ROOT/_agent-system/ADAPTIVE-EXPLANATION-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/ADAPTIVE-EXPLANATION-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/ADAPTIVE-EXPLANATION-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/USER-CONFIDENCE-MODEL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/USER-CONFIDENCE-MODEL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/USER-CONFIDENCE-MODEL.md"
  [ -f "$TARGET_ROOT/_agent-system/GUIDED-TAIL-PATTERNS.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/GUIDED-TAIL-PATTERNS.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/GUIDED-TAIL-PATTERNS.md"
[ -f "$TARGET_ROOT/_agent-system/BUYER-HANDHOLDING-COMPLETION-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/BUYER-HANDHOLDING-COMPLETION-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/BUYER-HANDHOLDING-COMPLETION-RULE.md"
[ -f "$TARGET_ROOT/_agent-system/PARENT-PICKUP-HANDHOLDING-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/PARENT-PICKUP-HANDHOLDING-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/PARENT-PICKUP-HANDHOLDING-RULE.md"
[ -f "$TARGET_ROOT/_agent-system/SURFACE-AND-EFFORT-DISCLOSURE-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/SURFACE-AND-EFFORT-DISCLOSURE-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/SURFACE-AND-EFFORT-DISCLOSURE-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/CONTINUE-UNLESS-REAL-BOUNDARY-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/CONTINUE-UNLESS-REAL-BOUNDARY-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/CONTINUE-UNLESS-REAL-BOUNDARY-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/OBVIOUS-NEXT-STEP-AUTONOMY-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/OBVIOUS-NEXT-STEP-AUTONOMY-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/OBVIOUS-NEXT-STEP-AUTONOMY-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/LAUNCH.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/LAUNCH.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/LAUNCH.md"
  [ -f "$TARGET_ROOT/_agent-system/WRONG-LANE-INPUT-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/WRONG-LANE-INPUT-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/WRONG-LANE-INPUT-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/MINIMAL-REPAIR-NOTE-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/MINIMAL-REPAIR-NOTE-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/MINIMAL-REPAIR-NOTE-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/RESULT-RETURN-SIMPLIFICATION-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/RESULT-RETURN-SIMPLIFICATION-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/RESULT-RETURN-SIMPLIFICATION-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/THREAD-ADOPTION-CONFIRMATION-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/THREAD-ADOPTION-CONFIRMATION-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/THREAD-ADOPTION-CONFIRMATION-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/SELF-REGISTRATION-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/SELF-REGISTRATION-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/SELF-REGISTRATION-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/AGENT-FRESHNESS-REUSE-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/AGENT-FRESHNESS-REUSE-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/AGENT-FRESHNESS-REUSE-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/PLUGIN-AWARENESS-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/PLUGIN-AWARENESS-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/PLUGIN-AWARENESS-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/PLUGIN-INVENTORY.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/PLUGIN-INVENTORY.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/PLUGIN-INVENTORY.md"
  [ -f "$TARGET_ROOT/_agent-system/PLUGIN-FIT-MATRIX.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/PLUGIN-FIT-MATRIX.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/PLUGIN-FIT-MATRIX.md"
  [ -f "$TARGET_ROOT/_agent-system/PLUGIN-OPTIONALITY-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/PLUGIN-OPTIONALITY-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/PLUGIN-OPTIONALITY-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/PLUGIN-INSTALL-SUGGESTION-PROTOCOL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/PLUGIN-INSTALL-SUGGESTION-PROTOCOL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/PLUGIN-INSTALL-SUGGESTION-PROTOCOL.md"
  [ -f "$TARGET_ROOT/_agent-system/PLUGIN-PORTABILITY-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/PLUGIN-PORTABILITY-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/PLUGIN-PORTABILITY-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/RUNTIME-MAIL-PROTOCOL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/RUNTIME-MAIL-PROTOCOL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/RUNTIME-MAIL-PROTOCOL.md"
  [ -f "$TARGET_ROOT/_agent-system/DONE-ABSORPTION-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/DONE-ABSORPTION-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/DONE-ABSORPTION-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/FAN-IN-SYNTHESIS-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/FAN-IN-SYNTHESIS-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/FAN-IN-SYNTHESIS-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/MAILBOX-STATE-MODEL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/MAILBOX-STATE-MODEL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/MAILBOX-STATE-MODEL.md"
  [ -f "$TARGET_ROOT/_agent-system/COORDINATION-COST-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/COORDINATION-COST-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/COORDINATION-COST-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/CANONICAL-PACKET-MINIMIZATION-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/CANONICAL-PACKET-MINIMIZATION-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/CANONICAL-PACKET-MINIMIZATION-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/FAST-PATH-VS-TEACHING-PATH-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/FAST-PATH-VS-TEACHING-PATH-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/FAST-PATH-VS-TEACHING-PATH-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/TRUTH-BEFORE-ASSUMPTION.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/TRUTH-BEFORE-ASSUMPTION.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/TRUTH-BEFORE-ASSUMPTION.md"
  [ -f "$TARGET_ROOT/_agent-system/RUNTIME-TERM-SEPARATION-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/RUNTIME-TERM-SEPARATION-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/RUNTIME-TERM-SEPARATION-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/CAPABILITY-TRUTH-VERIFICATION-PROTOCOL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/CAPABILITY-TRUTH-VERIFICATION-PROTOCOL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/CAPABILITY-TRUTH-VERIFICATION-PROTOCOL.md"
  [ -f "$TARGET_ROOT/_agent-system/SURFACE-RUNTIME-TERM-MATRIX.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/SURFACE-RUNTIME-TERM-MATRIX.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/SURFACE-RUNTIME-TERM-MATRIX.md"
  [ -f "$TARGET_ROOT/_agent-system/MISSION-LOCK-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/MISSION-LOCK-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/MISSION-LOCK-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/ADJACENT-WORKSTREAM-AWARENESS-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/ADJACENT-WORKSTREAM-AWARENESS-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/ADJACENT-WORKSTREAM-AWARENESS-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/INTERNET-AWARENESS-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/INTERNET-AWARENESS-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/INTERNET-AWARENESS-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/RESEARCH-FRESHNESS-LADDER.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/RESEARCH-FRESHNESS-LADDER.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/RESEARCH-FRESHNESS-LADDER.md"
  [ -f "$TARGET_ROOT/_agent-system/SOURCE-TIER-POLICY.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/SOURCE-TIER-POLICY.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/SOURCE-TIER-POLICY.md"
  [ -f "$TARGET_ROOT/_agent-system/BIG-PICTURE-SCOUT-PASS.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/BIG-PICTURE-SCOUT-PASS.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/BIG-PICTURE-SCOUT-PASS.md"
  [ -f "$TARGET_ROOT/_agent-system/SECURITY-AND-DOCS-RESEARCH-PROTOCOL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/SECURITY-AND-DOCS-RESEARCH-PROTOCOL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/SECURITY-AND-DOCS-RESEARCH-PROTOCOL.md"
  [ -f "$TARGET_ROOT/_agent-system/WEB-CAPABLE-LANE-ROUTING.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/WEB-CAPABLE-LANE-ROUTING.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/WEB-CAPABLE-LANE-ROUTING.md"
  [ -f "$TARGET_ROOT/_agent-system/EXTERNAL-RESEARCH-EVIDENCE-LEDGER.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/EXTERNAL-RESEARCH-EVIDENCE-LEDGER.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/EXTERNAL-RESEARCH-EVIDENCE-LEDGER.md"
  [ -f "$TARGET_ROOT/_agent-system/INTENT-COMPILER.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/INTENT-COMPILER.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/INTENT-COMPILER.md"
  [ -f "$TARGET_ROOT/_agent-system/VISUALIZATION-DECISION-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/VISUALIZATION-DECISION-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/VISUALIZATION-DECISION-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/PRESENTATION-MODE-LADDER.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/PRESENTATION-MODE-LADDER.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/PRESENTATION-MODE-LADDER.md"
  [ -f "$TARGET_ROOT/_agent-system/VIBE-CODING-TRANSLATOR.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/VIBE-CODING-TRANSLATOR.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/VIBE-CODING-TRANSLATOR.md"
  [ -f "$TARGET_ROOT/_agent-system/CHUNK-MAP-PROTOCOL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/CHUNK-MAP-PROTOCOL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/CHUNK-MAP-PROTOCOL.md"
  [ -f "$TARGET_ROOT/_agent-system/DESKTOP-APP-AFFORDANCE-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/DESKTOP-APP-AFFORDANCE-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/DESKTOP-APP-AFFORDANCE-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/SMART-NEXT-STEP-FRAMING.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/SMART-NEXT-STEP-FRAMING.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/SMART-NEXT-STEP-FRAMING.md"
  [ -f "$TARGET_ROOT/_agent-system/SYSTEM-WORLD-MODEL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/SYSTEM-WORLD-MODEL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/SYSTEM-WORLD-MODEL.md"
  [ -f "$TARGET_ROOT/_agent-system/WORKSTREAM-DEPENDENCY-GRAPH.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/WORKSTREAM-DEPENDENCY-GRAPH.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/WORKSTREAM-DEPENDENCY-GRAPH.md"
  [ -f "$TARGET_ROOT/_agent-system/CROSS-WORKSTREAM-CONTRACTS.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/CROSS-WORKSTREAM-CONTRACTS.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/CROSS-WORKSTREAM-CONTRACTS.md"
  [ -f "$TARGET_ROOT/_agent-system/NEIGHBOR-AWARENESS-CAPSULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/NEIGHBOR-AWARENESS-CAPSULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/NEIGHBOR-AWARENESS-CAPSULE.md"
  [ -f "$TARGET_ROOT/_agent-system/CHANGE-EVENT-SCHEMA.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/CHANGE-EVENT-SCHEMA.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/CHANGE-EVENT-SCHEMA.md"
  [ -f "$TARGET_ROOT/_agent-system/WORKSTREAM-IMPACT-PROPAGATION-PROTOCOL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/WORKSTREAM-IMPACT-PROPAGATION-PROTOCOL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/WORKSTREAM-IMPACT-PROPAGATION-PROTOCOL.md"
  [ -f "$TARGET_ROOT/_agent-system/REPLAN-TRIGGER-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/REPLAN-TRIGGER-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/REPLAN-TRIGGER-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/ATTENTION-ROUTING-ENGINE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/ATTENTION-ROUTING-ENGINE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/ATTENTION-ROUTING-ENGINE.md"
  [ -f "$TARGET_ROOT/_agent-system/SYSTEM-STORY-DIGEST.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/SYSTEM-STORY-DIGEST.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/SYSTEM-STORY-DIGEST.md"
  [ -f "$TARGET_ROOT/_agent-system/CONFLICT-RADAR.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/CONFLICT-RADAR.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/CONFLICT-RADAR.md"
  [ -f "$TARGET_ROOT/_agent-system/OPPORTUNITY-RADAR.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/OPPORTUNITY-RADAR.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/OPPORTUNITY-RADAR.md"
  [ -f "$TARGET_ROOT/_agent-system/TOP-CHAIN-SYNTHESIS-LOOP.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/TOP-CHAIN-SYNTHESIS-LOOP.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/TOP-CHAIN-SYNTHESIS-LOOP.md"
  [ -f "$TARGET_ROOT/_agent-system/LIVE-HYDRATION-BOOTSTRAP.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/LIVE-HYDRATION-BOOTSTRAP.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/LIVE-HYDRATION-BOOTSTRAP.md"
  [ -f "$TARGET_ROOT/_agent-system/REVIEW-STATE-MACHINE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/REVIEW-STATE-MACHINE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/REVIEW-STATE-MACHINE.md"
  [ -f "$TARGET_ROOT/_agent-system/BUYER-STEERING-VS-BUYER-LABOR-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/BUYER-STEERING-VS-BUYER-LABOR-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/BUYER-STEERING-VS-BUYER-LABOR-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/RECOMMENDATION-FIRST-OUTPUT-CONTRACT.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/RECOMMENDATION-FIRST-OUTPUT-CONTRACT.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/RECOMMENDATION-FIRST-OUTPUT-CONTRACT.md"
  [ -f "$TARGET_ROOT/_agent-system/DEFAULT-RECOMMENDATION-RESOLUTION-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/DEFAULT-RECOMMENDATION-RESOLUTION-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/DEFAULT-RECOMMENDATION-RESOLUTION-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/REVIEW-CELL-STATE-REGISTRY.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/REVIEW-CELL-STATE-REGISTRY.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/REVIEW-CELL-STATE-REGISTRY.md"
  [ -f "$TARGET_ROOT/_agent-system/EXECUTABLE-HANDOFF-BRIDGE-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/EXECUTABLE-HANDOFF-BRIDGE-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/EXECUTABLE-HANDOFF-BRIDGE-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/PASSIVE-ROUTING-VS-ACTIVE-PICKUP-PROTOCOL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/PASSIVE-ROUTING-VS-ACTIVE-PICKUP-PROTOCOL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/PASSIVE-ROUTING-VS-ACTIVE-PICKUP-PROTOCOL.md"
  [ -f "$TARGET_ROOT/_agent-system/DUAL-BRAIN-COMMIT-PROTOCOL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/DUAL-BRAIN-COMMIT-PROTOCOL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/DUAL-BRAIN-COMMIT-PROTOCOL.md"
  [ -f "$TARGET_ROOT/_agent-system/MULTI-BRAIN-TOPOLOGY.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/MULTI-BRAIN-TOPOLOGY.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/MULTI-BRAIN-TOPOLOGY.md"
  [ -f "$TARGET_ROOT/_agent-system/TRI-BRAIN-DIVERSITY-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/TRI-BRAIN-DIVERSITY-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/TRI-BRAIN-DIVERSITY-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/PROVIDER-ROLE-BINDING-MATRIX.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/PROVIDER-ROLE-BINDING-MATRIX.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/PROVIDER-ROLE-BINDING-MATRIX.md"
  [ -f "$TARGET_ROOT/_agent-system/DISPLAY-NAME-AND-ROUTING-ID-SEPARATION.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/DISPLAY-NAME-AND-ROUTING-ID-SEPARATION.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/DISPLAY-NAME-AND-ROUTING-ID-SEPARATION.md"
  [ -f "$TARGET_ROOT/_agent-system/ROTATION-THRESHOLD-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/ROTATION-THRESHOLD-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/ROTATION-THRESHOLD-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/LIVE-STATE-POPULATION-PROTOCOL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/LIVE-STATE-POPULATION-PROTOCOL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/LIVE-STATE-POPULATION-PROTOCOL.md"
  [ -f "$TARGET_ROOT/_agent-system/IDENTITY-DISCIPLINE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/IDENTITY-DISCIPLINE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/IDENTITY-DISCIPLINE.md"
  [ -f "$TARGET_ROOT/_agent-system/STARTUP-SELF-CHECK-GATE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/STARTUP-SELF-CHECK-GATE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/STARTUP-SELF-CHECK-GATE.md"
  [ -f "$TARGET_ROOT/_agent-system/WORKSTREAM-STORY-MODEL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/WORKSTREAM-STORY-MODEL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/WORKSTREAM-STORY-MODEL.md"
  [ -f "$TARGET_ROOT/_agent-system/LIFECYCLE-REPAIR-PROTOCOL.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/LIFECYCLE-REPAIR-PROTOCOL.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/LIFECYCLE-REPAIR-PROTOCOL.md"
  [ -f "$TARGET_ROOT/_agent-system/WORKSTREAM-CELL-REGISTRY.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/WORKSTREAM-CELL-REGISTRY.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/WORKSTREAM-CELL-REGISTRY.md"
  [ -f "$TARGET_ROOT/_agent-system/CHUNK-TRACKING-RULE.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/CHUNK-TRACKING-RULE.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/CHUNK-TRACKING-RULE.md"
  [ -f "$TARGET_ROOT/_agent-system/HEAD-MANAGER-CONTROL-PLANE-LOOP.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/HEAD-MANAGER-CONTROL-PLANE-LOOP.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/HEAD-MANAGER-CONTROL-PLANE-LOOP.md"
  [ -f "$TARGET_ROOT/_agent-system/LEGACY-LIVE-ID-MIGRATION.md" ] && pass "doctor doc present: $TARGET_ROOT/_agent-system/LEGACY-LIVE-ID-MIGRATION.md" || fail "missing doctor doc: $TARGET_ROOT/_agent-system/LEGACY-LIVE-ID-MIGRATION.md"
  check_path "$TARGET_ROOT/_agent-system-local" dir
  check_path "$TARGET_ROOT/_agent-system-runtime" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/ACTIVE-WORKSTREAMS.md" file
  check_path "$TARGET_ROOT/_agent-system-runtime/slices" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/reviews" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/checkpoints" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/checkpoint-events" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/closeouts" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/health" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/lanes" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/workstreams" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/observability" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/lanes/README.md" file
  check_path "$TARGET_ROOT/_agent-system-runtime/workstreams/README.md" file
  check_path "$TARGET_ROOT/_agent-system-runtime/workstreams/system-story.md" file
  check_path "$TARGET_ROOT/_agent-system-runtime/workstreams/neighbor-digest.json" file
  check_path "$TARGET_ROOT/_agent-system-runtime/health/README.md" file
  check_path "$TARGET_ROOT/_agent-system-runtime/health/DASHBOARD.md" file
  check_path "$TARGET_ROOT/_agent-system-runtime/health/summary.json" file
  check_path "$TARGET_ROOT/_agent-system-runtime/health/workstreams.json" file
  check_path "$TARGET_ROOT/_agent-system-runtime/observability/README.md" file
  check_path "$TARGET_ROOT/_agent-system-runtime/observability/turn-events.jsonl" file
  check_path "$TARGET_ROOT/_agent-system-runtime/observability/impact-events.jsonl" file
  check_path "$TARGET_ROOT/_agent-system-runtime/observability/evidence.md" file
  check_path "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" file
  check_path "$TARGET_ROOT/_agent-system-runtime/observability/mail-events.jsonl" file
  check_path "$TARGET_ROOT/_agent-system-runtime/observability/mailbox-state.json" file
  check_path "$TARGET_ROOT/_agent-system-runtime/observability/heartbeats.json" file
  check_path "$TARGET_ROOT/_agent-system-runtime/observability/lane-awareness.json" file
  check_path "$TARGET_ROOT/_agent-system-runtime/observability/unresolved-issues.json" file
  check_path "$TARGET_ROOT/_agent-system-runtime/observability/doctor-dashboard.md" file
  check_path "$TARGET_ROOT/_agent-system-runtime/checkpoint-events/README.md" file
  check_path "$TARGET_ROOT/_agent-system-runtime/closeouts/README.md" file
  check_path "$TARGET_ROOT/_agent-system-runtime/logs" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/archive" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/mail" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/mail/inbox" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/updates" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/updates/inbox" dir
  check_path "$TARGET_ROOT/_agent-system-runtime/updates/UPDATE-FEED.md" file
  check_path "$TARGET_ROOT/_agent-system-runtime/updates/UPDATE-INDEX.md" file
  check_path "$TARGET_ROOT/_agent-system-runtime/updates/UPDATE-WATERMARKS.md" file
  check_optional_file "$TARGET_ROOT/_agent-system-runtime/checkpoint-events/TEMPLATE.md"
  check_optional_file "$TARGET_ROOT/_agent-system-runtime/closeouts/TEMPLATE.md"
  check_optional_file "$TARGET_ROOT/_agent-system-runtime/updates/README.md"
  check_optional_file "$TARGET_ROOT/_agent-system-runtime/updates/inbox/README.md"
  check_optional_file "$TARGET_ROOT/_agent-system-runtime/updates/inbox/TEMPLATE.md"
  check_optional_file "$TARGET_ROOT/_agent-system-runtime/mail/README.md"
  check_optional_file "$TARGET_ROOT/_agent-system-runtime/mail/inbox/README.md"
  check_optional_file "$TARGET_ROOT/_agent-system-runtime/mail/inbox/TEMPLATE.md"

  [ -f "$TARGET_ROOT/_agent-system-local/INSTALL-CONFIG.md" ] || warn "missing _agent-system-local/INSTALL-CONFIG.md"
  [ -f "$TARGET_ROOT/_agent-system-local/ENABLED-MODULES.md" ] || warn "missing _agent-system-local/ENABLED-MODULES.md"
  [ -f "$TARGET_ROOT/_agent-system-local/OPERATOR-PREFERENCES.md" ] || warn "missing _agent-system-local/OPERATOR-PREFERENCES.md"

  [ -f "$TARGET_ROOT/.claude/agents/head.md" ] || warn "missing .claude/agents/head.md"
  [ -f "$TARGET_ROOT/.claude/agents/manager.md" ] || warn "missing .claude/agents/manager.md"
  [ -f "$TARGET_ROOT/.claude/agents/doctor.md" ] || warn "missing .claude/agents/doctor.md"
  [ -f "$TARGET_ROOT/.claude/agents/super.md" ] || warn "missing .claude/agents/super.md"
  [ -f "$TARGET_ROOT/.claude/agents/agent.md" ] || warn "missing .claude/agents/agent.md"
  [ -f "$TARGET_ROOT/.claude/agents/worker.md" ] || warn "missing .claude/agents/worker.md"
  [ -f "$TARGET_ROOT/.claude/commands/read-inbox.md" ] || warn "missing .claude/commands/read-inbox.md"
  [ -f "$TARGET_ROOT/.claude/commands/sync-lane.md" ] || warn "missing .claude/commands/sync-lane.md"
  [ -f "$TARGET_ROOT/.claude/commands/resolve-identity.md" ] || warn "missing .claude/commands/resolve-identity.md"
  [ -f "$TARGET_ROOT/.claude/commands/startup-self-check.md" ] || warn "missing .claude/commands/startup-self-check.md"
  [ -f "$TARGET_ROOT/.claude/commands/broker-lane.md" ] || warn "missing .claude/commands/broker-lane.md"
  [ -f "$TARGET_ROOT/.claude/commands/refresh-workstream-story.md" ] || warn "missing .claude/commands/refresh-workstream-story.md"
  [ -f "$TARGET_ROOT/.claude/commands/repair-lifecycle.md" ] || warn "missing .claude/commands/repair-lifecycle.md"
  [ -f "$TARGET_ROOT/.claude/commands/assess-foundation.md" ] || warn "missing .claude/commands/assess-foundation.md"
  [ -f "$TARGET_ROOT/.claude/commands/assess-review-topology.md" ] || warn "missing .claude/commands/assess-review-topology.md"
  [ -f "$TARGET_ROOT/.claude/commands/assess-review-state.md" ] || warn "missing .claude/commands/assess-review-state.md"
  [ -f "$TARGET_ROOT/.claude/commands/assess-context-purity.md" ] || warn "missing .claude/commands/assess-context-purity.md"
  [ -f "$TARGET_ROOT/.claude/commands/assess-provider-mix.md" ] || warn "missing .claude/commands/assess-provider-mix.md"
  [ -f "$TARGET_ROOT/.claude/commands/assess-support-posture.md" ] || warn "missing .claude/commands/assess-support-posture.md"
  [ -f "$TARGET_ROOT/.claude/commands/compile-intent.md" ] || warn "missing .claude/commands/compile-intent.md"
  [ -f "$TARGET_ROOT/.claude/commands/choose-presentation-mode.md" ] || warn "missing .claude/commands/choose-presentation-mode.md"
  [ -f "$TARGET_ROOT/.claude/commands/draw-lane-map.md" ] || warn "missing .claude/commands/draw-lane-map.md"
  [ -f "$TARGET_ROOT/.claude/commands/draw-chunk-map.md" ] || warn "missing .claude/commands/draw-chunk-map.md"
  [ -f "$TARGET_ROOT/.claude/commands/translate-vibe-request.md" ] || warn "missing .claude/commands/translate-vibe-request.md"
  [ -f "$TARGET_ROOT/.claude/commands/trace-impact.md" ] || warn "missing .claude/commands/trace-impact.md"
  [ -f "$TARGET_ROOT/.claude/commands/trace-dependencies.md" ] || warn "missing .claude/commands/trace-dependencies.md"
  [ -f "$TARGET_ROOT/.claude/commands/refresh-system-story.md" ] || warn "missing .claude/commands/refresh-system-story.md"
  [ -f "$TARGET_ROOT/.claude/commands/assess-conflicts.md" ] || warn "missing .claude/commands/assess-conflicts.md"
  [ -f "$TARGET_ROOT/.claude/commands/assess-opportunities.md" ] || warn "missing .claude/commands/assess-opportunities.md"
  [ -f "$TARGET_ROOT/.claude/commands/brief-neighbors.md" ] || warn "missing .claude/commands/brief-neighbors.md"
  [ -f "$TARGET_ROOT/.claude/commands/draft-recommendation.md" ] || warn "missing .claude/commands/draft-recommendation.md"
  [ -f "$TARGET_ROOT/.claude/commands/draft-doctor-note.md" ] || warn "missing .claude/commands/draft-doctor-note.md"
  [ -f "$TARGET_ROOT/.claude/commands/form-review-cell.md" ] || warn "missing .claude/commands/form-review-cell.md"
  [ -f "$TARGET_ROOT/.claude/commands/resolve-next-owner.md" ] || warn "missing .claude/commands/resolve-next-owner.md"
  [ -f "$TARGET_ROOT/.claude/commands/score-cell-health.md" ] || warn "missing .claude/commands/score-cell-health.md"
  [ -f "$TARGET_ROOT/.claude/commands/score-dual-brain-health.md" ] || warn "missing .claude/commands/score-dual-brain-health.md"
  [ -f "$TARGET_ROOT/.claude/commands/choose-brain-topology.md" ] || warn "missing .claude/commands/choose-brain-topology.md"
  [ -f "$TARGET_ROOT/.claude/commands/assess-head-decision.md" ] || warn "missing .claude/commands/assess-head-decision.md"
  [ -f "$TARGET_ROOT/.claude/commands/audit-super-review.md" ] || warn "missing .claude/commands/audit-super-review.md"
  [ -f "$TARGET_ROOT/.claude/commands/closeout-from-execution.md" ] || warn "missing .claude/commands/closeout-from-execution.md"
  [ -f "$TARGET_ROOT/.claude/commands/convert-completion-to-closeout.md" ] || warn "missing .claude/commands/convert-completion-to-closeout.md"
  [ -f "$TARGET_ROOT/.claude/commands/resolve-budget-routing.md" ] || warn "missing .claude/commands/resolve-budget-routing.md"
  [ -f "$TARGET_ROOT/.claude/commands/log-turn-outcome.md" ] || warn "missing .claude/commands/log-turn-outcome.md"
  [ -f "$TARGET_ROOT/.claude/commands/assess-observability.md" ] || warn "missing .claude/commands/assess-observability.md"
  [ -f "$TARGET_ROOT/.claude/commands/doctor-sweep.md" ] || warn "missing .claude/commands/doctor-sweep.md"
  [ -f "$TARGET_ROOT/.claude/commands/detect-orphan-lanes.md" ] || warn "missing .claude/commands/detect-orphan-lanes.md"
  [ -f "$TARGET_ROOT/.claude/commands/score-lane-awareness.md" ] || warn "missing .claude/commands/score-lane-awareness.md"
  [ -f "$TARGET_ROOT/.claude/commands/log-frustration.md" ] || warn "missing .claude/commands/log-frustration.md"
  [ -f "$TARGET_ROOT/.claude/commands/resolve-frustration.md" ] || warn "missing .claude/commands/resolve-frustration.md"
  [ -f "$TARGET_ROOT/.claude/commands/refresh-doctor-dashboard.md" ] || warn "missing .claude/commands/refresh-doctor-dashboard.md"
  [ -f "$TARGET_ROOT/.claude/commands/checkpoint-now.md" ] || warn "missing .claude/commands/checkpoint-now.md"
  [ -f "$TARGET_ROOT/.claude/commands/read-mailbox.md" ] || warn "missing .claude/commands/read-mailbox.md"
  [ -f "$TARGET_ROOT/.claude/commands/send-runtime-mail.md" ] || warn "missing .claude/commands/send-runtime-mail.md"
  [ -f "$TARGET_ROOT/.claude/commands/absorb-completions.md" ] || warn "missing .claude/commands/absorb-completions.md"
  [ -f "$TARGET_ROOT/.claude/commands/synthesize-fan-in.md" ] || warn "missing .claude/commands/synthesize-fan-in.md"
  [ -f "$TARGET_ROOT/.claude/commands/handoff-lane.md" ] || warn "missing .claude/commands/handoff-lane.md"
  [ -f "$TARGET_ROOT/.claude/commands/draft-pickup-trigger.md" ] || warn "missing .claude/commands/draft-pickup-trigger.md"
  [ -f "$TARGET_ROOT/.claude/commands/audit-continuity.md" ] || warn "missing .claude/commands/audit-continuity.md"
  [ -f "$TARGET_ROOT/.claude/commands/classify-finding.md" ] || warn "missing .claude/commands/classify-finding.md"
  [ -f "$TARGET_ROOT/.claude/commands/promote-finding.md" ] || warn "missing .claude/commands/promote-finding.md"
  [ -f "$TARGET_ROOT/.claude/commands/verify-propagation.md" ] || warn "missing .claude/commands/verify-propagation.md"
  [ -f "$TARGET_ROOT/.claude/commands/release-audit.md" ] || warn "missing .claude/commands/release-audit.md"
  [ -f "$TARGET_ROOT/.claude/rules/00-hot-path.md" ] || warn "missing .claude/rules/00-hot-path.md"
  [ -f "$TARGET_ROOT/.claude/rules/10-continuity.md" ] || warn "missing .claude/rules/10-continuity.md"
  [ -f "$TARGET_ROOT/.claude/rules/20-collaboration.md" ] || warn "missing .claude/rules/20-collaboration.md"
  [ -f "$TARGET_ROOT/.claude/rules/30-health.md" ] || warn "missing .claude/rules/30-health.md"
  [ -f "$TARGET_ROOT/.claude/rules/35-review-topology.md" ] || warn "missing .claude/rules/35-review-topology.md"
  [ -f "$TARGET_ROOT/.claude/rules/40-review-state.md" ] || warn "missing .claude/rules/40-review-state.md"
  [ -f "$TARGET_ROOT/.claude/rules/45-observability.md" ] || warn "missing .claude/rules/45-observability.md"
  [ -f "$TARGET_ROOT/.claude/rules/50-lane-awareness.md" ] || warn "missing .claude/rules/50-lane-awareness.md"
  [ -f "$TARGET_ROOT/.claude/rules/55-top-chain.md" ] || warn "missing .claude/rules/55-top-chain.md"
  [ -f "$TARGET_ROOT/.claude/rules/60-budget-routing.md" ] || warn "missing .claude/rules/60-budget-routing.md"

  manager_launcher="$TARGET_ROOT/_agent-system/START-""MANAGER.md"
  manager_agent="$TARGET_ROOT/.claude/agents/man""ager.md"
  [ -f "$manager_launcher" ] || warn "missing manager launcher"
  [ -f "$manager_agent" ] || warn "missing manager Claude agent definition"

  check_live_vendor_files "$TARGET_ROOT/_agent-system/slices" "README.md TEMPLATE.md"
  check_live_vendor_files "$TARGET_ROOT/_agent-system/reviews" "README.md TEMPLATE.md"
  check_live_vendor_files "$TARGET_ROOT/_agent-system/checkpoints" "README.md TEMPLATE.md"
  check_live_vendor_files "$TARGET_ROOT/_agent-system/logs" "TEMPLATE.md"
  check_active_map_health "$TARGET_ROOT/_agent-system/ACTIVE-CHAT-MAP.md"
  check_checkpoint_continuity_health "$TARGET_ROOT/_agent-system-runtime/checkpoints" "$TARGET_ROOT/_agent-system-runtime/closeouts"
  check_closeout_continuity_health "$TARGET_ROOT/_agent-system-runtime/closeouts"
  check_lane_capsule_inbox_health "$TARGET_ROOT/_agent-system-runtime/lanes"
  check_naming_schema_health "$TARGET_ROOT/_agent-system" "$TARGET_ROOT/.claude/agents"
  active_workstreams_flat="$(tr '\n' ' ' < "$TARGET_ROOT/_agent-system-runtime/ACTIVE-WORKSTREAMS.md")"
  if printf '%s' "$active_workstreams_flat" | grep -Eq 'chunk:' &&
     printf '%s' "$active_workstreams_flat" | grep -Eq 'review[[:space:]]+state:' &&
     printf '%s' "$active_workstreams_flat" | grep -Eq 'recommendation[[:space:]]+state:' &&
     printf '%s' "$active_workstreams_flat" | grep -Eq 'next[[:space:]]+owner:'; then
    pass "active workstreams carries progression and review-state shape: $TARGET_ROOT/_agent-system-runtime/ACTIVE-WORKSTREAMS.md"
  else
    warn "active workstreams missing progression or review-state shape: $TARGET_ROOT/_agent-system-runtime/ACTIVE-WORKSTREAMS.md"
  fi
  if grep -Fq '"chunk"' "$TARGET_ROOT/_agent-system-runtime/health/workstreams.json" &&
     grep -Fq '"reviewState"' "$TARGET_ROOT/_agent-system-runtime/health/workstreams.json" &&
     grep -Fq '"recommendationState"' "$TARGET_ROOT/_agent-system-runtime/health/workstreams.json" &&
     grep -Fq '"nextOwner"' "$TARGET_ROOT/_agent-system-runtime/health/workstreams.json" &&
     grep -Fq '"buyerSteerRequired"' "$TARGET_ROOT/_agent-system-runtime/health/workstreams.json"; then
    pass "health workstreams carries progression and review-state shape: $TARGET_ROOT/_agent-system-runtime/health/workstreams.json"
  else
    warn "health workstreams missing progression or review-state shape: $TARGET_ROOT/_agent-system-runtime/health/workstreams.json"
  fi
  if grep -Fq '"reviewStateDiscipline"' "$TARGET_ROOT/_agent-system-runtime/health/summary.json" &&
     grep -Fq '"recommendationClarity"' "$TARGET_ROOT/_agent-system-runtime/health/summary.json" &&
     grep -Fq '"observability"' "$TARGET_ROOT/_agent-system-runtime/health/summary.json" &&
     grep -Fq '"topChainQuality"' "$TARGET_ROOT/_agent-system-runtime/health/summary.json" &&
     grep -Fq '"budgetRouting"' "$TARGET_ROOT/_agent-system-runtime/health/summary.json" &&
     grep -Fq '"closeoutTransitionQuality"' "$TARGET_ROOT/_agent-system-runtime/health/summary.json"; then
    pass "health summary carries review-state discipline shape: $TARGET_ROOT/_agent-system-runtime/health/summary.json"
  else
    warn "health summary missing review-state discipline shape: $TARGET_ROOT/_agent-system-runtime/health/summary.json"
  fi
  if grep -Fq '"coverageStatus"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"topFailurePatterns"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"recommendedNextMove"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"frustrationHandling"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"frustrationResolution"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"bridgeDiscipline"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"topChainQuality"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"budgetRoutingClarity"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"closeoutTransitionQuality"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"laneAwarenessQuality"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"heartbeatFreshness"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"unresolvedIssueDiscipline"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"doctorSweepFreshness"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"selfCorrectionDiscipline"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"mailboxCoverage"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"mailAbsorptionDiscipline"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"fanInSynthesisQuality"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json" &&
     grep -Fq '"buyerRelayAvoidance"' "$TARGET_ROOT/_agent-system-runtime/observability/metrics.json"; then
    pass "observability metrics carries expected shape: $TARGET_ROOT/_agent-system-runtime/observability/metrics.json"
  else
    warn "observability metrics missing expected shape: $TARGET_ROOT/_agent-system-runtime/observability/metrics.json"
  fi
  if grep -Fq '"eventId"' "$TARGET_ROOT/_agent-system-runtime/observability/turn-events.jsonl" &&
     grep -Fq '"deliveryMode"' "$TARGET_ROOT/_agent-system-runtime/observability/turn-events.jsonl" &&
     grep -Fq '"nextOwner"' "$TARGET_ROOT/_agent-system-runtime/observability/turn-events.jsonl" &&
     grep -Fq '"bridgeProvided"' "$TARGET_ROOT/_agent-system-runtime/observability/turn-events.jsonl" &&
     grep -Fq '"userFrustration"' "$TARGET_ROOT/_agent-system-runtime/observability/turn-events.jsonl" &&
     grep -Fq '"frustrationResolved"' "$TARGET_ROOT/_agent-system-runtime/observability/turn-events.jsonl" &&
     grep -Fq '"identityResolved"' "$TARGET_ROOT/_agent-system-runtime/observability/turn-events.jsonl" &&
     grep -Fq '"selfCorrectionTriggered"' "$TARGET_ROOT/_agent-system-runtime/observability/turn-events.jsonl" &&
     grep -Fq '"selfCorrectionApplied"' "$TARGET_ROOT/_agent-system-runtime/observability/turn-events.jsonl"; then
    pass "turn-event log carries expected shape: $TARGET_ROOT/_agent-system-runtime/observability/turn-events.jsonl"
  else
    warn "turn-event log missing expected shape: $TARGET_ROOT/_agent-system-runtime/observability/turn-events.jsonl"
  fi
else
  pass "no _agent-system/ vendor layer found; lightweight install shape detected"
  [ -d "$TARGET_ROOT/_agent-system-local" ] && pass "_agent-system-local/ found" || warn "no _agent-system-local/ found"
  [ -d "$TARGET_ROOT/_agent-system-runtime" ] && pass "_agent-system-runtime/ found" || warn "no _agent-system-runtime/ found"
fi

echo
echo "STATUS"
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "  - red: fix the FAIL items before trusting the install"
elif [ "$WARN_COUNT" -gt 0 ]; then
  echo "  - yellow: usable, but clean up the WARN items soon"
else
  echo "  - green: install shape looks healthy"
fi

echo
echo "NEXT"
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "  - Fix the FAIL items, then rerun the doctor."
elif [ "$ORCHESTRATION_INSTALL" -eq 1 ]; then
  echo "  - Read FIRST-WEEK-PLAYBOOK.md for healthy usage signals."
  echo "  - Then read orchestration/QUICK-START.md and do one real workstream before adding more system."
else
  echo "  - Read FIRST-WEEK-PLAYBOOK.md for healthy usage signals."
  echo "  - Then read START-HERE.md and do one real task before adding more structure."
fi

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
