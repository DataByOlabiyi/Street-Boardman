// Express 5 leaves req.body undefined when a request has no JSON body;
// Express 4 gave {}. Action buttons send body-less PATCHes, so the app
// restores {} (server/app.js). These would 500 or 422 without it.
const request = require('supertest');
const app = require('../../server/app');
const { resetDatabase, prisma } = require('../helpers/reset');
const { resetAuthLimiter, staffAgent, approvedBoardman, fundedBetter } = require('../helpers/fixtures');

beforeEach(async () => {
  await resetDatabase();
  await resetAuthLimiter();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Requests without a body (Express 5)', () => {
  it('reject a Boardman with no body', async () => {
    const admin = await staffAgent('SUPER_ADMIN');
    const bm = await approvedBoardman();
    const res = await admin.agent.patch(`/api/admin/boardmen/${bm.profileId}/reject`);
    expect(res.status).toBeLessThan(500);
  });

  it('approve an adjustment with no body (the note is optional)', async () => {
    const maker = await staffAgent('FINANCE');
    const checker = await staffAgent('FINANCE');
    const b = await fundedBetter(1000);
    const req = await maker.agent.post('/api/admin/adjustments').send({ userId: b.userId, amount: 100, reason: 'Goodwill credit for outage' });
    const res = await checker.agent.patch(`/api/admin/adjustments/${req.body.adjustment.id}/approve`);
    expect(res.status).toBe(200);
  });

  it('reject a withdrawal with no body', async () => {
    const finance = await staffAgent('FINANCE');
    const b = await fundedBetter(5000);
    await prisma.user.update({ where: { id: b.userId }, data: { kycTier: 'TIER_1' } });
    const w = await b.agent.post('/api/withdrawals').send({
      amount: 1000, pin: '1234', destination: { bankName: 'GTBank', accountNumber: '0123456789', accountName: 'Ada' },
    });
    const res = await finance.agent.patch(`/api/admin/withdrawals/${w.body.withdrawal.id}/reject`);
    expect(res.status).toBe(200);
  });
});
