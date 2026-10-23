import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './ui/theme.css'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root mancante')
document.body.classList.add('ui-root')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
