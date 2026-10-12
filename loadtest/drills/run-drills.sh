#!/usr/bin/env bash
# Failure drills (FEAT-054): break one component under real load, let the
# system recover, then check every money invariant with
# scripts/verify-money.js. Each drill runs on a fresh, throwaway compose
# project, so it never touches your normal local stack or its data.
#
#   loadtest/drills/run-drills.sh            # all drills
#   loadtest/drills/run-drills.sh worker     # one: worker | postgres | api
#
# Needs Docker. Takes ~30 minutes for all three. Output also goes to
# loadtest/results/drills-<timestamp>.log (gitignored).
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
export MSYS_NO_PATHCONV=1 # Git Bash: keep container paths like /scripts as-is

P="${DRILL_PROJECT:-sbdrills}"
LOG="loadtest/results/drills-$(date +%Y%m%d-%H%M%S).log"
mkdir -p loadtest/results
exec > >(tee -a "$LOG") 2>&1

dc() { docker compose -p "$P" "$@"; }
sql() { dc exec -T postgres psql -U postgres -d streetboardman -Atc "$1"; }
say() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

wait_healthy() {
  for _ in $(seq 1 100); do
    [ "$(dc ps api --format '{{.Health}}' 2>/dev/null)" = healthy ] && return 0
    sleep 3
  done
  say "API never became healthy"; return 1
}

# --remove-orphans: a k6 container left from the previous drill kept the
# network alive and made the next drill's setup fail silently.
fresh_stack() {
  dc down -v --remove-orphans >/dev/null 2>&1
  dc up -d --build >/dev/null 2>&1 || { say "stack failed to start"; return 1; }
  wait_healthy || return 1
  dc run --rm migrate npx prisma db seed >/dev/null 2>&1 || { say "seed failed"; return 1; }
}

verify() {
  say "verify-money:"
  dc run --rm migrate node scripts/verify-money.js
}

# Wait until no competition is mid-payout (the worker's retry sweep runs
# every minute), up to $1 seconds.
wait_payouts_settled() {
  for _ in $(seq 1 "$(( $1 / 5 ))"); do
    [ "$(sql "SELECT COUNT(*) FROM \"Competition\" WHERE status = 'PAYOUT_PROCESSING'")" = 0 ] && return 0
    sleep 5
  done
  return 1
}

drill_worker() {
  say "DRILL worker: kill the worker in the middle of a large payout"
  fresh_stack || { say "DRILL worker: SETUP FAILED"; return 1; }
  dc run --rm -e BETTORS=300 -e BETS_EACH=5 -e BACKGROUND_USERS=20 -e BACKGROUND_DURATION=8m \
    k6 run --quiet /scripts/mass-payout.js > "$LOG.k6-worker" 2>&1 &
  local k6pid=$!
  local hit=0
  for _ in $(seq 1 2400); do # poll every 0.5 s for up to 20 min
    if [ "$(sql "SELECT COUNT(*) FROM \"Competition\" WHERE status = 'PAYOUT_PROCESSING'")" != 0 ]; then
      hit=1; break
    fi
    sleep 0.5
  done
  if [ "$hit" = 1 ]; then
    local paid
    paid=$(sql "SELECT COUNT(*) FROM \"Bet\" WHERE status = 'WON'")
    say "payout in progress (${paid} bets paid so far): killing the worker"
    dc kill worker >/dev/null
    sleep 15
    say "restarting the worker"
    dc start worker >/dev/null
  else
    say "missed the payout window: drill inconclusive"
  fi
  wait "$k6pid"
  if wait_payouts_settled 300; then say "payout finished after the restart"; else say "payout STILL stuck after 5 min"; fi
  sql "SELECT status, COUNT(*) FROM \"Competition\" GROUP BY 1 ORDER BY 1"
  grep -E "payout_|bets settled|✗" "$LOG.k6-worker" | head -8
  verify
}

drill_under_bets() { # $1: service to break, $2: how
  say "DRILL $1: $2 $1 while 100 bettors are betting"
  fresh_stack || { say "DRILL $1: SETUP FAILED"; return 1; }
  dc run --rm -e BETTORS=100 -e HOLD=90s k6 run /scripts/hot-competition.js > "$LOG.k6-$1" 2>&1 &
  local k6pid=$!
  sleep 75
  if [ "$2" = restart ]; then
    say "restarting $1"; dc restart "$1" >/dev/null
  else
    say "killing $1"; dc kill "$1" >/dev/null; sleep 10; say "starting $1"; dc start "$1" >/dev/null
  fi
  wait "$k6pid"
  wait_healthy && say "API healthy again"
  grep -A5 "^Hot competition" "$LOG.k6-$1"
  verify
}

run() {
  case "$1" in
    worker) drill_worker ;;
    postgres) drill_under_bets postgres restart ;;
    api) drill_under_bets api kill ;;
    *) echo "unknown drill: $1"; return 1 ;;
  esac
}

DRILLS=("${@:-worker postgres api}")
# shellcheck disable=SC2068
for d in ${DRILLS[@]}; do run "$d"; done
dc down -v >/dev/null 2>&1
say "done; log: $LOG"
