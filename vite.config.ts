import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' : indispensable pour que l'appli marche en .exe (file://) et dans l'APK
export default defineConfig({
  base: './',
  plugins: [react()],
})
