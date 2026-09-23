const prisma = require('../config/db');
const env = require('../config/env');
const { SETTING_KEYS } = require('../config/constants');

const DEFAULTS = {
  [SETTING_KEYS.BOARDMAN_COMMISSION_RATE]: env.defaults.boardmanCommissionRate,
  [SETTING_KEYS.PLATFORM_COMMISSION_RATE]: env.defaults.platformCommissionRate,
  [SETTING_KEYS.RESULT_CONFIRMATION_WINDOW_HOURS]: env.defaults.resultConfirmationWindowHours,
};

async function getSetting(key) {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (row) return Number(row.value);
  if (key in DEFAULTS) return DEFAULTS[key];
  throw new Error(`Unknown setting key: ${key}`);
}

async function getAllSettings() {
  const keys = Object.values(SETTING_KEYS);
  const values = await Promise.all(keys.map(getSetting));
  return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
}

async function updateSetting(key, value, adminUserId) {
  if (!(key in DEFAULTS)) throw new Error(`Unknown setting key: ${key}`);
  return prisma.systemSetting.upsert({
    where: { key },
    update: { value: String(value), updatedByAdminId: adminUserId },
    create: { key, value: String(value), updatedByAdminId: adminUserId },
  });
}

module.exports = { getSetting, getAllSettings, updateSetting };
