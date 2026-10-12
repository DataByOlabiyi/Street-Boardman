// Notifications through an outbox, sent by SMS via Termii (FEAT-041).
// axios is mocked so nothing leaves the machine; the post mock stands in
// for Termii.
jest.mock('axios', () => {
  const post = jest.fn();
  return { create: () => ({ post, request: jest.fn() }), __termiiPost: post };
});

const axios = require('axios');
const env = require('../../server/config/env');
const { resetDatabase, prisma } = require('../helpers/reset');
const { resetAuthLimiter, approvedBoardman, fundedBetter, openCompetition, staffAgent } = require('../helpers/fixtures');
const resultService = require('../../server/services/resultService');
const payoutService = require('../../server/services/payoutService');
const notificationService = require('../../server/services/notificationService');
const smsProvider = require('../../server/services/smsProvider');

const termiiPost = axios.__termiiPost;
let original;

beforeAll(() => {
  original = { ...env.termii, appMode: env.appMode };
});

beforeEach(async () => {
  await resetDatabase();
  await resetAuthLimiter();
  termiiPost.mockReset();
  env.termii.apiKey = '';
  env.appMode = 'DEMO';
});

afterAll(async () => {
  Object.assign(env.termii, { apiKey: original.apiKey, senderId: original.senderId, baseUrl: original.baseUrl });
  env.appMode = original.appMode;
  await prisma.$disconnect();
});

async function settle(winnerStake = 3000, loserStake = 2000) {
  const bm = await approvedBoardman();
  const competition = await openCompetition(bm, 'Tunde vs Seyi');
  const winner = await fundedBetter(10000);
  const loser = await fundedBetter(10000);
  await winner.agent.post('/api/bets').send({ betOptionId: competition.betOptions[0].id, stake: winnerStake });
  await loser.agent.post('/api/bets').send({ betOptionId: competition.betOptions[1].id, stake: loserStake });
  await bm.agent.patch(`/api/competitions/${competition.id}/close-betting`);
  const profile = await prisma.boardmanProfile.findUnique({ where: { id: bm.profileId } });
  await resultService.submitResult(profile, competition.id, { winningOptionId: competition.betOptions[0].id });
  await prisma.competition.update({ where: { id: competition.id }, data: { status: 'RESULT_CONFIRMED' } });
  await payoutService.processPayoutsForCompetition(competition.id);
  return { bm, competition, winner, loser };
}

describe('Notifications are written with the money movement (FEAT-041)', () => {
  it('tells a winner once, even if the payout runs again, and not the loser', async () => {
    const { competition, winner, loser } = await settle();
    await prisma.competition.update({ where: { id: competition.id }, data: { status: 'RESULT_CONFIRMED' } });
    await payoutService.processPayoutsForCompetition(competition.id); // a retry

    const forWinner = await prisma.notification.findMany({ where: { userId: winner.userId } });
    expect(forWinner).toHaveLength(1);
    expect(forWinner[0]).toMatchObject({ type: 'BET_WON', status: 'PENDING' });
    expect(forWinner[0].message).toMatch(/won N4,600 on "Tunde vs Seyi"/);
    expect(await prisma.notification.count({ where: { userId: loser.userId } })).toBe(0);
  });

  it('tells every bettor when a competition is cancelled', async () => {
    const bm = await approvedBoardman();
    const competition = await openCompetition(bm, 'Rained off');
    const a = await fundedBetter(5000);
    const b = await fundedBetter(5000);
    await a.agent.post('/api/bets').send({ betOptionId: competition.betOptions[0].id, stake: 1000 });
    await b.agent.post('/api/bets').send({ betOptionId: competition.betOptions[1].id, stake: 1500 });
    await bm.agent.post(`/api/competitions/${competition.id}/cancel`).send({ reason: 'Rain stopped play' });

    const all = await prisma.notification.findMany({ orderBy: { message: 'asc' } });
    expect(all.map((n) => n.type)).toEqual(['COMPETITION_CANCELLED', 'COMPETITION_CANCELLED']);
    expect(all.map((n) => n.message)).toEqual([
      expect.stringContaining('Your N1,000 stake is back'),
      expect.stringContaining('Your N1,500 stake is back'),
    ]);
  });

  it('tells a user their withdrawal was rejected, and nothing more if the reject is retried', async () => {
    const finance = await staffAgent('FINANCE');
    const b = await fundedBetter(5000);
    await prisma.user.update({ where: { id: b.userId }, data: { kycTier: 'TIER_1' } });
    const w = await b.agent.post('/api/withdrawals').send({
      amount: 1000, pin: '1234', destination: { bankName: 'GTBank', accountNumber: '0123456789', accountName: 'Ada' },
    });
    await finance.agent.patch(`/api/admin/withdrawals/${w.body.withdrawal.id}/reject`).send({ reason: 'Name mismatch' });
    const again = await finance.agent.patch(`/api/admin/withdrawals/${w.body.withdrawal.id}/reject`).send({ reason: 'Again' });
    expect(again.status).toBe(400);

    const notes = await prisma.notification.findMany({ where: { userId: b.userId } });
    expect(notes.map((n) => n.type)).toEqual(['WITHDRAWAL_REJECTED']);
  });
});

