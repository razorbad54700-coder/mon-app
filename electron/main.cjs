const { app, BrowserWindow, shell, session, desktopCapturer, ipcMain } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#0b0b14',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.cjs') },
  })

  // Les liens externes s'ouvrent dans le navigateur
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

let chosenSource = null
ipcMain.handle('screen:sources', async () => {
  const list = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } })
  return list.map((s) => ({ id: s.id, name: s.name, thumb: s.thumbnail.toDataURL() }))
})
ipcMain.handle('screen:set', (_e, id) => {
  chosenSource = String(id)
})

app.whenReady().then(() => {
  // Partage d'écran : on utilise la source choisie dans l'appli (son système inclus sous Windows)
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const list = await desktopCapturer.getSources({ types: ['screen', 'window'] })
    const src = list.find((s) => s.id === chosenSource) || list[0]
    if (!src) return callback({})
    callback({ video: src, audio: 'loopback' })
  })
  // Autorise seulement le micro et la caméra (pour le vocal)
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media' || permission === 'display-capture')
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
