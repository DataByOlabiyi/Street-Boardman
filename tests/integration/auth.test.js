const request = require('supertest');
const app = require('../../server/app');
const { resetDatabase, prisma } = require('../helpers/reset');

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Registration & login', () => {
  it('registers a Better and issues a session cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register/better')
      .send({ fullName: 'Ada Better', phone: '08031234567', pin: '1234' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('BETTER');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('registers a Boardman as PENDING_APPROVAL, not immediately able to operate', async () => {
    const res = await request(app)
      .post('/api/auth/register/boardman')
      .send({ fullName: 'Bola Boardman', phone: '08039876543', pin: '1234', businessLocation: 'Ibadan' });

    expect(res.status).toBe(201);
    const profile = await prisma.boardmanProfile.findUnique({ where: { userId: res.body.user.id } });
    expect(profile.approvalStatus).toBe('PENDING_APPROVAL');
  });

  it('rejects duplicate phone numbers', async () => {
    await request(app)
      .post('/api/auth/register/better')
      .send({ fullName: 'First', phone: '08010101010', pin: '1234' });

    const res = await request(app)
      .post('/api/auth/register/better')
      .send({ fullName: 'Second', phone: '08010101010', pin: '5678' });

    expect(res.status).toBe(409);
  });

  it('rejects login with wrong PIN', async () => {
    await request(app)
      .post('/api/auth/register/better')
      .send({ fullName: 'Ada Better', phone: '08031234567', pin: '1234' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ phone: '08031234567', pin: 'wrong' });

    expect(res.status).toBe(401);
  });
});

describe('Role permissions', () => {
  it('blocks a Better from creating a competition', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register/better').send({ fullName: 'Ada', phone: '08031111111', pin: '1234' });

    const res = await agent.post('/api/competitions').send({
      title: 'Test',
      category: 'FOOTBALL',
      bettingDeadline: new Date(Date.now() + 3600000).toISOString(),
      options: ['A', 'B'],
    });

    expect(res.status).toBe(403);
  });

  it('blocks an unapproved Boardman from creating a competition', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register/boardman')
      .send({ fullName: 'Bola', phone: '08032222222', pin: '1234', businessLocation: 'Lagos' });

    const res = await agent.post('/api/competitions').send({
      title: 'Test',
      category: 'FOOTBALL',
      bettingDeadline: new Date(Date.now() + 3600000).toISOString(),
      options: ['A', 'B'],
    });

    expect(res.status).toBe(403);
  });

  it('blocks non-admins from reaching admin routes', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register/better').send({ fullName: 'Ada', phone: '08033333333', pin: '1234' });

    const res = await agent.get('/api/admin/overview');
    expect(res.status).toBe(403);
  });
});
