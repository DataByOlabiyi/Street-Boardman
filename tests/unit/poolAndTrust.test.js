// Pool view (FEAT-036/038) and the trust score formula (FEAT-048).
jest.mock('../../server/config/db', () => ({}));
const { poolView } = require('../../server/services/poolService');
const { scoreFrom } = require('../../server/services/boardmanTrustService');

const competition = (stakes) => ({
  boardmanCommissionRate: 0.05,
  platformCommissionRate: 0.03,
  betOptions: stakes.map((s, i) => ({ id: `o${i}`, label: `Option ${i}`, totalStaked: s })),
});

describe('poolView', () => {
  it('estimates the return on ₦100 per option from the pool minus commission', () => {
    const view = poolView(competition([60000, 40000]), { o0: 3, o1: 2 });
    expect(view.totalPool).toBe('100000.00');
    // 92,000 distributable: 92,000 × 100 / 60,000 and / 40,000.
    expect(view.options.map((o) => o.payoutPer100)).toEqual(['153.33', '230.00']);
    expect(view.options.map((o) => o.share)).toEqual([0.6, 0.4]);
    expect(view.options.map((o) => o.bets)).toEqual([3, 2]);
    expect(view.notices).toEqual([]);
  });

  it('says a one-sided pool would be refunded, and shows a ₦100 return', () => {
    const view = poolView(competition([5000, 0]));
    expect(view.options[0].payoutPer100).toBe('100.00');
    expect(view.options[1].payoutPer100).toBeNull();
    expect(view.notices.map((n) => n.code)).toEqual(['ONE_SIDED', 'UNBACKED_OPTION']);
  });

  it('flags an option nobody has backed', () => {
    const view = poolView(competition([5000, 3000, 0]));
    expect(view.options[2].payoutPer100).toBeNull();
    expect(view.notices.map((n) => n.code)).toEqual(['UNBACKED_OPTION']);
  });

  it('handles an empty pool', () => {
    const view = poolView(competition([0, 0]));
    expect(view.totalPool).toBe('0.00');
    expect(view.options.every((o) => o.payoutPer100 === null && o.share === 0)).toBe(true);
    expect(view.notices.map((n) => n.code)).toEqual(['EMPTY_POOL']);
  });
});

describe('trust score', () => {
  it('is null until five competitions have settled', () => {
    expect(scoreFrom({ completed: 4, overturned: 0, selfCancelled: 0 })).toBeNull();
    expect(scoreFrom({ completed: 5, overturned: 0, selfCancelled: 0 })).toBe(100);
  });

  it('weighs overturned results x3 and self-cancellations x0.5', () => {
    // 10 / (10 + 3 + 1) = 71%
    expect(scoreFrom({ completed: 10, overturned: 1, selfCancelled: 2 })).toBe(71);
    expect(scoreFrom({ completed: 4, overturned: 2, selfCancelled: 0 })).toBe(40);
  });
});
