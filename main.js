const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 780,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#f3f5f8',
    title: 'Stylo',
    icon: path.join(__dirname, 'icons', 'icon-512.png'),
    webPreferences: { contextIsolation: true, sandbox: true },
  });

  win.loadFile('index.html');

  // Open any outside links in the normal browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Windows and Linux: no menu bar. Mac keeps its menu so copy, paste and quit work.
if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
