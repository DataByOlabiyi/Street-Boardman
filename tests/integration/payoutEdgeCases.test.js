const request = require('supertest');
const app = require('../../server/app');
const { resetDatabase, prisma } = require('../helpers/reset');
const adminService = require('../../server/services/adminService');
const payoutService = require('../../server/services/payoutService');
const competitionService = require('../../server/services/competitionService');
const { Decimal } = require('../../server/utils/money');

let userCounter = 0;
async function setupApprovedBoardman() {
  userCounter += 1;
  const admin = await prisma.user.create({
    data: { role: 'ADMIN', fullName: 'Admin', phone: `0800${String(userCounter).padStart(7, '0')}`, passwordHash: 'x' },
  });
  await prisma.wallet.create({ data: { userId: admin.id, walletType: 'PLATFORM', balance: 0 } });

  const boardmanAgent = request.agent(app);
  userCounter += 1;
  const res = await boardmanAgent.post('/api/auth/register/boardman').send({
    fullName: 'Edge Boardman',
    phone: `0801${String(userCounter).padStart(7, '0')}`,
    pin: '1234',
    businessLocation: 'Lagos',
  });
  const boardmanUserId = res.body.user.id;
  const profile = await prisma.boardmanProfile.findUnique({ where: { userId: boardmanUserId } });
  await adminService.approveBoardman(profile.id, admin.id);
  return { boardmanAgent, boardmanUserId, profileId: profile.id, adminId: admin.id };
}

async function setupFundedBetter(amount = 20000) {
  userCounter += 1;
  const phone = `0802${String(userCounter).padStart(7, '0')}`;
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register/better').send({ fullName: 'Edge Better', phone, pin: '1234' });
  await agent.post('/api/deposits/demo').send({ amount });
  return { agent, userId: res.body.user.id };
}

async function createCompetition(boardmanAgent, options = ['Home', 'Away']) {
  const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const res = await boardmanAgent.post('/api/competitions').send({
    title: 'Edge Case Test',
    category: 'FOOTBALL',
    bettingDeadline: deadline,
    options,
  });
  return res.body.competition;
}

