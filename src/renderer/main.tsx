import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTheme } from 'packforge-ui'
import 'packforge-ui/styles.css'
import { App } from './App'
import './ui/theme.css'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root mancante')
document.body.classList.add('ui-root')
// packforge-ui (Phase 22): the components moved to the framework take its Minecraft theme.
applyTheme('minecraft')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
