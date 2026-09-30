const request = require('supertest');
const { generate: totpGenerate } = require('@otplib/totp');
const app = require('../../server/app');
const { resetDatabase, prisma } = require('../helpers/reset');
const mfaService = require('../../server/services/mfaService');
const password = require('../../server/utils/password');
const { signMfaChallengeToken } = require('../../server/utils/jwt');
const { base32Plugin, cryptoPlugin } = require('../../server/utils/totpPlugins');

function generate({ secret }) {
  return totpGenerate({ secret, crypto: cryptoPlugin, base32: base32Plugin });
}

let counter = 0;
async function createAdmin(staffRole = 'SUPER_ADMIN') {
  counter += 1;
  const phone = `0920${String(counter).padStart(7, '0')}`;
  const passwordHash = await password.hash('1234');
  const user = await prisma.user.create({
    data: { role: 'ADMIN', fullName: 'Staff Person', phone, passwordHash, staffRole },
  });
  return { user, phone };
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('MFA enrollment (TASK-031)', () => {
  it('startSetup generates a secret but does not enable MFA yet', async () => {
    const { user } = await createAdmin();
    const { secret, otpauthUrl } = await mfaService.startSetup(user.id);

    expect(secret).toBeTruthy();
    expect(otpauthUrl).toContain('otpauth://');

    const reloaded = await prisma.user.findUnique({ where: { id: user.id } });
    expect(reloaded.mfaSecret).toBe(secret);
    expect(reloaded.mfaEnabledAt).toBeNull();
  });

  it('confirmSetup rejects an incorrect code and leaves MFA disabled', async () => {
    const { user } = await createAdmin();
    await mfaService.startSetup(user.id);

    await expect(mfaService.confirmSetup(user.id, '000000')).rejects.toMatchObject({ statusCode: 400 });

    const reloaded = await prisma.user.findUnique({ where: { id: user.id } });
    expect(reloaded.mfaEnabledAt).toBeNull();
  });

  it('confirmSetup with the correct code enables MFA', async () => {
    const { user } = await createAdmin();
    const { secret } = await mfaService.startSetup(user.id);
    const code = await generate({ secret });

    await mfaService.confirmSetup(user.id, code);

    const reloaded = await prisma.user.findUnique({ where: { id: user.id } });
    expect(reloaded.mfaEnabledAt).not.toBeNull();
  });

  it('disableMfa requires a valid current code', async () => {
    const { user } = await createAdmin();
    const { secret } = await mfaService.startSetup(user.id);
    const code = await generate({ secret });
    await mfaService.confirmSetup(user.id, code);

    await expect(mfaService.disableMfa(user.id, '000000')).rejects.toMatchObject({ statusCode: 400 });

    const freshCode = await generate({ secret });
    await mfaService.disableMfa(user.id, freshCode);

    const reloaded = await prisma.user.findUnique({ where: { id: user.id } });
    expect(reloaded.mfaEnabledAt).toBeNull();
    expect(reloaded.mfaSecret).toBeNull();
  });

  it('enrollment endpoints are only reachable by an authenticated ADMIN', async () => {
    const res = await request(app).post('/api/auth/mfa/setup');
    expect(res.status).toBe(401);
  });
});

describe('Login gate for MFA-enabled staff (TASK-031)', () => {
  it('an admin without MFA enabled logs in with a single step, same as before', async () => {
    const { phone } = await createAdmin();
    const res = await request(app).post('/api/auth/login').send({ phone, pin: '1234' });

    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBeUndefined();
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.headers['set-cookie']).toBeTruthy();
  });

  it('an admin with MFA enabled gets a challenge instead of a session on login', async () => {
    const { user, phone } = await createAdmin();
    const { secret } = await mfaService.startSetup(user.id);
    await mfaService.confirmSetup(user.id, await generate({ secret }));

    const res = await request(app).post('/api/auth/login').send({ phone, pin: '1234' });

    expect(res.status).toBe(200);
    expect(res.body.mfaRequired).toBe(true);
    expect(res.body.mfaToken).toBeTruthy();
    expect(res.body.user).toBeUndefined();
    expect(res.headers['set-cookie']).toBeFalsy();
  });

  it('completing the challenge with the correct code establishes a session', async () => {
    const { user, phone } = await createAdmin();
    const { secret } = await mfaService.startSetup(user.id);
    await mfaService.confirmSetup(user.id, await generate({ secret }));

    const loginRes = await request(app).post('/api/auth/login').send({ phone, pin: '1234' });
    const { mfaToken } = loginRes.body;

    const verifyRes = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken, code: await generate({ secret }) });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.user.role).toBe('ADMIN');
    expect(verifyRes.headers['set-cookie']).toBeTruthy();
  });

  it('rejects an incorrect code at the challenge step', async () => {
    const { user, phone } = await createAdmin();
    const { secret } = await mfaService.startSetup(user.id);
    await mfaService.confirmSetup(user.id, await generate({ secret }));

    const loginRes = await request(app).post('/api/auth/login').send({ phone, pin: '1234' });
    const { mfaToken } = loginRes.body;

    const verifyRes = await request(app).post('/api/auth/mfa/verify').send({ mfaToken, code: '000000' });

    expect(verifyRes.status).toBe(400);
    expect(verifyRes.headers['set-cookie']).toBeFalsy();
  });

  it('rejects an expired or forged mfaToken', async () => {
    const res = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: 'not-a-real-token', code: '123456' });

    expect(res.status).toBe(401);
  });

  it('an MFA challenge token cannot be used as a session cookie to bypass the second step', async () => {
    const { user } = await createAdmin();
    const { secret } = await mfaService.startSetup(user.id);
    await mfaService.confirmSetup(user.id, await generate({ secret }));

    const challengeToken = signMfaChallengeToken(user);
    const res = await request(app).get('/api/admin/overview').set('Cookie', [`sb_access=${challengeToken}`]);

    expect(res.status).toBe(401);
  });
});
