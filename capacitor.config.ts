import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.monapp.messagerie',
  appName: 'MonApp',
  webDir: 'dist',
  server: {
    // Permet de se connecter à un serveur en http:// (ton PC) depuis l'appli Android
    androidScheme: 'http',
    cleartext: true,
  },
}

export default config
