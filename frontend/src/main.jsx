import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applySettings, loadSettings } from './utils/accessibility.js'

// Restore saved accessibility settings before first render
applySettings(loadSettings());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
