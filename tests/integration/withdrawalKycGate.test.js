const request = require('supertest');
const app = require('../../server/app');
const { resetDatabase, prisma } = require('../helpers/reset');
const withdrawalService = require('../../server/services/withdrawalService');
const kycService = require('../../server/services/kycService');

let phoneCounter = 0;
async function setupFundedBetter(amount = 10000) {
  phoneCounter += 1;
  const phone = `0896${String(phoneCounter).padStart(7, '0')}`;
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register/better').send({ fullName: 'Gate Better', phone, pin: '1234' });
  await agent.post('/api/deposits/demo').send({ amount });
  return { agent, userId: res.body.user.id };
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Withdrawal gated by KYC tier (TASK-027)', () => {
  it('blocks a TIER_0 (unverified) user from withdrawing', async () => {
    const { userId } = await setupFundedBetter(5000);

    await expect(
      withdrawalService.requestWithdrawal(userId, 1000, {
        bankName: 'Test',
        accountNumber: '0000000000',
        accountName: 'Gate Better',
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    // Wallet must be untouched — the check happens before any debit.
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(Number(wallet.balance)).toBe(5000);
  });

  it('allows a TIER_1 (BVN/NIN verified) user to withdraw normally', async () => {
    const { userId } = await setupFundedBetter(5000);
    await kycService.verifyBvnOrNin(userId, { idType: 'BVN', value: '12345678901' });

    const withdrawal = await withdrawalService.requestWithdrawal(userId, 1000, {
      bankName: 'Test',
      accountNumber: '0000000000',
      accountName: 'Gate Better',
    });
    expect(withdrawal.status).toBe('PENDING');

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(Number(wallet.balance)).toBe(4000);
  });

  it('rejects over the API with a clear message for an unverified user', async () => {
    const { agent } = await setupFundedBetter(5000);
    const res = await agent.post('/api/withdrawals').send({
      amount: 1000,
      destination: { bankName: 'Test', accountNumber: '0000000000', accountName: 'Gate Better' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/BVN|NIN/i);
  });
});
