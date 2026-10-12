// Shared setup for HTTP-level integration tests: logged-in staff, approved
// Boardmen with competitions, and funded Betters.
const request = require('supertest');
const app = require('../../server/app');
const { prisma } = require('./reset');
const adminService = require('../../server/services/adminService');
const password = require('../../server/utils/password');
const { authLimiter } = require('../../server/middleware/rateLimit');

let counter = 0;
function nextPhone(prefix) {
  counter += 1;
  return `${prefix}${String(counter).padStart(7, '0')}`;
}

// Suites that sign up and log in more than 20 accounts would hit the auth
// limiter (20 per 15 minutes per IP); call this in beforeEach to start a
// fresh window, as if the 15 minutes had passed.
async function resetAuthLimiter() {
  for (const ip of ['::ffff:127.0.0.1', '127.0.0.1', '::1']) await authLimiter.resetKey(ip);
}

async function staffAgent(staffRole) {
  const phone = nextPhone('0930');
  const user = await prisma.user.create({
    data: { role: 'ADMIN', fullName: `Staff ${staffRole}`, phone, passwordHash: await password.hash('1234'), staffRole },
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ phone, pin: '1234' });
  return { agent, userId: user.id };
}

async function approvedBoardman() {
  let admin = await prisma.user.findFirst({ where: { role: 'ADMIN', fullName: 'Fixture Root' } });
  if (!admin) {
    admin = await prisma.user.create({
      data: { role: 'ADMIN', fullName: 'Fixture Root', phone: nextPhone('0940'), passwordHash: 'x', staffRole: 'SUPER_ADMIN' },
    });
  }
  if (!(await prisma.wallet.findFirst({ where: { walletType: 'PLATFORM' } }))) {
    await prisma.wallet.create({ data: { userId: admin.id, walletType: 'PLATFORM', balance: 0 } });
  }
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register/boardman')
    .send({ fullName: 'Bola Boardman', phone: nextPhone('0950'), pin: '1234', businessLocation: 'Lagos' });
  const profile = await prisma.boardmanProfile.findUnique({ where: { userId: res.body.user.id } });
  await adminService.approveBoardman(profile.id, admin.id);
  return { agent, userId: res.body.user.id, profileId: profile.id };
}

async function fundedBetter(amount = 20000) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register/better').send({ fullName: 'Ada Better', phone: nextPhone('0960'), pin: '1234' });
  await agent.post('/api/deposits/demo').send({ amount });
  return { agent, userId: res.body.user.id };
}

async function openCompetition(boardman, title = 'Tunde vs Seyi') {
  const res = await boardman.agent.post('/api/competitions').send({
    title,
    category: 'FOOTBALL',
    bettingDeadline: new Date(Date.now() + 3600000).toISOString(),
    options: ['Tunde wins', 'Seyi wins'],
  });
  return res.body.competition;
}

async function balanceOf(userId) {
  return Number((await prisma.wallet.findUnique({ where: { userId } })).balance);
}

module.exports = { nextPhone, resetAuthLimiter, staffAgent, approvedBoardman, fundedBetter, openCompetition, balanceOf };
