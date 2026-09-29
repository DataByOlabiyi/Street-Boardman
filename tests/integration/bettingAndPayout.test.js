const request = require('supertest');
const app = require('../../server/app');
const { resetDatabase, prisma } = require('../helpers/reset');
const adminService = require('../../server/services/adminService');
const resultService = require('../../server/services/resultService');
const payoutService = require('../../server/services/payoutService');
const depositService = require('../../server/services/depositService');

async function setupApprovedBoardman() {
  const admin = await prisma.user.create({
    data: { role: 'ADMIN', fullName: 'Admin', phone: '08000000001', passwordHash: 'x' },
  });
  await prisma.wallet.create({ data: { userId: admin.id, walletType: 'PLATFORM', balance: 0 } });

  const boardmanAgent = request.agent(app);
  const res = await boardmanAgent
    .post('/api/auth/register/boardman')
    .send({ fullName: 'Bola Boardman', phone: '08044444444', pin: '1234', businessLocation: 'Lagos' });
  const boardmanUserId = res.body.user.id;
  const profile = await prisma.boardmanProfile.findUnique({ where: { userId: boardmanUserId } });
  await adminService.approveBoardman(profile.id, admin.id);

  return { boardmanAgent, boardmanUserId, profileId: profile.id };
}

let betterPhoneCounter = 0;
async function setupFundedBetter(amount = 20000) {
  betterPhoneCounter += 1;
  const phone = `0805${String(betterPhoneCounter).padStart(7, '0')}`;
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register/better')
    .send({ fullName: 'Ada Better', phone, pin: '1234' });
  await agent.post('/api/deposits/demo').send({ amount });
  return { agent, userId: res.body.user.id };
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Wallet & deposits', () => {
  it('demo deposit credits the wallet exactly once', async () => {
    const { agent, userId } = await setupFundedBetter(5000);
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(Number(wallet.balance)).toBe(5000);
  });
});

