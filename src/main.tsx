import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyPrefs } from './lib/prefs'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import './index.css'

// HashRouter : nécessaire pour que les pages marchent en .exe (file://) et dans l'APK
applyPrefs()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>
)
