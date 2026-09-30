const request = require('supertest');
const app = require('../../server/app');
const { resetDatabase, prisma } = require('../helpers/reset');
const adminService = require('../../server/services/adminService');

let userCounter = 0;
async function setupApprovedBoardman() {
  userCounter += 1;
  const admin = await prisma.user.create({
    data: { role: 'ADMIN', fullName: 'Admin', phone: `0810${String(userCounter).padStart(7, '0')}`, passwordHash: 'x' },
  });
  await prisma.wallet.create({ data: { userId: admin.id, walletType: 'PLATFORM', balance: 0 } });

  userCounter += 1;
  const boardmanAgent = request.agent(app);
  const res = await boardmanAgent.post('/api/auth/register/boardman').send({
    fullName: 'Dispute Boardman',
    phone: `0811${String(userCounter).padStart(7, '0')}`,
    pin: '1234',
    businessLocation: 'Lagos',
  });
  const boardmanUserId = res.body.user.id;
  const profile = await prisma.boardmanProfile.findUnique({ where: { userId: boardmanUserId } });
  await adminService.approveBoardman(profile.id, admin.id);
  return { boardmanAgent };
}

async function setupFundedBetter(amount = 20000) {
  userCounter += 1;
  const phone = `0812${String(userCounter).padStart(7, '0')}`;
  const agent = request.agent(app);
  await agent.post('/api/auth/register/better').send({ fullName: 'Dispute Better', phone, pin: '1234' });
  await agent.post('/api/deposits/demo').send({ amount });
  return { agent };
}

async function setupPendingConfirmationCompetition() {
  const { boardmanAgent } = await setupApprovedBoardman();
  const { agent: bettor } = await setupFundedBetter(10000);

  const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const createRes = await boardmanAgent.post('/api/competitions').send({
    title: 'Dispute Eligibility Test',
    category: 'FOOTBALL',
    bettingDeadline: deadline,
    options: ['Home', 'Away'],
  });
  const competitionId = createRes.body.competition.id;
  const home = createRes.body.competition.betOptions.find((o) => o.label === 'Home');

  await bettor.post('/api/bets').send({ betOptionId: home.id, stake: 2000 });
  await boardmanAgent.patch(`/api/competitions/${competitionId}/close-betting`);
  await boardmanAgent.post(`/api/competitions/${competitionId}/result`).send({ winningOptionId: home.id });

  return { competitionId, boardmanAgent, bettor };
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/competitions/:id/dispute — eligibility (TASK-011)', () => {
  it('rejects a dispute from someone with no bet on the competition', async () => {
    const { competitionId } = await setupPendingConfirmationCompetition();
    const { agent: unrelated } = await setupFundedBetter(5000);

    const res = await unrelated
      .post(`/api/competitions/${competitionId}/dispute`)
      .send({ reason: 'I just feel like disputing this' });

    expect(res.status).toBe(403);
  });

  it('allows a dispute from a bettor who actually staked on the competition', async () => {
    const { competitionId, bettor } = await setupPendingConfirmationCompetition();

    const res = await bettor.post(`/api/competitions/${competitionId}/dispute`).send({ reason: 'This result looks wrong' });

    expect(res.status).toBe(201);
    const dispute = await prisma.dispute.findFirst({ where: { competitionId } });
    expect(dispute).not.toBeNull();
  });

  it('allows a dispute from the Boardman who ran the competition', async () => {
    const { competitionId, boardmanAgent } = await setupPendingConfirmationCompetition();

    const res = await boardmanAgent
      .post(`/api/competitions/${competitionId}/dispute`)
      .send({ reason: 'I submitted the wrong option by mistake' });

    expect(res.status).toBe(201);
  });
});
