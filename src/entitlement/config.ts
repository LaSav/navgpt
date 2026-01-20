export const ENTITLEMENT = {
  trialDays: 14,
  graceDays: 30,
  validateEveryDays: 7,
  validateJitterHours: 24,
  courtesyHoursOnExpiry: 0, // set e.g. 48 if you want a courtesy window
} as const

// Choose ONE:
// 1) Direct Lemon calls from service worker (no proxy needed):
export const LICENSE_API_BASE = 'https://api.lemonsqueezy.com'

// 2) Or set to your proxy origin (recommended if you want rate-limits/logging):
// export const LICENSE_API_BASE = "https://YOUR_PROXY_ORIGIN";
