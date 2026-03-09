export function isProFromState(state: any): boolean {
  return (
    !!state?.proAllowed &&
    !!state?.license?.licenseKey &&
    !!state?.license?.instanceId &&
    state?.license?.paidStatus === 'active'
  )
}
