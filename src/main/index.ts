import { app, BrowserWindow, ipcMain, globalShortcut, Menu } from 'electron';
import * as path from 'path';
import { APP_NAME, WINDOW_CONFIG } from '@shared/constants';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: WINDOW_CONFIG.defaultWidth,
    height: WINDOW_CONFIG.defaultHeight,
    minWidth: WINDOW_CONFIG.minWidth,
    minHeight: WINDOW_CONFIG.minHeight,
    title: APP_NAME,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the renderer
  const rendererPath = path.join(__dirname, '../renderer/index.html');
  void mainWindow.loadFile(rendererPath);

  // Setup menu with keyboard shortcuts
  setupMenu();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tile (Split Vertical)',
          accelerator: 'CmdOrCtrl+D',
          click: () => sendToRenderer('split-vertical'),
        },
        {
          label: 'New Tile (Split Horizontal)',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => sendToRenderer('split-horizontal'),
        },
        { type: 'separator' },
        {
          label: 'Close Tile',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => sendToRenderer('close-tile'),
        },
        { type: 'separator' },
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow?.close(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Focus URL Bar',
          accelerator: 'CmdOrCtrl+L',
          click: () => sendToRenderer('focus-url-bar'),
        },
        { type: 'separator' },
        {
          label: 'Reload Tile',
          accelerator: 'CmdOrCtrl+R',
          click: () => sendToRenderer('reload-tile'),
        },
        { type: 'separator' },
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Tiles',
      submenu: [
        {
          label: 'Focus Left',
          accelerator: 'Alt+H',
          click: () => sendToRenderer('focus-left'),
        },
        {
          label: 'Focus Down',
          accelerator: 'Alt+J',
          click: () => sendToRenderer('focus-down'),
        },
        {
          label: 'Focus Up',
          accelerator: 'Alt+K',
          click: () => sendToRenderer('focus-up'),
        },
        {
          label: 'Focus Right',
          accelerator: 'Alt+L',
          click: () => sendToRenderer('focus-right'),
        },
        { type: 'separator' },
        {
          label: 'Swap Left',
          accelerator: 'Alt+Shift+H',
          click: () => sendToRenderer('swap-left'),
        },
        {
          label: 'Swap Down',
          accelerator: 'Alt+Shift+J',
          click: () => sendToRenderer('swap-down'),
        },
        {
          label: 'Swap Up',
          accelerator: 'Alt+Shift+K',
          click: () => sendToRenderer('swap-up'),
        },
        {
          label: 'Swap Right',
          accelerator: 'Alt+Shift+L',
          click: () => sendToRenderer('swap-right'),
        },
        { type: 'separator' },
        {
          label: 'Grow Tile',
          accelerator: 'CmdOrCtrl+]',
          click: () => sendToRenderer('resize-grow'),
        },
        {
          label: 'Shrink Tile',
          accelerator: 'CmdOrCtrl+[',
          click: () => sendToRenderer('resize-shrink'),
        },
      ],
    },
    {
      label: 'Navigate',
      submenu: [
        {
          label: 'Back',
          accelerator: 'Alt+Left',
          click: () => sendToRenderer('go-back'),
        },
        {
          label: 'Forward',
          accelerator: 'Alt+Right',
          click: () => sendToRenderer('go-forward'),
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// IPC handlers
ipcMain.handle('get-window-bounds', () => {
  if (!mainWindow) return { width: 800, height: 600 };
  const size = mainWindow.getContentSize();
  return { width: size[0] ?? 800, height: size[1] ?? 600 };
});

// App lifecycle
void app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
