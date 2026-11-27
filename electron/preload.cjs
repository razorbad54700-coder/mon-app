const { contextBridge, ipcRenderer } = require('electron')
// Petit pont sécurisé : l'appli peut lister les écrans/fenêtres et choisir celui à partager
contextBridge.exposeInMainWorld('monappDesktop', {
  getSources: () => ipcRenderer.invoke('screen:sources'),
  setSource: (id) => ipcRenderer.invoke('screen:set', id),
})
