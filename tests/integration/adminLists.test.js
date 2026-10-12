// Admin lists page, filter and export to CSV the same way (FEAT-045).
const { resetDatabase, prisma } = require('../helpers/reset');
const { resetAuthLimiter, staffAgent, fundedBetter } = require('../helpers/fixtures');

beforeEach(async () => {
  await resetDatabase();
  await resetAuthLimiter();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Admin lists: paging, filters, CSV export (FEAT-045)', () => {
  it('pages and filters users without changing the response key', async () => {
    const admin = await staffAgent('SUPPORT');
    for (let i = 0; i < 3; i += 1) await fundedBetter(100);

    const page = await admin.agent.get('/api/admin/users?role=BETTER&pageSize=2&page=2');
    expect(page.status).toBe(200);
    expect(page.body.users).toHaveLength(1);
    expect(page.body.page).toEqual({ page: 2, pageSize: 2, total: 3 });

    const search = await admin.agent.get('/api/admin/users?q=Staff');
    expect(search.body.users.every((u) => u.fullName.startsWith('Staff'))).toBe(true);
    expect(search.body.users[0].passwordHash).toBeUndefined();

    expect((await admin.agent.get('/api/admin/users?pageSize=9999')).status).toBe(422);
    expect((await admin.agent.get('/api/admin/users?role=ROOT')).status).toBe(422);
  });

  it('exports CSV with formula injection neutralised, and audits the export', async () => {
    const admin = await staffAgent('SUPER_ADMIN');
    await prisma.user.create({ data: { role: 'BETTER', fullName: '=HYPERLINK("http://evil")', phone: '08099999999', passwordHash: 'x' } });

    const res = await admin.agent.get('/api/admin/users?format=csv&role=BETTER');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="users-/);
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe('id,role,staffRole,fullName,phone,status,kycTier,createdAt');
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil"")"`);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'DATA_EXPORTED' } });
    expect(audit).toMatchObject({ actorUserId: admin.userId, entityType: 'users' });
    expect(audit.afterState.rows).toBe(1);
  });

  it('lists withdrawals for finance staff only, filtered by status', async () => {
    const finance = await staffAgent('FINANCE');
    const support = await staffAgent('SUPPORT');
    const b = await fundedBetter(5000);
    await prisma.user.update({ where: { id: b.userId }, data: { kycTier: 'TIER_1' } });
    await b.agent.post('/api/withdrawals').send({
      amount: 1000,
      pin: '1234',
      destination: { bankName: 'GTBank', accountNumber: '0123456789', accountName: 'Ada Better' },
    });

    const list = await finance.agent.get('/api/admin/withdrawals?status=PENDING');
    expect(list.status).toBe(200);
    expect(list.body.withdrawals).toHaveLength(1);
    expect(list.body.withdrawals[0].user.passwordHash).toBeUndefined();
    expect((await finance.agent.get('/api/admin/withdrawals?status=PROCESSED')).body.withdrawals).toHaveLength(0);
    expect((await support.agent.get('/api/admin/withdrawals')).status).toBe(403);
  });
});
