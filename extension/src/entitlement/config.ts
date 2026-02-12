export const ENTITLEMENT = {
  trialDays: 14,
  graceDays: 30,
  validateEveryDays: 2,
  validateJitterHours: 24,
  courtesyHoursOnExpiry: 0,
} as const

export const LICENSE_API_BASE =
  'https://navgpt-license-proxy.navgpt.workers.dev'
