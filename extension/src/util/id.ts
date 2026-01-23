export const uid = (() => {
  let i = 0
  return (prefix = 'node') =>
    `${prefix}-${Date.now().toString(36)}-${(i++).toString(36)}`
})()
