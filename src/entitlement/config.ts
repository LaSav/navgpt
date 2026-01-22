export const ENTITLEMENT = {
  trialDays: 14,
  graceDays: 30,
  validateEveryDays: 7,
  validateJitterHours: 24,
  courtesyHoursOnExpiry: 0,
} as const

// direct Lemon; or replace with your proxy origin:
export const LICENSE_API_BASE = 'https://api.lemonsqueezy.com'
