// Idempotency-Key on bet placement. The API failure drill (FEAT-054) found
// a bet committed while the API died: the bettor saw an error although
// their money was taken, so tapping again would bet twice.
const request = require('supertest');
const app = require('../../server/app');
const { resetDatabase, prisma } = require('../helpers/reset');
const { resetAuthLimiter, approvedBoardman, fundedBetter, openCompetition, balanceOf } = require('../helpers/fixtures');

beforeEach(async () => {
  await resetDatabase();
  await resetAuthLimiter();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const bm = await approvedBoardman();
  const competition = await openCompetition(bm);
  const b = await fundedBetter(10000);
  const bet = (key, body = { betOptionId: competition.betOptions[0].id, stake: 1000 }) => {
    const req = b.agent.post('/api/bets');
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };
  return { bm, competition, b, bet };
}

describe('Placing a bet with an Idempotency-Key', () => {
  it('returns the original bet on a retry and charges once', async () => {
    const { b, bet } = await setup();
    const first = await bet('slip-0001-abcd');
    const retry = await bet('slip-0001-abcd');

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.bet.id).toBe(first.body.bet.id);
    expect(retry.body.bet.betCode).toBe(first.body.bet.betCode);
    expect(await prisma.bet.count()).toBe(1);
    expect(await balanceOf(b.userId)).toBe(9000);
  });

  it('places one bet when the same key arrives several times at once', async () => {
    const { b, bet } = await setup();
    const responses = await Promise.all(Array.from({ length: 5 }, () => bet('slip-race-0001')));

    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(responses.map((r) => r.body.bet.id)).size).toBe(1);
    expect(await prisma.bet.count()).toBe(1);
    expect(await balanceOf(b.userId)).toBe(9000);
  });

  it('refuses a key reused for a different bet, and checks the key format', async () => {
    const { competition, bet } = await setup();
    await bet('slip-0002-abcd');
    const changed = await bet('slip-0002-abcd', { betOptionId: competition.betOptions[0].id, stake: 2000 });
    expect(changed.status).toBe(409);
    expect((await bet('short')).status).toBe(422);
    expect((await bet('has spaces in it!')).status).toBe(422);
  });

  it('treats different keys, different bettors and no key as separate bets', async () => {
    const { competition, b, bet } = await setup();
    await bet('slip-a-000001');
    await bet('slip-b-000001');
    await bet(undefined);
    await bet(undefined);

    const other = await fundedBetter(5000);
    const theirs = await other.agent.post('/api/bets').set('Idempotency-Key', 'slip-a-000001')
      .send({ betOptionId: competition.betOptions[0].id, stake: 1000 });
    expect(theirs.status).toBe(201);
    expect(await prisma.bet.count()).toBe(5);
    expect(await balanceOf(b.userId)).toBe(6000);
  });

  it('still returns the original bet if the retry comes after betting closed', async () => {
    const { bm, competition, bet } = await setup();
    const first = await bet('slip-late-0001');
    await bm.agent.patch(`/api/competitions/${competition.id}/close-betting`);
    const retry = await bet('slip-late-0001');
    expect(retry.status).toBe(200);
    expect(retry.body.bet.id).toBe(first.body.bet.id);
    expect((await request(app).get('/health')).status).toBe(200);
  });
});
