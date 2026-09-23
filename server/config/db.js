const { PrismaClient } = require('@prisma/client');

// One Prisma client for the whole process. Creating a new one per request
// would exhaust Postgres connections.
const prisma = new PrismaClient();

module.exports = prisma;
