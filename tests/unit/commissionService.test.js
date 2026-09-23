const { calculateCommission, calculateWinnerPayouts } = require('../../server/services/commissionService');

describe('commissionService.calculateCommission', () => {
  it('matches the worked example from the spec: 100,000 pool, 5% + 3%', () => {
    const result = calculateCommission(100000, 0.05, 0.03);
    expect(result.boardmanAmount.toString()).toBe('5000');
    expect(result.platformAmount.toString()).toBe('3000');
    expect(result.distributablePool.toString()).toBe('92000');
  });

  it('rounds to 2 decimal places', () => {
    const result = calculateCommission(999.99, 0.05, 0.03);
    expect(result.boardmanAmount.toString()).toBe('50');
    expect(result.platformAmount.toString()).toBe('30');
  });

  it('handles zero commission rates', () => {
    const result = calculateCommission(10000, 0, 0);
    expect(result.boardmanAmount.toString()).toBe('0');
    expect(result.platformAmount.toString()).toBe('0');
    expect(result.distributablePool.toString()).toBe('10000');
  });
});

describe('commissionService.calculateWinnerPayouts', () => {
  it('splits the pool proportionally to each winning bet stake', () => {
    const winningBets = [
      { id: 'bet1', stake: 5000 },
      { id: 'bet2', stake: 15000 },
    ];
    const payouts = calculateWinnerPayouts(winningBets, 20000, 92000);
    const byId = Object.fromEntries(payouts.map((p) => [p.betId, p.amount.toString()]));
    expect(byId.bet1).toBe('23000'); // (5000/20000) * 92000
    expect(byId.bet2).toBe('69000'); // (15000/20000) * 92000
  });

  it('returns no payouts when nobody bet on the winning option', () => {
    const payouts = calculateWinnerPayouts([], 0, 92000);
    expect(payouts).toEqual([]);
  });
});
