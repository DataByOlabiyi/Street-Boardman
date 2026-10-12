# Failure drills

Break one part of the system under real load, let it recover, then prove no money was lost, created or paid twice. Run before a release that touches money paths, and after infrastructure changes.

```bash
loadtest/drills/run-drills.sh            # all three, ~30 min
loadtest/drills/run-drills.sh worker     # or one: worker | postgres | api
```

Each drill runs on a fresh, throwaway compose project (`sbdrills`), so your normal local stack and its data are untouched. Logs go to `loadtest/results/drills-<timestamp>.log`.

## What "passed" means

After each drill, `scripts/verify-money.js` checks the database. Every check must report 0 violations:

| Check | Meaning |
|---|---|
| `walletMatchesLedger` | Every wallet's balance equals its double-entry ledger account |
| `noNegativeWallets` | No wallet below zero |
| `ledgerGroupsBalance` | Every ledger posting nets to zero |
| `everyBetStakedOnce` | Each bet took its stake exactly once |
| `winnersPaidOnce` | Each winning bet paid exactly once; nobody else paid |
| `refundsOnce` | Each refunded bet refunded exactly once |
| `optionTotalsMatchBets` | Sharded option totals equal the bets placed |
| `settledEscrowEmpty` | A settled competition's escrow holds nothing |
| `noStuckPayouts` | No competition left half-way through a payout |

The checker also runs on its own against any database (`docker compose run --rm migrate node scripts/verify-money.js`), for example after a restore drill.

## The drills

| Drill | What it does |
|---|---|
| **worker** | 300 bettors place 1,500 bets on one match; the moment its payout starts, the worker is killed, then restarted 15 s later. |
| **postgres** | 100 bettors bet for 90 s; 75 s in, Postgres is restarted. |
| **api** | 100 bettors bet for 90 s; 75 s in, the API is killed and started again 10 s later. |

## Results, 2026-10-12 (local Docker, one laptop)

| Drill | Outcome | Money checks |
|---|---|---|
| worker | Killed with 23 of 750 winners paid. After the restart the payout resumed and finished: 750 won, 750 lost, competition `COMPLETED`. | **All 0** (4,569 bets, 325 wallets) |
| postgres | 18 bets failed during the restart (0.42%); the API reconnected by itself without a restart. | **All 0** (4,237 bets) |
| api | 114 bets failed while the API was down (3%), as expected. | **All 0** (3,623 bets) |

**Finding, fixed:** in the api drill the database held one more bet (3,623) than bettors were told succeeded (3,622). A bet committed just as the API died, so the bettor saw an error even though their money was taken; tapping again would have bet twice. `POST /api/bets` now takes an `Idempotency-Key` header: a retry with the same key returns the original bet (200) instead of placing another. The client should generate one key per bet slip and reuse it on retries.

**Finding, fixed in the drill runner:** a k6 container left over from one drill kept the network alive and made the next drill's setup fail silently. The runner now removes orphans and says when setup fails.

## If a check fails

Treat it as an incident. The check's name says what kind of damage to look for; the queries are in `scripts/verify-money.js`. Don't edit balances by hand: corrections go through a maker-checker adjustment (`POST /api/admin/adjustments`), so they're on the ledger and the audit trail.
