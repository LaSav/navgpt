import { startContentApp } from './content/bootstrap'
import { captureAndScrubIncomingLicense } from './content/license'

captureAndScrubIncomingLicense().catch(() => {
  // no-op
})

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startContentApp)
} else {
  startContentApp()
}