describe('Sending (Termii)', () => {
  it('sends pending messages through Termii in international format, then marks them sent', async () => {
    env.termii.apiKey = 'fake-termii-key';
    termiiPost.mockResolvedValue({ data: { message_id: 'm-1' } });
    const { winner } = await settle();
    const user = await prisma.user.findUnique({ where: { id: winner.userId } });

    expect(await notificationService.sendPending()).toEqual({ attempted: 1, sent: 1, failed: 0 });
    const [url, body] = termiiPost.mock.calls[0];
    expect(url).toBe('https://api.ng.termii.com/api/sms/send');
    expect(body).toMatchObject({ to: `234${user.phone.slice(1)}`, channel: 'generic', type: 'plain', from: env.termii.senderId });
    expect(body.sms).toMatch(/you won/);
    expect((await prisma.notification.findFirst()).status).toBe('SENT');
    expect(await notificationService.sendPending()).toEqual({ attempted: 0, sent: 0, failed: 0 });
  });

  it('retries a failing send and gives up after 5 attempts', async () => {
    env.termii.apiKey = 'fake-termii-key';
    termiiPost.mockRejectedValue(Object.assign(new Error('boom'), { response: { data: { message: 'Insufficient balance' } } }));
    await settle();

    for (let i = 0; i < notificationService.MAX_ATTEMPTS; i += 1) await notificationService.sendPending();
    const n = await prisma.notification.findFirst();
    expect(n).toMatchObject({ status: 'FAILED', attempts: 5 });
    expect(n.lastError).toMatch(/Insufficient balance/);
    expect(n.lastError).not.toMatch(/fake-termii-key/);
  });

  it('logs instead of sending in DEMO without a key, and refuses in PRODUCTION without one', async () => {
    await settle();
    expect((await notificationService.sendPending()).sent).toBe(1);
    expect(termiiPost).not.toHaveBeenCalled();

    env.appMode = 'PRODUCTION';
    await expect(smsProvider.sendSms('08031234567', 'hi')).rejects.toMatchObject({ statusCode: 501 });
  });

  it('sends OTPs on the DND route once a key is set', async () => {
    env.termii.apiKey = 'fake-termii-key';
    termiiPost.mockResolvedValue({ data: { message_id: 'm-2' } });
    await smsProvider.sendOtp('08031234567', '123456');
    expect(termiiPost.mock.calls[0][1]).toMatchObject({ to: '2348031234567', channel: 'dnd', sms: expect.stringContaining('123456') });
  });
});

describe('In-app inbox', () => {
  it('lists only your own notifications and marks them read', async () => {
    const { winner, loser } = await settle();

    const mine = await winner.agent.get('/api/notifications/me');
    expect(mine.status).toBe(200);
    expect(mine.body).toMatchObject({ unread: 1, notifications: [expect.objectContaining({ type: 'BET_WON', readAt: null })] });
    expect((await loser.agent.get('/api/notifications/me')).body).toEqual({ notifications: [], unread: 0 });

    expect((await winner.agent.patch('/api/notifications/me/read-all')).body).toEqual({ marked: 1 });
    expect((await winner.agent.get('/api/notifications/me')).body.unread).toBe(0);
  });
});
