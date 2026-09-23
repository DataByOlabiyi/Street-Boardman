const prisma = require('../config/db');
const AppError = require('../utils/appError');
const password = require('../utils/password');
const walletService = require('./walletService');
const { ROLES } = require('../config/constants');

async function registerBetter({ fullName, phone, pin }) {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) throw new AppError('An account with this phone number already exists', 409);

  const pinHash = await password.hash(pin);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { role: ROLES.BETTER, fullName, phone, passwordHash: pinHash },
    });
    await walletService.createWalletForUser(tx, user.id, 'BETTER', true);
    return user;
  });
}

async function registerBoardman({ fullName, phone, pin, businessLocation, kycDocumentUrl }) {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) throw new AppError('An account with this phone number already exists', 409);

  const pinHash = await password.hash(pin);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { role: ROLES.BOARDMAN, fullName, phone, passwordHash: pinHash },
    });
    await tx.boardmanProfile.create({
      data: { userId: user.id, businessLocation, kycDocumentUrl, approvalStatus: 'PENDING_APPROVAL' },
    });
    await walletService.createWalletForUser(tx, user.id, 'BOARDMAN', true);
    return user;
  });
}

async function login({ phone, pin }) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) throw new AppError('Invalid phone number or PIN', 401);
  if (user.status === 'SUSPENDED') throw new AppError('Account suspended, contact support', 403);

  const valid = await password.compare(pin, user.passwordHash);
  if (!valid) throw new AppError('Invalid phone number or PIN', 401);

  return user;
}

module.exports = { registerBetter, registerBoardman, login };
