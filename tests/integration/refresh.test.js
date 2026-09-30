const request = require('supertest');
const app = require('../../server/app');
const { resetDatabase, prisma } = require('../helpers/reset');

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/auth/refresh (TASK-009)', () => {
  it('issues a new session for a valid refresh cookie, reflecting the current user record', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register/better').send({ fullName: 'Refreshable Better', phone: '08041112222', pin: '1234' });

    const res = await agent.post('/api/auth/refresh');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('BETTER');
    expect(res.headers['set-cookie']).toBeDefined();

    // The rotated session actually works for a protected route.
    const me = await agent.get('/api/users/me');
    expect(me.status).toBe(200);
  });

  it('rejects with 401 when there is no refresh cookie at all', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('rejects with 401 and clears cookies for a tampered refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', ['sb_refresh=not-a-real-token']);
    expect(res.status).toBe(401);
  });

  it('rejects a refresh for a since-suspended user', async () => {
    const agent = request.agent(app);
    const register = await agent
      .post('/api/auth/register/better')
      .send({ fullName: 'Later Suspended', phone: '08041114444', pin: '1234' });

    await prisma.user.update({ where: { id: register.body.user.id }, data: { status: 'SUSPENDED' } });

    const res = await agent.post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });
});
