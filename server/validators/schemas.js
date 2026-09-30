const { z } = require('zod');

const phone = z.string().min(10, 'Enter a valid phone number').max(15);
const pin = z.string().min(4, 'PIN/password must be at least 4 characters');

const registerBetterSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  phone,
  pin,
});

const registerBoardmanSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  phone,
  pin,
  businessLocation: z.string().min(2, 'Location is required'),
  kycDocumentUrl: z.string().url().optional(),
});

const loginSchema = z.object({ phone, pin });

const otpRequestSchema = z.object({
  phone,
  purpose: z.enum(['SIGNUP', 'BANK_ACCOUNT_CHANGE']),
});

const otpVerifySchema = z.object({
  phone,
  purpose: z.enum(['SIGNUP', 'BANK_ACCOUNT_CHANGE']),
  code: z.string().length(6, 'Enter the 6-digit code'),
});

const kycVerifySchema = z.object({
  idType: z.enum(['BVN', 'NIN']),
  value: z.string().length(11, 'BVN/NIN must be 11 digits').regex(/^\d+$/, 'Digits only'),
});

const demoDepositSchema = z.object({ amount: z.number().positive() });

const paystackInitializeSchema = z.object({ amount: z.number().positive() });

const withdrawalSchema = z.object({
  amount: z.number().positive(),
  destination: z.object({
    bankName: z.string().min(2),
    accountNumber: z.string().min(6),
    accountName: z.string().min(2),
  }),
});

const createCompetitionSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  category: z.enum(['FOOTBALL', 'SNOOKER', 'FIGHT', 'TABLE_GAME', 'OTHER']),
  bettingDeadline: z.string().datetime().or(z.string()),
  participants: z.array(z.string()).optional(),
  options: z.array(z.string()).min(2, 'At least two betting options are required'),
});

const placeBetSchema = z.object({
  betOptionId: z.string().min(1),
  stake: z.number().positive(),
});

const submitResultSchema = z.object({
  winningOptionId: z.string().min(1),
  finalScore: z.string().optional(),
  evidenceUrls: z.array(z.string().url()).optional(),
  notes: z.string().optional(),
});

const raiseDisputeSchema = z.object({ reason: z.string().min(5, 'Please explain the issue') });

const resolveDisputeSchema = z.object({
  action: z.enum(['CONFIRM', 'CANCEL']),
  winningOptionId: z.string().optional(),
});

const updateSettingsSchema = z.object({
  boardmanCommissionRate: z.number().min(0).max(1).optional(),
  platformCommissionRate: z.number().min(0).max(1).optional(),
  resultConfirmationWindowHours: z.number().min(0).optional(),
});

module.exports = {
  registerBetterSchema,
  registerBoardmanSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  kycVerifySchema,
  demoDepositSchema,
  paystackInitializeSchema,
  withdrawalSchema,
  createCompetitionSchema,
  placeBetSchema,
  submitResultSchema,
  raiseDisputeSchema,
  resolveDisputeSchema,
  updateSettingsSchema,
};