describe('Full betting -> result -> payout flow', () => {
  it('runs the spec worked example end to end', async () => {
    const { boardmanAgent, profileId } = await setupApprovedBoardman();

    const createRes = await boardmanAgent.post('/api/competitions').send({
      title: 'Tunde vs Seyi',
      category: 'FOOTBALL',
      bettingDeadline: new Date(Date.now() + 3600000).toISOString(),
      options: ['Tunde wins', 'Seyi wins'],
    });
    expect(createRes.status).toBe(201);
    const competition = createRes.body.competition;
    const tundeOption = competition.betOptions.find((o) => o.label === 'Tunde wins');
    const seyiOption = competition.betOptions.find((o) => o.label === 'Seyi wins');

    // Two betters split 100,000 total: 60,000 on Tunde, 40,000 on Seyi.
    const better1 = await setupFundedBetter(60000);
    const better2 = await setupFundedBetter(40000);

    const bet1 = await better1.agent.post('/api/bets').send({ betOptionId: tundeOption.id, stake: 60000 });
    expect(bet1.status).toBe(201);
    const bet2 = await better2.agent.post('/api/bets').send({ betOptionId: seyiOption.id, stake: 40000 });
    expect(bet2.status).toBe(201);

    // Set commission rates on this competition to the spec example (5% / 3%)
    await prisma.competition.update({
      where: { id: competition.id },
      data: { boardmanCommissionRate: 0.05, platformCommissionRate: 0.03 },
    });

    await boardmanAgent.patch(`/api/competitions/${competition.id}/close-betting`);

    const resultRes = await boardmanAgent
      .post(`/api/competitions/${competition.id}/result`)
      .send({ winningOptionId: tundeOption.id, finalScore: '2-1', notes: 'Clean match' });
    expect(resultRes.status).toBe(201);

    // Simulate the confirmation window elapsing with no dispute, then run
    // the sweep that auto-confirms + pays out.
    await prisma.result.update({
      where: { competitionId: competition.id },
      data: { confirmationDeadline: new Date(Date.now() - 1000) },
    });
    const outcomes = await resultService.autoConfirmDueResults();
    expect(outcomes[0].skipped).toBe(false);

    const boardmanWallet = await prisma.wallet.findFirst({ where: { walletType: 'BOARDMAN' } });
    const platformWallet = await prisma.wallet.findFirst({ where: { walletType: 'PLATFORM' } });
    const winningBet = await prisma.bet.findUnique({ where: { id: bet1.body.bet.id } });

    // Commission is taken off the WHOLE pool (both sides combined: 60,000 +
    // 40,000 = 100,000), not just the winning side — matching the spec's
    // worked example exactly (see docs/ARCHITECTURE.md section 9).
    expect(Number(boardmanWallet.balance)).toBeCloseTo(5000, 2); // 5% of 100,000 total pool
    expect(Number(platformWallet.balance)).toBeCloseTo(3000, 2); // 3% of 100,000 total pool
    expect(winningBet.status).toBe('WON');

    const completed = await prisma.competition.findUnique({ where: { id: competition.id } });
    expect(completed.status).toBe('COMPLETED');
  });

  it('never pays out twice for the same competition (idempotency)', async () => {
    const { boardmanAgent } = await setupApprovedBoardman();
    const createRes = await boardmanAgent.post('/api/competitions').send({
      title: 'Idempotency Match',
      category: 'FOOTBALL',
      bettingDeadline: new Date(Date.now() + 3600000).toISOString(),
      options: ['A wins', 'B wins'],
    });
    const competition = createRes.body.competition;
    const optionA = competition.betOptions.find((o) => o.label === 'A wins');
    const optionB = competition.betOptions.find((o) => o.label === 'B wins');

    const { agent } = await setupFundedBetter(10000);
    await agent.post('/api/bets').send({ betOptionId: optionA.id, stake: 10000 });
    // A losing-side bet too, so this is a genuine two-sided pool (TASK-007
    // refunds a one-sided pool instead of paying out, which would make
    // this idempotency test moot).
    const { agent: loser } = await setupFundedBetter(5000);
    await loser.post('/api/bets').send({ betOptionId: optionB.id, stake: 5000 });

    await boardmanAgent.patch(`/api/competitions/${competition.id}/close-betting`);
    await boardmanAgent.post(`/api/competitions/${competition.id}/result`).send({ winningOptionId: optionA.id });
    await prisma.result.update({
      where: { competitionId: competition.id },
      data: { status: 'CONFIRMED', confirmationDeadline: new Date(Date.now() - 1000) },
    });
    await prisma.competition.update({ where: { id: competition.id }, data: { status: 'RESULT_CONFIRMED' } });

    const first = await payoutService.processPayoutsForCompetition(competition.id);
    const second = await payoutService.processPayoutsForCompetition(competition.id);

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);

    const payoutRows = await prisma.payout.findMany({ where: { bet: { competitionId: competition.id } } });
    expect(payoutRows.length).toBe(1);
  });

  it('rejects a bet larger than the wallet balance', async () => {
    const { boardmanAgent } = await setupApprovedBoardman();
    const createRes = await boardmanAgent.post('/api/competitions').send({
      title: 'Balance Check Match',
      category: 'FOOTBALL',
      bettingDeadline: new Date(Date.now() + 3600000).toISOString(),
      options: ['A wins', 'B wins'],
    });
    const optionA = createRes.body.competition.betOptions[0];

    const { agent } = await setupFundedBetter(1000);
    const res = await agent.post('/api/bets').send({ betOptionId: optionA.id, stake: 50000 });

    expect(res.status).toBe(400);
  });
});

describe('Deposit idempotency', () => {
  it('does not double-credit if the same Paystack reference is confirmed twice', async () => {
    const { userId } = await setupFundedBetter(0);
    const deposit = await prisma.deposit.create({
      data: { userId, amount: 5000, provider: 'PAYSTACK', providerReference: 'ref-123', status: 'PENDING' },
    });

    await depositService.handlePaystackChargeSuccess('ref-123');
    await depositService.handlePaystackChargeSuccess('ref-123'); // simulate Paystack retrying the webhook

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(Number(wallet.balance)).toBe(5000);
  });
});
