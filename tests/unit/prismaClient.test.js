// The Postgres pool is sized explicitly: node-postgres's default of 10
// starved bets of connections under load after the Prisma 7 upgrade.
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));
jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn() }));

const { PrismaPg } = require('@prisma/adapter-pg');
const { createPrismaClient, DEFAULT_POOL_MAX } = require('../../server/utils/prismaClient');

describe('createPrismaClient pool size', () => {
  const original = process.env.DATABASE_POOL_MAX;
  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_POOL_MAX;
    else process.env.DATABASE_POOL_MAX = original;
    PrismaPg.mockClear();
  });

  it('defaults to 20 connections, not node-postgres\'s 10', () => {
    delete process.env.DATABASE_POOL_MAX;
    createPrismaClient('postgresql://x@localhost/db');
    expect(DEFAULT_POOL_MAX).toBe(20);
    expect(PrismaPg).toHaveBeenCalledWith({ connectionString: 'postgresql://x@localhost/db', max: 20 });
  });

  it('takes DATABASE_POOL_MAX, ignoring values that are not positive integers', () => {
    process.env.DATABASE_POOL_MAX = '35';
    createPrismaClient('postgresql://x@localhost/db');
    expect(PrismaPg).toHaveBeenLastCalledWith(expect.objectContaining({ max: 35 }));

    process.env.DATABASE_POOL_MAX = 'lots';
    createPrismaClient('postgresql://x@localhost/db');
    expect(PrismaPg).toHaveBeenLastCalledWith(expect.objectContaining({ max: 20 }));
  });
});
