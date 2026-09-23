# StreetBoardman — Boardman / Operator Manual

## 1. How to Become a Boardman

1. On the welcome screen, tap **BECOME A BOARDMAN**.
2. Fill in your full name, phone number, a PIN, and your location.
3. Optionally attach KYC information (an ID or business document URL) —
   this speeds up approval and is required before you can handle
   real-money competitions later.
4. Submit. Your account is created with status **PENDING_APPROVAL**.

## 2. Account Approval

You cannot create real competitions until a Platform Admin approves your
account. This exists to keep the platform trustworthy — anyone browsing
competitions should be able to trust that every Boardman has been vetted.
You'll see your current status (`PENDING_APPROVAL`, `APPROVED`,
`REJECTED`, or `SUSPENDED`) on your Profile page.

## 3. Your Dashboard

Once approved, your dashboard shows:
- Your commission wallet balance
- Your recent competitions and their status
- Quick links to create a competition or manage existing ones

## 4. Creating a Competition

1. Tap **+ Create Competition**.
2. Fill in:
   - **Title** — e.g. "Tunde vs Seyi"
   - **Category** — Football, Snooker, Fight, Table Game, or Other
   - **Participants** — the two (or more) sides
   - **Betting deadline** — when betting closes, which should be before
     the real event starts
3. Tap **Create Competition**.

The app automatically creates the betting options ("Tunde wins" / "Seyi
wins") and applies your current commission rate — this rate is locked to
the competition at creation time, so changes to platform-wide settings
later never affect a competition you've already created.

## 5. Adding Participants & Betting Options

For the MVP, betting options are generated directly from the two
participants you name (e.g. "X wins" / "Y wins"). More complex option sets
(draws, multiple outcomes) are a natural next step once this pattern is
proven.

## 6. Setting Betting Deadlines

Choose a deadline that gives Betters enough time to place bets but closes
before the real-world event starts — this protects the integrity of the
book. If you forget to close betting manually, the system automatically
closes it once the deadline passes.

## 7. Monitoring Bets

Open a competition from **Active Competitions** to see:
- Total amount staked so far
- Every individual bet, who placed it, and which option they chose

## 8. Closing Betting

From the competition's management screen, tap **Close Betting** any time
before or exactly at the deadline. After this, no new bets are accepted.

## 9. Conducting the Local Competition

This part happens in real life — StreetBoardman does not (and cannot)
determine a winner automatically. Referee the match/game as you normally
would.

## 10. Submitting Results

Once betting is closed and the real event has finished:
1. Open the competition.
2. Select the winning option.
3. Optionally add the final score and notes.
4. (Recommended) Attach photo/video evidence — this protects you if the
   result is later disputed.
5. Tap **Submit Result**.

The result enters **PENDING_CONFIRMATION**. If nobody disputes it within
the confirmation window (set by the Admin — a couple of hours by default),
it's automatically confirmed and payouts are processed — you don't have to
do anything else.

## 11. Uploading Evidence

Evidence (photos, videos, or notes) is optional but strongly recommended
for any competition with meaningful stakes. It's the single best defense
you have if a Better disputes your result later.

## 12. Handling Disputes

If a Better (or you) flags a problem during the confirmation window, the
competition moves to **DISPUTED** and all payouts freeze — **you cannot
confirm your own disputed result.** A Platform Admin reviews the evidence
from both sides and either confirms the result (payouts proceed) or
cancels the competition (everyone gets their stake back, no commission is
taken).

## 13. Understanding Commission

You earn a commission on the **total amount staked** on a competition —
not just from the losing side. Example, matching the platform default
rates:

```
Total bets on "Tunde vs Seyi": ₦100,000
Your commission (5%):          ₦5,000
Platform commission (3%):      ₦3,000
Remaining pool for winners:    ₦92,000
```

Winners split the ₦92,000 in proportion to how much each of them staked on
the winning side.

## 14. Viewing Revenue

**Revenue & Commission** shows every commission payment you've earned,
with running totals, so you always know exactly what the platform has paid
you and why.

## 15. Withdrawals

From **Wallet → Withdraw**, request a payout of your commission earnings
to your bank account. The amount is held immediately; it's marked
processed once the transfer actually happens.

## 16. Competition Cancellation & Refund Procedures

If a competition needs to be cancelled (e.g. the real event never
happened), an Admin can cancel it. Every open bet is refunded in full and
**no commission is taken** on a cancelled competition — you only earn
commission on competitions that actually complete.

## 17. Responsible Operation

- Only submit a result you personally witnessed or have solid evidence
  for.
- Set betting deadlines that genuinely close before the real event starts.
- Never accept side payments outside the app to influence outcomes — that
  defeats the entire purpose of moving this online.
- Treat every Better fairly; your reputation on the platform depends on
  the accuracy and honesty of the results you submit.

## 18. What Boardmen Are NOT Allowed to Do

- You cannot change platform or your own commission rate — only Admin
  configures this.
- You cannot manage or edit another Boardman's competitions.
- You cannot access platform administration screens.
- You cannot manually alter any wallet balance, including your own.
- You cannot confirm your own disputed result — that's Admin-only, by
  design, so a Boardman can never be the final word on a contested result.

## 19. Common Problems and Solutions

**"I can't create a competition."**
Check your Profile — your account is probably still `PENDING_APPROVAL`.
Contact the Platform Admin if it's been pending a long time.

**"A Better says they never got paid."**
Check the competition's result status. If it's `DISPUTED`, payouts are
frozen until Admin resolves it. If it's `COMPLETED`, ask the Better to
check their Wallet → Transaction History for the `BET_WIN` entry — the
ledger always has the full trail.

**"I submitted the wrong result."**
Contact the Admin immediately, ideally before the confirmation window
elapses — raising a dispute yourself is one way to freeze payouts while it
gets sorted out.

**"Betting closed before I could submit results."**
That's expected — closing betting and submitting results are separate
steps. Once betting is closed, go to the competition and submit the
result whenever the real event is finished.
