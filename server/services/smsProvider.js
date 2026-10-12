const axios = require('axios');
const AppError = require('../utils/appError');
const env = require('../config/env');
const logger = require('../utils/logger');

// SMS through Termii (FEAT-014/041). Same rule as the other vendors:
// with TERMII_API_KEY set, messages really go out; DEMO without a key logs
// them instead; PRODUCTION without a key fails loudly (501) rather than
// pretending an OTP was delivered.
const http = axios.create({ timeout: 10000 });

// Termii wants international format without '+': 08031234567 -> 2348031234567.
function toInternational(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `234${digits.slice(1)}`;
  return digits;
}

// `dnd` reaches numbers on Do-Not-Disturb (most Nigerian lines) and is
// what OTPs need; ordinary notifications use the cheaper `generic` route.
async function sendSms(phone, message, { channel = 'generic' } = {}) {
  if (!env.termii.apiKey) {
    if (env.appMode === 'PRODUCTION') {
      throw new AppError('No SMS provider is configured (set TERMII_API_KEY) — cannot send SMS', 501);
    }
    logger.info({ event: 'demo_sms', phone, channel, length: message.length }, '[DEMO SMS] not sent: no TERMII_API_KEY');
    return { success: true, provider: 'demo-console' };
  }
  try {
    const { data } = await http.post(`${env.termii.baseUrl}/api/sms/send`, {
      api_key: env.termii.apiKey,
      to: toInternational(phone),
      from: env.termii.senderId,
      sms: message,
      type: 'plain',
      channel,
    });
    return { success: true, provider: 'termii', messageId: data.message_id };
  } catch (err) {
    // Never include the request (it carries the API key) in the error.
    const reason = err.response?.data?.message || err.message;
    throw new AppError(`Termii rejected the SMS: ${reason}`, 502);
  }
}

async function sendOtp(phone, code) {
  if (!env.termii.apiKey && env.appMode !== 'PRODUCTION') {
    // Code only ever reaches logs in DEMO mode without a provider.
    logger.info({ event: 'demo_sms_otp', phone, code }, '[DEMO SMS] OTP issued');
    return { success: true, provider: 'demo-console' };
  }
  return sendSms(phone, `Your StreetBoardman code is ${code}. It expires in 10 minutes. Never share it.`, { channel: 'dnd' });
}

module.exports = { sendOtp, sendSms, toInternational };
