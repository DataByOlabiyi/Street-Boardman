const { resetDatabase, prisma } = require('../helpers/reset');

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Database-level schema integrity (TASK-013)', () => {
  it('rejects a negative wallet balance at the database level, even bypassing application code', async () => {
    const user = await prisma.user.create({
      data: { role: 'BETTER', fullName: 'Integrity Better', phone: '08050000001', passwordHash: 'x' },
    });
    const wallet = await prisma.wallet.create({
      data: { userId: user.id, walletType: 'BETTER', balance: 100 },
    });

    await expect(
      prisma.$executeRaw`UPDATE "Wallet" SET balance = -1 WHERE id = ${wallet.id}`
    ).rejects.toThrow();

    const unchanged = await prisma.wallet.findUnique({ where: { id: wallet.id } });
    expect(Number(unchanged.balance)).toBe(100);
  });

  it('rejects a Bet referencing a non-existent competition', async () => {
    const user = await prisma.user.create({
      data: { role: 'BETTER', fullName: 'FK Better', phone: '08050000002', passwordHash: 'x' },
    });
    const boardmanUser = await prisma.user.create({
      data: { role: 'BOARDMAN', fullName: 'FK Boardman', phone: '08050000003', passwordHash: 'x' },
    });
    const profile = await prisma.boardmanProfile.create({
      data: { userId: boardmanUser.id, businessLocation: 'Lagos', approvalStatus: 'APPROVED' },
    });
    const competition = await prisma.competition.create({
      data: {
        boardmanProfileId: profile.id,
        title: 'FK Test',
        category: 'FOOTBALL',
        bettingDeadline: new Date(Date.now() + 3600000),
        boardmanCommissionRate: 0.05,
        platformCommissionRate: 0.03,
      },
    });
    const option = await prisma.betOption.create({ data: { competitionId: competition.id, label: 'A' } });

    await expect(
      prisma.bet.create({
        data: {
          betCode: 'SB-FKTEST',
          betterId: user.id,
          competitionId: 'nonexistent-competition-id',
          betOptionId: option.id,
          stake: 100,
          potentialPayout: 100,
        },
      })
    ).rejects.toThrow();
  });
});
