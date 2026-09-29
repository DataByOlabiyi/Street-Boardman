const request = require('supertest');
const app = require('../../server/app');
const { resetDatabase, prisma } = require('../helpers/reset');
const adminService = require('../../server/services/adminService');
const payoutService = require('../../server/services/payoutService');

async function setupApprovedBoardman() {
  const admin = await prisma.user.create({
    data: { role: 'ADMIN', fullName: 'Admin', phone: '08000000009', passwordHash: 'x' },
  });
  await prisma.wallet.create({ data: { userId: admin.id, walletType: 'PLATFORM', balance: 0 } });

  const boardmanAgent = request.agent(app);
  const res = await boardmanAgent
    .post('/api/auth/register/boardman')
    .send({ fullName: 'Resume Boardman', phone: '08055555555', pin: '1234', businessLocation: 'Lagos' });
  const boardmanUserId = res.body.user.id;
  const profile = await prisma.boardmanProfile.findUnique({ where: { userId: boardmanUserId } });
  await adminService.approveBoardman(profile.id, admin.id);
  return { boardmanAgent, boardmanUserId, profileId: profile.id };
}

let phoneCounter = 0;
async function setupFundedBetter(amount = 20000) {
  phoneCounter += 1;
  const phone = `0808${String(phoneCounter).padStart(7, '0')}`;
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register/better')
    .send({ fullName: 'Resume Better', phone, pin: '1234' });
  await agent.post('/api/deposits/demo').send({ amount });
  return { agent, userId: res.body.user.id };
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('payoutService — resumable chunked payout (TASK-006)', () => {
  it('resumes a competition stuck in PAYOUT_PROCESSING without double-paying the bet already paid', async () => {
    const { boardmanAgent } = await setupApprovedBoardman();
    const { agent: better1, userId: better1Id } = await setupFundedBetter(20000);
    const { agent: better2, userId: better2Id } = await setupFundedBetter(20000);
    const { agent: loser } = await setupFundedBetter(10000);

    const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const createRes = await boardmanAgent.post('/api/competitions').send({
      title: 'Resume Test',
      category: 'FOOTBALL',
      bettingDeadline: deadline,
      options: ['Home', 'Away'],
    });
    const competitionId = createRes.body.competition.id;
    const homeOption = createRes.body.competition.betOptions.find((o) => o.label === 'Home');
    const awayOption = createRes.body.competition.betOptions.find((o) => o.label === 'Away');

    const bet1Res = await better1.post('/api/bets').send({ betOptionId: homeOption.id, stake: 5000 });
    const bet2Res = await better2.post('/api/bets').send({ betOptionId: homeOption.id, stake: 3000 });
    // A losing-side bet, so this is a genuine two-sided pool (TASK-007
    // refunds a one-sided pool instead of running the payout/resume path
    // this test is actually exercising).
    await loser.post('/api/bets').send({ betOptionId: awayOption.id, stake: 2000 });
    const bet1Id = bet1Res.body.bet.id;
    const bet2Id = bet2Res.body.bet.id;

    await boardmanAgent.patch(`/api/competitions/${competitionId}/close-betting`);
    await boardmanAgent.post(`/api/competitions/${competitionId}/result`).send({ winningOptionId: homeOption.id });
    await prisma.result.update({ where: { competitionId }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });

    // Simulate a crash partway through a previous payout run: competition
    // claimed (PAYOUT_PROCESSING) and bet1 already fully paid, but the run
    // died before bet2 or the commission/finalize step.
    await prisma.competition.update({ where: { id: competitionId }, data: { status: 'PAYOUT_PROCESSING' } });
    const wallet1 = await prisma.wallet.findUnique({ where: { userId: better1Id } });
    const preExistingPayout = await prisma.payout.create({
      data: { betId: bet1Id, amount: 4700, status: 'PENDING', idempotencyKey: `payout:${bet1Id}` },
    });
    const balanceBefore = wallet1.balance;
    await prisma.$executeRaw`UPDATE "Wallet" SET balance = balance + 4700 WHERE id = ${wallet1.id}`;
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet1.id,
        type: 'BET_WIN',
        amount: 4700,
        balanceBefore,
        balanceAfter: Number(balanceBefore) + 4700,
        referenceType: 'Payout',
        referenceId: preExistingPayout.id,
        note: 'Winnings — Resume Test (pre-crash)',
      },
    });
    await prisma.payout.update({ where: { id: preExistingPayout.id }, data: { status: 'PROCESSED' } });
    await prisma.bet.update({ where: { id: bet1Id }, data: { status: 'WON' } });

    // Resume: this call should pay bet2, finalize commission once, and NOT
    // re-pay bet1.
    const outcome = await payoutService.processPayoutsForCompetition(competitionId);
    expect(outcome.skipped).toBe(false);

    const bet1Payouts = await prisma.payout.findMany({ where: { betId: bet1Id } });
    expect(bet1Payouts).toHaveLength(1); // never re-created

    const bet2Payouts = await prisma.payout.findMany({ where: { betId: bet2Id } });
    expect(bet2Payouts).toHaveLength(1);
    expect(bet2Payouts[0].status).toBe('PROCESSED');

    const commissions = await prisma.commission.findMany({ where: { competitionId } });
    expect(commissions).toHaveLength(1); // finalize ran exactly once

    const finalCompetition = await prisma.competition.findUnique({ where: { id: competitionId } });
    expect(finalCompetition.status).toBe('COMPLETED');

    // Calling it again (already COMPLETED) should be a clean no-op, not an error.
    const secondCall = await payoutService.processPayoutsForCompetition(competitionId);
    expect(secondCall.skipped).toBe(true);

    const bet1Wallet = await prisma.wallet.findUnique({ where: { userId: better1Id } });
    const bet1PayoutTxs = await prisma.walletTransaction.findMany({
      where: { referenceType: 'Payout', referenceId: preExistingPayout.id },
    });
    expect(bet1PayoutTxs).toHaveLength(1); // only the pre-crash credit, never repeated
    expect(bet1Wallet).toBeDefined();
  });
});
