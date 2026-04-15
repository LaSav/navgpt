import { startContentApp } from './content/bootstrap'

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startContentApp)
} else {
  startContentApp()
}
