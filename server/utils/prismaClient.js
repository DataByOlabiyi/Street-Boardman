const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// node-postgres pools default to 10 connections; Prisma 5's engine sized
// its own pool from the CPU count. After the Prisma 7 upgrade, 400 bettors
// on one match queued for a connection past Prisma's 2s transaction wait
// and 1.3% of bets failed with a 500 (TASK-048 load test). Sized
// explicitly now. Keep (API + worker instances) x this under the
// database's max_connections.
const DEFAULT_POOL_MAX = 20;

function poolMax() {
  const raw = Number(process.env.DATABASE_POOL_MAX);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_POOL_MAX;
}

// Prisma 7 has no built-in query engine: every client talks to Postgres
// through a driver adapter (node-postgres here), and the connection URL is
// passed in rather than read from schema.prisma. One place builds clients
// so the server, seed, scripts and tests can't drift apart.
function createPrismaClient(connectionString) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: poolMax() }) });
}

module.exports = { createPrismaClient, poolMax, DEFAULT_POOL_MAX };