async function confirmResult(boardmanAgent, competitionId, winningOptionId) {
  await boardmanAgent.patch(`/api/competitions/${competitionId}/close-betting`);
  await boardmanAgent.post(`/api/competitions/${competitionId}/result`).send({ winningOptionId });
  await prisma.result.update({ where: { competitionId }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
  await prisma.competition.update({ where: { id: competitionId }, data: { status: 'RESULT_CONFIRMED' } });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('payoutService pool edge cases (TASK-007)', () => {
  it('refunds everyone and takes no commission when nobody bet on the winning option', async () => {
    const { boardmanAgent } = await setupApprovedBoardman();
    const { agent: better, userId: betterId } = await setupFundedBetter(10000);

    const competition = await createCompetition(boardmanAgent);
    const home = competition.betOptions.find((o) => o.label === 'Home');
    const away = competition.betOptions.find((o) => o.label === 'Away');

    await better.post('/api/bets').send({ betOptionId: home.id, stake: 4000 });
    await confirmResult(boardmanAgent, competition.id, away.id); // nobody bet on Away

    const outcome = await payoutService.processPayoutsForCompetition(competition.id);
    expect(outcome.skipped).toBe(false);

    const wallet = await prisma.wallet.findUnique({ where: { userId: betterId } });
    expect(Number(wallet.balance)).toBe(10000); // fully refunded, back to starting balance

    const finalCompetition = await prisma.competition.findUnique({ where: { id: competition.id } });
    expect(finalCompetition.status).toBe('CANCELLED_REFUNDED');

    const commission = await prisma.commission.findUnique({ where: { competitionId: competition.id } });
    expect(commission).toBeNull(); // no commission taken

    const bet = await prisma.bet.findFirst({ where: { betterId } });
    expect(bet.status).toBe('REFUNDED');
  });

  it('refunds stakes and takes no commission when the whole pool is on one side', async () => {
    const { boardmanAgent } = await setupApprovedBoardman();
    const { agent: better1, userId: better1Id } = await setupFundedBetter(10000);
    const { agent: better2, userId: better2Id } = await setupFundedBetter(10000);

    const competition = await createCompetition(boardmanAgent);
    const home = competition.betOptions.find((o) => o.label === 'Home');

    await better1.post('/api/bets').send({ betOptionId: home.id, stake: 3000 });
    await better2.post('/api/bets').send({ betOptionId: home.id, stake: 2000 });
    await confirmResult(boardmanAgent, competition.id, home.id);

    const outcome = await payoutService.processPayoutsForCompetition(competition.id);
    expect(outcome.skipped).toBe(false);

    const wallet1 = await prisma.wallet.findUnique({ where: { userId: better1Id } });
    const wallet2 = await prisma.wallet.findUnique({ where: { userId: better2Id } });
    // Each gets back exactly their own stake — not a pari-mutuel share,
    // which would have been LESS than their stake after commission.
    expect(Number(wallet1.balance)).toBe(10000);
    expect(Number(wallet2.balance)).toBe(10000);

    const commission = await prisma.commission.findUnique({ where: { competitionId: competition.id } });
    expect(commission).toBeNull();

    const finalCompetition = await prisma.competition.findUnique({ where: { id: competition.id } });
    expect(finalCompetition.status).toBe('CANCELLED_REFUNDED');
  });

  it('conserves money exactly (stakes = winner payouts + boardman + platform commission) despite per-bet rounding', async () => {
    const { boardmanAgent, boardmanUserId, adminId } = await setupApprovedBoardman();
    const { agent: b1, userId: b1Id } = await setupFundedBetter(20000);
    const { agent: b2, userId: b2Id } = await setupFundedBetter(20000);
    const { agent: b3, userId: b3Id } = await setupFundedBetter(20000);
    const { agent: b4 } = await setupFundedBetter(20000);

    const competition = await createCompetition(boardmanAgent);
    const home = competition.betOptions.find((o) => o.label === 'Home');
    const away = competition.betOptions.find((o) => o.label === 'Away');

    // Three equal winning stakes that don't divide the pool evenly by 3,
    // plus a losing stake so there's a genuine two-sided pool.
    await b1.post('/api/bets').send({ betOptionId: home.id, stake: 1000 });
    await b2.post('/api/bets').send({ betOptionId: home.id, stake: 1000 });
    await b3.post('/api/bets').send({ betOptionId: home.id, stake: 1000 });
    await b4.post('/api/bets').send({ betOptionId: away.id, stake: 1000 });

    await confirmResult(boardmanAgent, competition.id, home.id);
    await payoutService.processPayoutsForCompetition(competition.id);

    const boardmanWallet = await prisma.wallet.findUnique({ where: { userId: boardmanUserId } });
    const platformWallet = await prisma.wallet.findUnique({ where: { userId: adminId } });
    const winnerWallets = await Promise.all(
      [b1Id, b2Id, b3Id].map((id) => prisma.wallet.findUnique({ where: { userId: id } }))
    );

    const totalStaked = new Decimal(4000);
    // Each winner started at 20000, staked 1000 (-> 19000), then got a
    // payout back — this sums just the payout amounts received. Uses
    // Decimal throughout (not JS Number) so the assertion itself can't
    // introduce a float-rounding false failure on top of what it's testing.
    const winnerPayoutsTotal = winnerWallets.reduce(
      (sum, w) => sum.plus(new Decimal(w.balance.toString()).minus(19000)),
      new Decimal(0)
    );

    const conserved = winnerPayoutsTotal
      .plus(new Decimal(boardmanWallet.balance.toString()))
      .plus(new Decimal(platformWallet.balance.toString()));
    expect(conserved.equals(totalStaked)).toBe(true); // nothing lost or created to rounding

    const commission = await prisma.commission.findUnique({ where: { competitionId: competition.id } });
    expect(commission).not.toBeNull();
  });

  it('rejects creating a competition whose commission rates sum to 100% or more', async () => {
    const { boardmanAgent, profileId } = await setupApprovedBoardman();
    const boardmanProfile = await prisma.boardmanProfile.update({
      where: { id: profileId },
      data: { commissionRateOverride: 0.6 },
    });
    await prisma.systemSetting.upsert({
      where: { key: 'platformCommissionRate' },
      update: { value: '0.5' },
      create: { key: 'platformCommissionRate', value: '0.5' },
    });

    await expect(
      competitionService.createCompetition(boardmanProfile, {
        title: 'Bad rates',
        category: 'FOOTBALL',
        bettingDeadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        options: ['A', 'B'],
      })
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});
