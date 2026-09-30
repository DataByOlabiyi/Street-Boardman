const { PrismaClient } = require('@prisma/client');
const env = require('./env');

// One Prisma client for the whole process. Creating a new one per request
// would exhaust Postgres connections.
//
// Connects as the least-privilege runtime role (APP_DATABASE_URL), not
// the migrator/owner role in DATABASE_URL (TASK-034) — this is the
// connection every request and background job actually runs through, so
// it's the one that should never be able to run DDL.
// Falls back to plain PrismaClient() (Prisma's own env("DATABASE_URL")
// resolution from schema.prisma) when appDatabaseUrl isn't set — keeps
// this working against a partial env mock (see
// tests/unit/depositService.test.js), not just a fully-populated one.
const prisma = env.appDatabaseUrl
  ? new PrismaClient({ datasources: { db: { url: env.appDatabaseUrl } } })
  : new PrismaClient();

module.exports = prisma;
