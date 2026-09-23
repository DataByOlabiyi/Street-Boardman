const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

async function hash(plainText) {
  return bcrypt.hash(plainText, SALT_ROUNDS);
}

async function compare(plainText, hashed) {
  if (!hashed) return false;
  return bcrypt.compare(plainText, hashed);
}

module.exports = { hash, compare };
