// Manual balance corrections need two different staff members (FEAT-047).
const { resetDatabase, prisma } = require('../helpers/reset');
const { resetAuthLimiter, staffAgent, fundedBetter, balanceOf } = require('../helpers/fixtures');
const reconciliationService = require('../../server/services/reconciliationService');

beforeEach(async () => {
  await resetDatabase();
  await resetAuthLimiter();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Manual adjustments, maker-checker (FEAT-047)', () => {
  it('moves money only when a second staff member approves', async () => {
    const maker = await staffAgent('FINANCE');
    const checker = await staffAgent('FINANCE');
    const b = await fundedBetter(1000);

    const req = await maker.agent.post('/api/admin/adjustments').send({ userId: b.userId, amount: 250, reason: 'Compensation for failed deposit' });
    expect(req.status).toBe(201);
    expect(await balanceOf(b.userId)).toBe(1000);

    const self = await maker.agent.patch(`/api/admin/adjustments/${req.body.adjustment.id}/approve`).send({});
    expect(self.status).toBe(403);

    const ok = await checker.agent.patch(`/api/admin/adjustments/${req.body.adjustment.id}/approve`).send({ note: 'Checked the bank statement' });
    expect(ok.status).toBe(200);
    expect(await balanceOf(b.userId)).toBe(1250);

    const again = await checker.agent.patch(`/api/admin/adjustments/${req.body.adjustment.id}/approve`).send({});
    expect(again.status).toBe(400);
    expect(await balanceOf(b.userId)).toBe(1250);

    const tx = await prisma.walletTransaction.findFirst({ where: { referenceType: 'WalletAdjustment' } });
    expect(tx).toMatchObject({ type: 'ADJUSTMENT', referenceId: req.body.adjustment.id });
    expect((await reconciliationService.runDailyReconciliation()).pass).toBe(true);

    const actions = (await prisma.auditLog.findMany({ where: { entityType: 'WalletAdjustment' } })).map((a) => a.action).sort();
    expect(actions).toEqual(['WALLET_ADJUSTMENT_APPROVED', 'WALLET_ADJUSTMENT_REQUESTED']);
  });

  it('never overdraws a wallet, and rejection leaves the balance alone', async () => {
    const maker = await staffAgent('FINANCE');
    const checker = await staffAgent('SUPER_ADMIN');
    const b = await fundedBetter(1000);

    const debit = await maker.agent.post('/api/admin/adjustments').send({ userId: b.userId, amount: -5000, reason: 'Reverse a duplicated deposit' });
    const approve = await checker.agent.patch(`/api/admin/adjustments/${debit.body.adjustment.id}/approve`).send({});
    expect(approve.status).toBe(400);
    expect(await balanceOf(b.userId)).toBe(1000);
    expect((await prisma.walletAdjustment.findUnique({ where: { id: debit.body.adjustment.id } })).status).toBe('PENDING');

    const reject = await checker.agent.patch(`/api/admin/adjustments/${debit.body.adjustment.id}/reject`).send({ note: 'Deposit was not duplicated' });
    expect(reject.status).toBe(200);
    expect(reject.body.adjustment.status).toBe('REJECTED');
    expect(await balanceOf(b.userId)).toBe(1000);
  });

  it('is limited to finance staff, capped, and only for user wallets', async () => {
    const support = await staffAgent('SUPPORT');
    const maker = await staffAgent('FINANCE');
    const b = await fundedBetter(1000);
    const platform = await prisma.wallet.findFirst({ where: { walletType: 'PLATFORM' } });

    expect((await support.agent.post('/api/admin/adjustments').send({ userId: b.userId, amount: 100, reason: 'Support tried this' })).status).toBe(403);
    expect((await maker.agent.post('/api/admin/adjustments').send({ userId: b.userId, amount: 2_000_000, reason: 'Far too large an amount' })).status).toBe(422);
    expect((await maker.agent.post('/api/admin/adjustments').send({ userId: b.userId, amount: 100, reason: 'short' })).status).toBe(422);
    if (platform) {
      expect((await maker.agent.post('/api/admin/adjustments').send({ userId: platform.userId, amount: 100, reason: 'Top up platform revenue' })).status).toBe(422);
    }
  });
});
