// Boardman edits and cancels their own competitions (FEAT-039), and the
// bet/cancel race that cancellation exposed.
const { resetDatabase, prisma } = require('../helpers/reset');
const { resetAuthLimiter, approvedBoardman, fundedBetter, openCompetition, balanceOf } = require('../helpers/fixtures');
const bettingService = require('../../server/services/bettingService');
const payoutService = require('../../server/services/payoutService');
const resultService = require('../../server/services/resultService');
const reconciliationService = require('../../server/services/reconciliationService');

beforeEach(async () => {
  await resetDatabase();
  await resetAuthLimiter();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Holds a transaction open at a chosen point so the other side of a race
// can run against it. Returns once `setup` has run; call release() to commit.
async function holdTransaction(setup) {
  let release;
  let ready;
  const readyPromise = new Promise((resolve) => { ready = resolve; });
  const done = prisma.$transaction(async (tx) => {
    await setup(tx);
    ready();
    await new Promise((resolve) => { release = resolve; });
  }, { timeout: 20000 });
  await readyPromise;
  return { release: () => release(), done };
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('A bet racing a cancellation (regression)', () => {
  it('a bet arriving during a cancel is refused, not stranded in escrow', async () => {
    const bm = await approvedBoardman();
    const competition = await openCompetition(bm);
    const b = await fundedBetter(5000);

    // A cancel mid-flight: competition locked FOR UPDATE and claimed, not committed.
    const cancel = await holdTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Competition" WHERE id = ${competition.id} FOR UPDATE`;
      await tx.competition.updateMany({ where: { id: competition.id }, data: { status: 'CANCELLED_REFUNDED' } });
    });

    // Before the fix the bet passed its pre-transaction check and was
    // written after the refund loop: an OPEN bet that nobody refunds.
    const bet = bettingService.placeBet({ betterId: b.userId, betOptionId: competition.betOptions[0].id, stake: 1000 });
    await pause(300);
    cancel.release();
    await cancel.done;

    await expect(bet).rejects.toMatchObject({ statusCode: 400 });
    expect(await prisma.bet.count({ where: { competitionId: competition.id } })).toBe(0);
    expect(await balanceOf(b.userId)).toBe(5000);
  });

  it('a cancel arriving during a bet waits for it and refunds it', async () => {
    const bm = await approvedBoardman();
    const competition = await openCompetition(bm);

    // A bet mid-flight holds the KEY SHARE lock its foreign key took on the competition.
    const bet = await holdTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Competition" WHERE id = ${competition.id} FOR KEY SHARE`;
    });

    let cancelled = false;
    const cancel = payoutService.cancelAndRefundCompetition(competition.id).then((r) => {
      cancelled = true;
      return r;
    });
    await pause(300);
    // Before the fix the cancel's plain UPDATE didn't conflict with the
    // bet's lock, so it ran its refund loop without waiting for the bet.
    expect(cancelled).toBe(false);

    bet.release();
    await bet.done;
    expect((await cancel).skipped).toBe(false);
  });
});

describe('Boardman edits a competition (FEAT-039)', () => {
  it('changes the description and deadline, and the title only before the first bet', async () => {
    const bm = await approvedBoardman();
    const competition = await openCompetition(bm);
    const deadline = new Date(Date.now() + 7200000).toISOString();

    const edited = await bm.agent.patch(`/api/competitions/${competition.id}`).send({ title: 'Tunde vs Seyi (final)', description: 'At the park', bettingDeadline: deadline });
    expect(edited.status).toBe(200);
    expect(edited.body.competition).toMatchObject({ title: 'Tunde vs Seyi (final)', description: 'At the park', bettingDeadline: deadline });

    const b = await fundedBetter(5000);
    await b.agent.post('/api/bets').send({ betOptionId: competition.betOptions[0].id, stake: 1000 });

    const retitle = await bm.agent.patch(`/api/competitions/${competition.id}`).send({ title: 'A different match' });
    expect(retitle.status).toBe(400);
    expect((await bm.agent.patch(`/api/competitions/${competition.id}`).send({ description: 'Moved indoors' })).status).toBe(200);

    const audits = await prisma.auditLog.count({ where: { entityId: competition.id, action: 'COMPETITION_EDITED' } });
    expect(audits).toBe(2);
  });

  it('refuses option changes, past deadlines, other Boardmen and closed competitions', async () => {
    const bm = await approvedBoardman();
    const other = await approvedBoardman();
    const competition = await openCompetition(bm);
    const path = `/api/competitions/${competition.id}`;

    expect((await bm.agent.patch(path).send({ options: ['x', 'y'] })).status).toBe(422);
    expect((await bm.agent.patch(path).send({ bettingDeadline: new Date(Date.now() - 1000).toISOString() })).status).toBe(422);
    expect((await other.agent.patch(path).send({ description: 'mine now' })).status).toBe(403);

    await bm.agent.patch(`/api/competitions/${competition.id}/close-betting`);
    expect((await bm.agent.patch(path).send({ description: 'too late' })).status).toBe(400);
  });
});

describe('Boardman cancels a competition (FEAT-039)', () => {
  it('refunds every stake with no commission and records why', async () => {
    const bm = await approvedBoardman();
    const competition = await openCompetition(bm);
    const b1 = await fundedBetter(5000);
    const b2 = await fundedBetter(5000);
    await b1.agent.post('/api/bets').send({ betOptionId: competition.betOptions[0].id, stake: 2000 });
    await b2.agent.post('/api/bets').send({ betOptionId: competition.betOptions[1].id, stake: 3000 });

    const res = await bm.agent.post(`/api/competitions/${competition.id}/cancel`).send({ reason: 'Pitch flooded' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ refundedBets: 2, competition: { status: 'CANCELLED_REFUNDED' } });
    expect(await balanceOf(b1.userId)).toBe(5000);
    expect(await balanceOf(b2.userId)).toBe(5000);
    expect(await prisma.commission.count()).toBe(0);

    const audit = await prisma.auditLog.findFirst({ where: { entityId: competition.id, action: 'COMPETITION_CANCELLED' } });
    expect(audit.afterState).toMatchObject({ reason: 'Pitch flooded', refundedBets: 2 });
    expect((await reconciliationService.runDailyReconciliation()).pass).toBe(true);
  });

  it('is refused once a result is submitted, and for someone else\'s competition', async () => {
    const bm = await approvedBoardman();
    const other = await approvedBoardman();
    const competition = await openCompetition(bm);

    expect((await other.agent.post(`/api/competitions/${competition.id}/cancel`).send({ reason: 'not mine' })).status).toBe(403);
    expect((await bm.agent.post(`/api/competitions/${competition.id}/cancel`).send({})).status).toBe(422);

    await bm.agent.patch(`/api/competitions/${competition.id}/close-betting`);
    const profile = await prisma.boardmanProfile.findUnique({ where: { id: bm.profileId } });
    await resultService.submitResult(profile, competition.id, { winningOptionId: competition.betOptions[0].id });

    const late = await bm.agent.post(`/api/competitions/${competition.id}/cancel`).send({ reason: 'changed my mind' });
    expect(late.status).toBe(400);
    expect((await prisma.competition.findUnique({ where: { id: competition.id } })).status).toBe('PENDING_CONFIRMATION');
  });
});
