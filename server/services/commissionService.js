const { toDecimal, round2 } = require('../utils/money');

// Given everything staked on a competition (every option combined), works
// out the Boardman's cut, the Platform's cut, and what's left to share
// among winners. Commission is taken off the TOP of the whole pool, not
// just the winning side — this is what funds the payout even when the
// favourite loses.
function calculateCommission(totalStakePool, boardmanRate, platformRate) {
  const pool = round2(toDecimal(totalStakePool));
  const boardmanAmount = round2(pool.times(boardmanRate));
  const platformAmount = round2(pool.times(platformRate));
  const distributablePool = round2(pool.minus(boardmanAmount).minus(platformAmount));
  return { totalStakePool: pool, boardmanAmount, platformAmount, distributablePool };
}

// Pari-mutuel split: each winning bet gets a share of the distributable
// pool proportional to its share of everything staked on the winning
// option. Example: distributablePool = 92,000, winning option total =
// 40,000, a bet of 5,000 on that option gets (5000/40000) * 92000 = 11,500.
function calculateWinnerPayouts(winningBets, winningOptionTotalStaked, distributablePool) {
  const optionTotal = toDecimal(winningOptionTotalStaked);
  if (optionTotal.lte(0)) return [];
  return winningBets.map((bet) => {
    const share = toDecimal(bet.stake).dividedBy(optionTotal);
    const amount = round2(toDecimal(distributablePool).times(share));
    return { betId: bet.id, amount };
  });
}

module.exports = { calculateCommission, calculateWinnerPayouts };
