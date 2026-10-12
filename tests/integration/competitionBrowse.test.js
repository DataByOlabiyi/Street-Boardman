// Public browse, live pool and Boardman track record (FEAT-036, FEAT-038,
// FEAT-043, FEAT-048).
const request = require('supertest');
const app = require('../../server/app');
const { resetDatabase, prisma } = require('../helpers/reset');
const { resetAuthLimiter, approvedBoardman, fundedBetter, openCompetition } = require('../helpers/fixtures');
const resultService = require('../../server/services/resultService');
const payoutService = require('../../server/services/payoutService');

beforeEach(async () => {
  await resetDatabase();
  await resetAuthLimiter();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function create(bm, overrides) {
  const res = await bm.agent.post('/api/competitions').send({
    title: 'Match',
    category: 'FOOTBALL',
    bettingDeadline: new Date(Date.now() + 3600000).toISOString(),
    options: ['Home', 'Away'],
    ...overrides,
  });
  return res.body.competition;
}

describe('Browsing open competitions (FEAT-043)', () => {
  it('searches title and participants, and filters by category, location and closing time', async () => {
    const lagos = await approvedBoardman();
    const ibadan = await approvedBoardman();
    await prisma.boardmanProfile.update({ where: { id: ibadan.profileId }, data: { businessLocation: 'Ibadan, Bodija' } });

    await create(lagos, { title: 'Tunde vs Seyi', participants: ['Tunde', 'Seyi'] });
    await create(lagos, { title: 'Snooker night', category: 'SNOOKER', bettingDeadline: new Date(Date.now() + 30 * 3600000).toISOString() });
    await create(ibadan, { title: 'Ludo final', category: 'TABLE_GAME', participants: ['Kemi', 'Ayo'] });

    const titles = async (qs) => (await request(app).get(`/api/competitions${qs}`)).body.competitions.map((c) => c.title).sort();
    expect(await titles('?q=seyi')).toEqual(['Tunde vs Seyi']);
    expect(await titles('?q=kemi')).toEqual(['Ludo final']);
    expect(await titles('?category=SNOOKER')).toEqual(['Snooker night']);
    expect(await titles('?location=bodija')).toEqual(['Ludo final']);
    expect(await titles('?closingWithinHours=2')).toEqual(['Ludo final', 'Tunde vs Seyi']);

    const page = await request(app).get('/api/competitions?pageSize=2&page=2');
    expect(page.body.page).toEqual({ page: 2, pageSize: 2, total: 3 });
    expect(page.body.competitions).toHaveLength(1);

    expect((await request(app).get('/api/competitions?sort=random')).status).toBe(422);
  });

  it('sorts by biggest pool and shows each Boardman as a public card', async () => {
    const bm = await approvedBoardman();
    const small = await create(bm, { title: 'Small' });
    const big = await create(bm, { title: 'Big' });
    const b = await fundedBetter(20000);
    await b.agent.post('/api/bets').send({ betOptionId: small.betOptions[0].id, stake: 1000 });
    await b.agent.post('/api/bets').send({ betOptionId: big.betOptions[0].id, stake: 9000 });

    const res = await request(app).get('/api/competitions?sort=pool');
    expect(res.body.competitions.map((c) => c.title)).toEqual(['Big', 'Small']);
    const card = res.body.competitions[0].boardman;
    expect(card).toEqual({ profileId: bm.profileId, name: 'Bola Boardman', location: 'Lagos', trustScore: null, completedCompetitions: 0 });
    expect(JSON.stringify(res.body)).not.toMatch(/phone|passwordHash|lastPayoutError/);
  });
});

describe('Live pool (FEAT-036, FEAT-038)', () => {
  it('estimates returns that match what the payout engine actually pays', async () => {
    const bm = await approvedBoardman();
    const competition = await openCompetition(bm);
    const [home, away] = competition.betOptions;
    const b1 = await fundedBetter(60000);
    const b2 = await fundedBetter(40000);
    await b1.agent.post('/api/bets').send({ betOptionId: home.id, stake: 60000 });
    await b2.agent.post('/api/bets').send({ betOptionId: away.id, stake: 40000 });

    const live = await request(app).get(`/api/competitions/${competition.id}/pool`);
    expect(live.status).toBe(200);
    expect(live.body.pool.totalPool).toBe('100000.00');
    const homeView = live.body.pool.options.find((o) => o.id === home.id);
    expect(homeView).toMatchObject({ bets: 1, share: 0.6, payoutPer100: '153.33' });

    await bm.agent.patch(`/api/competitions/${competition.id}/close-betting`);
    const profile = await prisma.boardmanProfile.findUnique({ where: { id: bm.profileId } });
    await resultService.submitResult(profile, competition.id, { winningOptionId: home.id });
    await prisma.competition.update({ where: { id: competition.id }, data: { status: 'RESULT_CONFIRMED' } });
    await payoutService.processPayoutsForCompetition(competition.id);

    const win = await prisma.walletTransaction.findFirst({ where: { type: 'BET_WIN' } });
    expect(((Number(win.amount) * 100) / 60000).toFixed(2)).toBe(homeView.payoutPer100);
  });

  it('warns while the pool is one-sided, and the detail endpoint carries the pool too', async () => {
    const bm = await approvedBoardman();
    const competition = await openCompetition(bm);
    const b = await fundedBetter(5000);
    await b.agent.post('/api/bets').send({ betOptionId: competition.betOptions[0].id, stake: 2000 });

    const detail = await request(app).get(`/api/competitions/${competition.id}`);
    expect(detail.body.competition.pool.notices.map((n) => n.code)).toEqual(['ONE_SIDED', 'UNBACKED_OPTION']);
    expect(detail.body.competition.boardman.name).toBe('Bola Boardman');
    expect(detail.body.competition.lastPayoutError).toBeUndefined();
    expect((await request(app).get('/api/competitions/nope/pool')).status).toBe(404);
  });
});

describe('Boardman public profile (FEAT-048)', () => {
  it('shows the track record and a trust score once five competitions have settled', async () => {
    const bm = await approvedBoardman();
    const base = { boardmanProfileId: bm.profileId, category: 'FOOTBALL', bettingDeadline: new Date(), boardmanCommissionRate: 0.05, platformCommissionRate: 0.03 };
    for (let i = 0; i < 9; i += 1) {
      await prisma.competition.create({ data: { ...base, title: `Done ${i}`, status: 'COMPLETED' } });
    }
    const overturned = await prisma.competition.create({ data: { ...base, title: 'Overturned', status: 'CANCELLED_REFUNDED' } });
    const b = await fundedBetter(100);
    await prisma.dispute.create({ data: { competitionId: overturned.id, raisedByUserId: b.userId, reason: 'Wrong winner', status: 'RESOLVED_CANCELLED' } });
    const called = await create(bm, { title: 'Called off' });
    await bm.agent.post(`/api/competitions/${called.id}/cancel`).send({ reason: 'Rain stopped play' });

    const res = await request(app).get(`/api/boardmen/${bm.profileId}/public`);
    expect(res.status).toBe(200);
    expect(res.body.boardman.track).toMatchObject({
      completedCompetitions: 9,
      disputedCompetitions: 1,
      resultsOverturned: 1,
      cancelledByBoardman: 1,
    });
    // 9 / (9 + 3 + 0.5) = 72%
    expect(res.body.boardman.trustScore).toBe(72);
    expect(JSON.stringify(res.body)).not.toMatch(/phone|passwordHash/);
  });

  it('is hidden for Boardmen who are not approved', async () => {
    const bm = await approvedBoardman();
    await prisma.boardmanProfile.update({ where: { id: bm.profileId }, data: { approvalStatus: 'SUSPENDED' } });
    expect((await request(app).get(`/api/boardmen/${bm.profileId}/public`)).status).toBe(404);
  });
});
